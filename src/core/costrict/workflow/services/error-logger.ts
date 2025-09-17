import * as vscode from "vscode"
import { CoworkflowError, ErrorLevel, ErrorCategory } from "../types/errors"

/**
 * 错误日志条目接口
 */
export interface ErrorLogEntry {
	/** 日志ID */
	id: string
	/** 时间戳 */
	timestamp: Date
	/** 错误级别 */
	level: ErrorLevel
	/** 错误类别 */
	category: ErrorCategory
	/** 错误消息 */
	message: string
	/** 错误详情 */
	details?: string
	/** 错误堆栈 */
	stack?: string
	/** 错误上下文 */
	context?: Record<string, unknown>
	/** 文件路径 */
	filePath?: string
	/** 行号 */
	lineNumber?: number
	/** 组件名称 */
	component?: string
	/** 操作名称 */
	operation?: string
	/** 是否已解决 */
	resolved: boolean
	/** 解决时间 */
	resolvedAt?: Date
	/** 解决方案 */
	resolution?: string
}

/**
 * 日志级别配置
 */
export interface LogLevelConfig {
	/** 控制台日志级别 */
	console: ErrorLevel
	/** 文件日志级别 */
	file: ErrorLevel
	/** 输出面板日志级别 */
	output: ErrorLevel
	/** 通知级别 */
	notification: ErrorLevel
}

/**
 * 日志轮转配置
 */
export interface LogRotationConfig {
	/** 最大文件大小（字节） */
	maxFileSize: number
	/** 最大文件数量 */
	maxFiles: number
	/** 轮转间隔（毫秒） */
	rotationInterval: number
}

/**
 * 错误日志记录器配置
 */
export interface ErrorLoggerConfig {
	/** 日志级别配置 */
	logLevels: LogLevelConfig
	/** 日志轮转配置 */
	rotation: LogRotationConfig
	/** 是否启用日志轮转 */
	enableRotation: boolean
	/** 是否启用结构化日志 */
	enableStructuredLogging: boolean
	/** 是否启用错误聚合 */
	enableErrorAggregation: boolean
	/** 错误聚合时间窗口（毫秒） */
	aggregationWindow: number
	/** 最大日志条目数 */
	maxLogEntries: number
}

/**
 * 错误聚合统计
 */
export interface ErrorAggregationStats {
	/** 错误类型 */
	errorType: string
	/** 错误消息 */
	message: string
	/** 发生次数 */
	count: number
	/** 首次发生时间 */
	firstOccurrence: Date
	/** 最后发生时间 */
	lastOccurrence: Date
	/** 影响的文件 */
	affectedFiles: Set<string>
	/** 影响的组件 */
	affectedComponents: Set<string>
}

/**
 * Coworkflow错误日志记录器
 *
 * 提供统一的错误日志记录功能，包括：
 * - 多级别日志记录
 * - 日志轮转和管理
 * - 错误聚合和统计
 * - 结构化日志输出
 * - 多目标日志输出（控制台、文件、输出面板）
 */
export class CoworkflowErrorLogger implements vscode.Disposable {
	private readonly config: ErrorLoggerConfig
	private readonly outputChannel: vscode.OutputChannel
	private readonly logEntries: Map<string, ErrorLogEntry> = new Map()
	private readonly errorStats: Map<string, ErrorAggregationStats> = new Map()
	private rotationTimer?: NodeJS.Timeout
	private cleanupTimer?: NodeJS.Timeout
	private isDisposed = false

	constructor(config: Partial<ErrorLoggerConfig> = {}) {
		this.config = {
			logLevels: {
				console: ErrorLevel.INFO,
				file: ErrorLevel.INFO,
				output: ErrorLevel.INFO,
				notification: ErrorLevel.ERROR,
				...config.logLevels,
			},
			rotation: {
				maxFileSize: 10 * 1024 * 1024, // 10MB
				maxFiles: 5,
				rotationInterval: 24 * 60 * 60 * 1000, // 24小时
				...config.rotation,
			},
			enableRotation: true,
			enableStructuredLogging: true,
			enableErrorAggregation: true,
			aggregationWindow: 5 * 60 * 1000, // 5分钟
			maxLogEntries: 1000,
			...config,
		}

		this.outputChannel = vscode.window.createOutputChannel("Coworkflow Error Log")

		this.startRotationTimer()
		this.startCleanupTimer()
	}

	/**
	 * 记录错误
	 */
	logError(
		error: CoworkflowError | Error,
		context?: {
			filePath?: string
			lineNumber?: number
			component?: string
			operation?: string
			additionalContext?: Record<string, unknown>
		},
	): void {
		if (this.isDisposed) {
			return
		}

		const logEntry = this.createLogEntry(error, context)
		this.logEntries.set(logEntry.id, logEntry)

		// 错误聚合
		if (this.config.enableErrorAggregation) {
			this.aggregateError(logEntry)
		}

		// 多目标输出
		this.outputToConsole(logEntry)
		this.outputToFile(logEntry)
		this.outputToPanel(logEntry)
		this.showNotification(logEntry)

		// 清理旧日志
		this.cleanupOldEntries()
	}

