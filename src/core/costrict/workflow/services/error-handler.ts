/**
 * Coworkflow 错误处理服务
 * 提供统一的错误处理、日志记录和恢复机制
 */

import * as vscode from "vscode"
import {
	CoworkflowError,
	ErrorLevel,
	ErrorCategory,
	RecoveryStrategy,
	ErrorHandler,
	ErrorRecoverer,
	ErrorNotificationOptions,
	ErrorStatistics,
	ErrorContext,
} from "../types/errors"

/**
 * 错误处理配置接口
 */
export interface ErrorHandlerConfig {
	/** 是否启用错误日志记录 */
	enableLogging?: boolean
	/** 是否启用用户通知 */
	enableNotifications?: boolean
	/** 是否启用错误恢复 */
	enableRecovery?: boolean
	/** 日志级别 */
	logLevel?: ErrorLevel
	/** 最大重试次数 */
	maxRetries?: number
	/** 错误防抖动时间（毫秒） */
	debounceTime?: number
	/** 是否启用错误统计 */
	enableStatistics?: boolean
}

/**
 * 默认错误处理配置
 */
const DEFAULT_CONFIG: Required<ErrorHandlerConfig> = {
	enableLogging: true,
	enableNotifications: true,
	enableRecovery: true,
	logLevel: ErrorLevel.WARNING,
	maxRetries: 3,
	debounceTime: 1000,
	enableStatistics: true,
}

/**
 * 错误处理服务类
 */
export class CoworkflowErrorHandlerService {
	private config: Required<ErrorHandlerConfig>
	private errorHandlers: Map<ErrorCategory, ErrorHandler[]> = new Map()
	private errorRecoverers: Map<ErrorCategory, ErrorRecoverer[]> = new Map()
	private errorStatistics: ErrorStatistics
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map()
	private outputChannel: vscode.OutputChannel
	private disposables: vscode.Disposable[] = []

	constructor(config: ErrorHandlerConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.errorStatistics = this.initializeStatistics()
		this.outputChannel = vscode.window.createOutputChannel("Coworkflow Errors")
		this.disposables.push(this.outputChannel)
	}

	/**
	 * 初始化错误统计信息
	 */
	private initializeStatistics(): ErrorStatistics {
		return {
			total: 0,
			byLevel: {
				[ErrorLevel.INFO]: 0,
				[ErrorLevel.WARNING]: 0,
				[ErrorLevel.ERROR]: 0,
				[ErrorLevel.CRITICAL]: 0,
			},
			byCategory: {
				[ErrorCategory.FILE_SYSTEM]: 0,
				[ErrorCategory.PARSING]: 0,
				[ErrorCategory.PROVIDER]: 0,
				[ErrorCategory.COMMAND]: 0,
				[ErrorCategory.CONFIGURATION]: 0,
				[ErrorCategory.NETWORK]: 0,
				[ErrorCategory.UNKNOWN]: 0,
			},
			byComponent: {},
		}
	}

	/**
	 * 注册错误处理器
	 */
	registerErrorHandler(category: ErrorCategory, handler: ErrorHandler): void {
		if (!this.errorHandlers.has(category)) {
			this.errorHandlers.set(category, [])
		}
		this.errorHandlers.get(category)!.push(handler)
	}

	/**
	 * 注册错误恢复器
	 */
	registerErrorRecoverer(category: ErrorCategory, recoverer: ErrorRecoverer): void {
		if (!this.errorRecoverers.has(category)) {
			this.errorRecoverers.set(category, [])
		}
		this.errorRecoverers.get(category)!.push(recoverer)
	}

	/**
	 * 处理错误
	 */
	async handleError(error: CoworkflowError, options: ErrorNotificationOptions = {}): Promise<void> {
		try {
			// 更新错误统计
			this.updateErrorStatistics(error)

			// 生成错误唯一标识符
			const errorId = this.generateErrorId(error)

			// 实现防抖动机制
			if (this.debounceTimers.has(errorId)) {
				clearTimeout(this.debounceTimers.get(errorId)!)
			}

			const timer = setTimeout(async () => {
				this.debounceTimers.delete(errorId)
				await this.processError(error, options)
			}, this.config.debounceTime)

			this.debounceTimers.set(errorId, timer)
		} catch (handlingError) {
			// 防止错误处理本身抛出异常
			console.error("Error in error handler:", handlingError)
		}
	}

	/**
	 * 处理错误的核心逻辑
	 */
	private async processError(error: CoworkflowError, options: ErrorNotificationOptions): Promise<void> {
		// 记录错误日志
		if (this.config.enableLogging && error.level >= this.config.logLevel) {
			this.logError(error)
		}

		// 显示用户通知
		if (this.config.enableNotifications && options.showToUser !== false) {
			this.showUserNotification(error, options)
		}

		// 调用错误处理器
		await this.callErrorHandlers(error)

		// 尝试错误恢复
		if (this.config.enableRecovery && error.recoverable) {
			await this.attemptErrorRecovery(error)
		}
	}