	/**
	 * 记录信息
	 */
	logInfo(
		message: string,
		context?: {
			filePath?: string
			component?: string
			operation?: string
			additionalContext?: Record<string, unknown>
		},
	): void {
		if (this.isDisposed) {
			return
		}

		const error = new Error(message)
		error.name = "INFO"
		this.logError(error, context)
	}

	/**
	 * 记录警告
	 */
	logWarning(
		message: string,
		context?: {
			filePath?: string
			component?: string
			operation?: string
			additionalContext?: Record<string, unknown>
		},
	): void {
		if (this.isDisposed) {
			return
		}

		const error = new Error(message)
		error.name = "WARNING"
		this.logError(error, context)
	}

	/**
	 * 标记错误为已解决
	 */
	resolveError(errorId: string, resolution?: string): void {
		const entry = this.logEntries.get(errorId)
		if (entry && !entry.resolved) {
			entry.resolved = true
			entry.resolvedAt = new Date()
			entry.resolution = resolution

			this.logInfo(`错误已解决: ${entry.message}`, {
				component: "ErrorLogger",
				operation: "resolveError",
				additionalContext: { errorId, resolution },
			})
		}
	}

	/**
	 * 获取错误日志
	 */
	getErrorLogs(filter?: {
		level?: ErrorLevel
		category?: ErrorCategory
		component?: string
		resolved?: boolean
		startTime?: Date
		endTime?: Date
	}): ErrorLogEntry[] {
		let entries = Array.from(this.logEntries.values())

		if (filter) {
			if (filter.level) {
				entries = entries.filter((entry) => entry.level === filter.level)
			}
			if (filter.category) {
				entries = entries.filter((entry) => entry.category === filter.category)
			}
			if (filter.component) {
				entries = entries.filter((entry) => entry.component === filter.component)
			}
			if (filter.resolved !== undefined) {
				entries = entries.filter((entry) => entry.resolved === filter.resolved)
			}
			if (filter.startTime) {
				entries = entries.filter((entry) => entry.timestamp >= filter.startTime!)
			}
			if (filter.endTime) {
				entries = entries.filter((entry) => entry.timestamp <= filter.endTime!)
			}
		}

		return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
	}

	/**
	 * 获取错误统计
	 */
	getErrorStats(): ErrorAggregationStats[] {
		return Array.from(this.errorStats.values()).sort(
			(a, b) => b.lastOccurrence.getTime() - a.lastOccurrence.getTime(),
		)
	}

	/**
	 * 清除所有日志
	 */
	clearLogs(): void {
		this.logEntries.clear()
		this.errorStats.clear()
		this.outputChannel.clear()

		this.logInfo("错误日志已清除", {
			component: "ErrorLogger",
			operation: "clearLogs",
		})
	}

	/**
	 * 导出日志
	 */
	exportLogs(format: "json" | "csv" = "json"): string {
		const entries = this.getErrorLogs()

		if (format === "json") {
			return JSON.stringify(entries, null, 2)
		} else if (format === "csv") {
			const headers = [
				"id",
				"timestamp",
				"level",
				"category",
				"message",
				"details",
				"filePath",
				"lineNumber",
				"component",
				"operation",
				"resolved",
			]

			const rows = entries.map((entry) => [
				entry.id,
				entry.timestamp.toISOString(),
				entry.level,
				entry.category,
				`"${entry.message.replace(/"/g, '""')}"`,
				`"${(entry.details || "").replace(/"/g, '""')}"`,
				entry.filePath || "",
				entry.lineNumber?.toString() || "",
				entry.component || "",
				entry.operation || "",
				entry.resolved.toString(),
			])

			return [headers, ...rows].map((row) => row.join(",")).join("\n")
		}

		return ""
	}

	/**
	 * 显示输出面板
	 */
	showOutputPanel(): void {
		this.outputChannel.show()
	}

	/**
	 * 创建日志条目
	 */
	private createLogEntry(
		error: CoworkflowError | Error,
		context?: {
			filePath?: string
			lineNumber?: number
			component?: string
			operation?: string
			additionalContext?: Record<string, unknown>
		},
	): ErrorLogEntry {
		const isCoworkflowError = error instanceof CoworkflowError

		return {
			id: this.generateLogId(),
			timestamp: new Date(),
			level: isCoworkflowError ? error.level : ErrorLevel.ERROR,
			category: isCoworkflowError ? error.category : ErrorCategory.UNKNOWN,
			message: error.message,
			details: isCoworkflowError ? error.getDetails() : undefined,
			stack: error.stack,
			context: context?.additionalContext,
			filePath: context?.filePath,
			lineNumber: context?.lineNumber,
			component: context?.component,
			operation: context?.operation,
			resolved: false,
		}
	}

	/**
	 * 生成日志ID
	 */
	private generateLogId(): string {
		return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}

	/**
	 * 聚合错误
	 */
	private aggregateError(entry: ErrorLogEntry): void {
		const key = `${entry.level}:${entry.category}:${entry.message}`
		let stats = this.errorStats.get(key)

		if (!stats) {
			stats = {
				errorType: entry.category,
				message: entry.message,
				count: 0,
				firstOccurrence: entry.timestamp,
				lastOccurrence: entry.timestamp,
				affectedFiles: new Set(),
				affectedComponents: new Set(),
			}
			this.errorStats.set(key, stats)
		}

		stats.count++
		stats.lastOccurrence = entry.timestamp

		if (entry.filePath) {
			stats.affectedFiles.add(entry.filePath)
		}
		if (entry.component) {
			stats.affectedComponents.add(entry.component)
		}
	}

	/**
	 * 输出到控制台
	 */
	private outputToConsole(entry: ErrorLogEntry): void {
		if (entry.level < this.config.logLevels.console) {
			return
		}

		const message = this.formatLogMessage(entry)

		switch (entry.level) {
			case ErrorLevel.INFO:
				console.info(message)
				break
			case ErrorLevel.WARNING:
				console.warn(message)
				break
			case ErrorLevel.ERROR:
			case ErrorLevel.CRITICAL:
				console.error(message)
				break
		}
	}

	/**
	 * 输出到文件
	 */
	private outputToFile(entry: ErrorLogEntry): void {
		if (entry.level < this.config.logLevels.file) {
			return
		}

		// TODO: 实现文件日志输出
		// 这里需要实现文件写入和日志轮转逻辑
	}

	/**
	 * 输出到面板
	 */
	private outputToPanel(entry: ErrorLogEntry): void {
		if (entry.level < this.config.logLevels.output) {
			return
		}

		const message = this.formatLogMessage(entry)
		this.outputChannel.appendLine(message)
	}

	/**
	 * 显示通知
	 */
	private showNotification(entry: ErrorLogEntry): void {
		if (entry.level < this.config.logLevels.notification) {
			return
		}

		const message = `[${entry.category}] ${entry.message}`

		switch (entry.level) {
			case ErrorLevel.WARNING:
				vscode.window.showWarningMessage(message)
				break
			case ErrorLevel.ERROR:
				vscode.window.showErrorMessage(message)
				break
			case ErrorLevel.CRITICAL:
				vscode.window.showErrorMessage(message, "查看详情").then((selection) => {
					if (selection === "查看详情") {
						this.showOutputPanel()
					}
				})
				break
		}
	}

	/**
	 * 格式化日志消息
	 */
	private formatLogMessage(entry: ErrorLogEntry): string {
		if (this.config.enableStructuredLogging) {
			return JSON.stringify({
				timestamp: entry.timestamp.toISOString(),
				level: entry.level,
				category: entry.category,
				message: entry.message,
				details: entry.details,
				component: entry.component,
				operation: entry.operation,
				filePath: entry.filePath,
				lineNumber: entry.lineNumber,
			})
		} else {
			const parts = [`[${entry.timestamp.toISOString()}]`, `[${entry.level}]`, `[${entry.category}]`]

			if (entry.component) {
				parts.push(`[${entry.component}]`)
			}

			if (entry.operation) {
				parts.push(`[${entry.operation}]`)
			}

			parts.push(entry.message)

			if (entry.filePath) {
				parts.push(`(${entry.filePath}:${entry.lineNumber || 0})`)
			}

			return parts.join(" ")
		}
	}

	/**
	 * 清理旧日志条目
	 */
	private cleanupOldEntries(): void {
		if (this.logEntries.size > this.config.maxLogEntries) {
			const entries = Array.from(this.logEntries.values()).sort(
				(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
			)

			const toRemove = entries.slice(0, this.logEntries.size - this.config.maxLogEntries)
			toRemove.forEach((entry) => this.logEntries.delete(entry.id))
		}
	}

	/**
	 * 启动轮转定时器
	 */
	private startRotationTimer(): void {
		if (this.config.enableRotation) {
			this.rotationTimer = setInterval(() => {
				this.rotateLogs()
			}, this.config.rotation.rotationInterval)
		}
	}

	/**
	 * 启动清理定时器
	 */
	private startCleanupTimer(): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanupOldEntries()
		}, 60 * 1000) // 每分钟清理一次
	}

	/**
	 * 轮转日志
	 */
	private rotateLogs(): void {
		// TODO: 实现日志轮转逻辑
		// 这里需要实现文件轮转和清理逻辑
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.isDisposed = true

		if (this.rotationTimer) {
			clearInterval(this.rotationTimer)
		}

		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer)
		}

		this.outputChannel.dispose()
	}
}

/**
 * 创建错误日志记录器实例
 */
export const createErrorLogger = (config?: Partial<ErrorLoggerConfig>) => {
	return new CoworkflowErrorLogger(config)
}