	/**
	 * 记录错误日志
	 */
	private logError(error: CoworkflowError): void {
		const timestamp = new Date().toISOString()
		const logMessage = `[${timestamp}] ${error.level.toUpperCase()}: ${error.message}`

		this.outputChannel.appendLine(logMessage)
		this.outputChannel.appendLine(error.getDetails())

		if (error.stack) {
			this.outputChannel.appendLine("Stack Trace:")
			this.outputChannel.appendLine(error.stack)
		}

		this.outputChannel.appendLine("---")

		// 同时输出到控制台
		console.error(logMessage, error)
	}

	/**
	 * 显示用户通知
	 */
	private showUserNotification(error: CoworkflowError, options: ErrorNotificationOptions): void {
		const message = options.customMessage || this.getUserFriendlyMessage(error)
		const notificationType = options.notificationType || this.getNotificationType(error.level)

		switch (notificationType) {
			case "information":
				vscode.window.showInformationMessage(message)
				break
			case "warning":
				vscode.window.showWarningMessage(message)
				break
			case "error":
				vscode.window.showErrorMessage(message)
				break
		}

		// 如果显示详细信息，显示在输出通道
		if (options.showDetails) {
			this.outputChannel.show()
		}
	}

	/**
	 * 获取用户友好的错误消息
	 */
	private getUserFriendlyMessage(error: CoworkflowError): string {
		const baseMessage = error.message

		// 根据错误类别添加恢复建议
		let suggestion = ""
		switch (error.category) {
			case ErrorCategory.FILE_SYSTEM:
				suggestion = "请检查文件权限和磁盘空间。"
				break
			case ErrorCategory.PARSING:
				suggestion = "请检查文件格式是否正确。"
				break
			case ErrorCategory.PROVIDER:
				suggestion = "请尝试重新加载窗口或重启 VS Code。"
				break
			case ErrorCategory.COMMAND:
				suggestion = "请检查命令参数是否正确。"
				break
			case ErrorCategory.CONFIGURATION:
				suggestion = "请检查配置设置。"
				break
			case ErrorCategory.NETWORK:
				suggestion = "请检查网络连接。"
				break
			default:
				suggestion = "请查看详细信息以获取更多帮助。"
		}

		return `${baseMessage} ${suggestion}`
	}

	/**
	 * 获取通知类型
	 */
	private getNotificationType(level: ErrorLevel): "information" | "warning" | "error" {
		switch (level) {
			case ErrorLevel.INFO:
				return "information"
			case ErrorLevel.WARNING:
				return "warning"
			case ErrorLevel.ERROR:
			case ErrorLevel.CRITICAL:
				return "error"
			default:
				return "error"
		}
	}

	/**
	 * 调用错误处理器
	 */
	private async callErrorHandlers(error: CoworkflowError): Promise<void> {
		const handlers = this.errorHandlers.get(error.category) || []

		for (const handler of handlers) {
			try {
				if (handler.canHandle(error)) {
					await handler.handleError(error)
				}
			} catch (handlerError) {
				console.error("Error in error handler:", handlerError)
			}
		}
	}

	/**
	 * 尝试错误恢复
	 */
	private async attemptErrorRecovery(error: CoworkflowError): Promise<boolean> {
		const recoverers = this.errorRecoverers.get(error.category) || []

		for (const recoverer of recoverers) {
			try {
				if (recoverer.canRecover(error)) {
					const recovered = await recoverer.recover(error)
					if (recovered) {
						vscode.window.showInformationMessage(`错误已自动恢复: ${error.message}`)
						return true
					}
				}
			} catch (recoveryError) {
				console.error("Error in error recoverer:", recoveryError)
			}
		}

		return false
	}

	/**
	 * 更新错误统计信息
	 */
	private updateErrorStatistics(error: CoworkflowError): void {
		if (!this.config.enableStatistics) {
			return
		}

		this.errorStatistics.total++
		this.errorStatistics.byLevel[error.level]++
		this.errorStatistics.byCategory[error.category]++
		this.errorStatistics.lastErrorTime = new Date()

		if (error.context.component) {
			const component = error.context.component
			this.errorStatistics.byComponent[component] = (this.errorStatistics.byComponent[component] || 0) + 1
		}

		// 更新最常见错误
		const errorCounts = new Map<string, number>()
		Object.entries(this.errorStatistics.byCategory).forEach(([category, count]) => {
			errorCounts.set(category, count)
		})

		const mostCommon = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1])[0]

		if (mostCommon) {
			this.errorStatistics.mostCommonError = mostCommon[0]
		}
	}

	/**
	 * 生成错误唯一标识符
	 */
	private generateErrorId(error: CoworkflowError): string {
		const keyParts = [error.category, error.message, error.context.component || "", error.context.operation || ""]
		return keyParts.join("|")
	}

	/**
	 * 获取错误统计信息
	 */
	getStatistics(): ErrorStatistics {
		return { ...this.errorStatistics }
	}

	/**
	 * 重置错误统计信息
	 */
	resetStatistics(): void {
		this.errorStatistics = this.initializeStatistics()
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.debounceTimers.forEach((timer) => clearTimeout(timer))
		this.debounceTimers.clear()

		this.disposables.forEach((disposable) => disposable.dispose())
		this.disposables = []

		this.errorHandlers.clear()
		this.errorRecoverers.clear()
	}
}

/**
 * 创建错误处理服务实例
 */
export const createErrorHandler = (config?: ErrorHandlerConfig): CoworkflowErrorHandlerService => {
	return new CoworkflowErrorHandlerService(config)
}
