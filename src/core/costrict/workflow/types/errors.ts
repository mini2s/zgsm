/**
 * Coworkflow 错误类型定义
 * 定义了与 .coworkflow Markdown 文件支持相关的所有错误类型
 */

import * as vscode from "vscode"

/**
 * 错误级别枚举
 */
export enum ErrorLevel {
	/** 信息级别 */
	INFO = "info",
	/** 警告级别 */
	WARNING = "warning",
	/** 错误级别 */
	ERROR = "error",
	/** 严重错误级别 */
	CRITICAL = "critical",
}

/**
 * 错误类别枚举
 */
export enum ErrorCategory {
	/** 文件系统错误 */
	FILE_SYSTEM = "file-system",
	/** 解析错误 */
	PARSING = "parsing",
	/** 提供者错误 */
	PROVIDER = "provider",
	/** 命令错误 */
	COMMAND = "command",
	/** 配置错误 */
	CONFIGURATION = "configuration",
	/** 网络错误 */
	NETWORK = "network",
	/** 未知错误 */
	UNKNOWN = "unknown",
}

/**
 * 错误恢复策略枚举
 */
export enum RecoveryStrategy {
	/** 无恢复策略 */
	NONE = "none",
	/** 重试 */
	RETRY = "retry",
	/** 回退到默认值 */
	FALLBACK = "fallback",
	/** 跳过并继续 */
	SKIP = "skip",
	/** 降级处理 */
	DEGRADE = "degrade",
	/** 重新初始化 */
	REINITIALIZE = "reinitialize",
}

/**
 * 错误上下文接口
 */
export interface ErrorContext {
	/** 错误发生的时间戳 */
	timestamp: Date
	/** 错误发生的文件 URI */
	uri?: vscode.Uri
	/** 错误发生的行号 */
	line?: number
	/** 错误发生的列号 */
	column?: number
	/** 相关的组件名称 */
	component?: string
	/** 相关的操作名称 */
	operation?: string
	/** 附加的上下文数据 */
	data?: Record<string, any>
}

/**
 * Coworkflow 基础错误类
 */
export class CoworkflowError extends Error {
	/** 错误级别 */
	public readonly level: ErrorLevel
	/** 错误类别 */
	public readonly category: ErrorCategory
	/** 错误上下文 */
	public readonly context: ErrorContext
	/** 恢复策略 */
	public readonly recoveryStrategy: RecoveryStrategy
	/** 是否可恢复 */
	public readonly recoverable: boolean
	/** 内部错误 */
	public readonly innerError?: Error

	constructor(
		message: string,
		level: ErrorLevel = ErrorLevel.ERROR,
		category: ErrorCategory = ErrorCategory.UNKNOWN,
		context: Partial<ErrorContext> = {},
		recoveryStrategy: RecoveryStrategy = RecoveryStrategy.NONE,
		recoverable: boolean = false,
		innerError?: Error,
	) {
		super(message)
		this.name = this.constructor.name
		this.level = level
		this.category = category
		this.context = {
			timestamp: new Date(),
			...context,
		}
		this.recoveryStrategy = recoveryStrategy
		this.recoverable = recoverable
		this.innerError = innerError

		// 确保原型链正确
		Object.setPrototypeOf(this, new.target.prototype)
	}

	/**
	 * 获取错误详情
	 */
	getDetails(): string {
		const details = [
			`Level: ${this.level}`,
			`Category: ${this.category}`,
			`Recoverable: ${this.recoverable}`,
			`Recovery Strategy: ${this.recoveryStrategy}`,
			`Timestamp: ${this.context.timestamp.toISOString()}`,
		]

		if (this.context.uri) {
			details.push(`File: ${this.context.uri.fsPath}`)
		}

		if (this.context.line !== undefined) {
			details.push(`Line: ${this.context.line}`)
		}

		if (this.context.column !== undefined) {
			details.push(`Column: ${this.context.column}`)
		}

		if (this.context.component) {
			details.push(`Component: ${this.context.component}`)
		}

		if (this.context.operation) {
			details.push(`Operation: ${this.context.operation}`)
		}

		return details.join("\n")
	}

	/**
	 * 转换为 JSON 对象
	 */
	toJSON(): Record<string, any> {
		return {
			name: this.name,
			message: this.message,
			stack: this.stack,
			level: this.level,
			category: this.category,
			context: this.context,
			recoveryStrategy: this.recoveryStrategy,
			recoverable: this.recoverable,
			innerError: this.innerError
				? {
						name: this.innerError.name,
						message: this.innerError.message,
						stack: this.innerError.stack,
					}
				: undefined,
		}
	}
}

/**
 * 文件系统错误类
 */
export class FileSystemError extends CoworkflowError {
	constructor(
		message: string,
		context: Partial<ErrorContext> = {},
		recoveryStrategy: RecoveryStrategy = RecoveryStrategy.FALLBACK,
		innerError?: Error,
	) {
		super(message, ErrorLevel.ERROR, ErrorCategory.FILE_SYSTEM, context, recoveryStrategy, true, innerError)
	}
}

/**
 * 解析错误类
 */
export class ParsingError extends CoworkflowError {
	/** 解析失败的行内容 */
	public readonly lineContent?: string

	constructor(
		message: string,
		context: Partial<ErrorContext> = {},
		lineContent?: string,
		recoveryStrategy: RecoveryStrategy = RecoveryStrategy.FALLBACK,
		innerError?: Error,
	) {
		super(message, ErrorLevel.WARNING, ErrorCategory.PARSING, context, recoveryStrategy, true, innerError)
		this.lineContent = lineContent
	}

	/**
	 * 获取错误详情
	 */
	override getDetails(): string {
		const details = super.getDetails()
		if (this.lineContent) {
			return `${details}\nLine Content: ${this.lineContent}`
		}
		return details
	}
}

/**
 * 提供者错误类
 */
export class ProviderError extends CoworkflowError {
	/** 提供者类型 */
	public readonly providerType: string

	constructor(
		message: string,
		providerType: string,
		context: Partial<ErrorContext> = {},
		recoveryStrategy: RecoveryStrategy = RecoveryStrategy.RETRY,
		innerError?: Error,
	) {
		super(message, ErrorLevel.WARNING, ErrorCategory.PROVIDER, context, recoveryStrategy, true, innerError)
		this.providerType = providerType
	}

	/**
	 * 获取错误详情
	 */
	override getDetails(): string {
		const details = super.getDetails()
		return `${details}\nProvider Type: ${this.providerType}`
	}
}

/**
 * 命令错误类
 */
export class CommandError extends CoworkflowError {
	/** 命令名称 */
	public readonly commandName: string

	constructor(
		message: string,
		commandName: string,
		context: Partial<ErrorContext> = {},
		recoveryStrategy: RecoveryStrategy = RecoveryStrategy.SKIP,
		innerError?: Error,
	) {
		super(message, ErrorLevel.ERROR, ErrorCategory.COMMAND, context, recoveryStrategy, true, innerError)
		this.commandName = commandName
	}

	/**
	 * 获取错误详情
	 */
	override getDetails(): string {
		const details = super.getDetails()
		return `${details}\nCommand: ${this.commandName}`
	}
}

/**
 * 配置错误类
 */
export class ConfigurationError extends CoworkflowError {
	/** 配置键名 */
	public readonly configKey?: string

	constructor(
		message: string,
		context: Partial<ErrorContext> = {},
		configKey?: string,
		recoveryStrategy: RecoveryStrategy = RecoveryStrategy.FALLBACK,
		innerError?: Error,
	) {
		super(message, ErrorLevel.WARNING, ErrorCategory.CONFIGURATION, context, recoveryStrategy, true, innerError)
		this.configKey = configKey
	}

	/**
	 * 获取错误详情
	 */
	override getDetails(): string {
		const details = super.getDetails()
		if (this.configKey) {
			return `${details}\nConfig Key: ${this.configKey}`
		}
		return details
	}
}

/**
 * 网络错误类
 */
export class NetworkError extends CoworkflowError {
	/** 请求 URL */
	public readonly url?: string

	constructor(
		message: string,
		context: Partial<ErrorContext> = {},
		url?: string,
		recoveryStrategy: RecoveryStrategy = RecoveryStrategy.RETRY,
		innerError?: Error,
	) {
		super(message, ErrorLevel.WARNING, ErrorCategory.NETWORK, context, recoveryStrategy, true, innerError)
		this.url = url
	}

	/**
	 * 获取错误详情
	 */
	override getDetails(): string {
		const details = super.getDetails()
		if (this.url) {
			return `${details}\nURL: ${this.url}`
		}
		return details
	}
}

/**
 * 错误处理器接口
 */
export interface ErrorHandler {
	/**
	 * 处理错误
	 */
	handleError(error: CoworkflowError): Promise<void>

	/**
	 * 检查是否可以处理指定类型的错误
	 */
	canHandle(error: CoworkflowError): boolean
}

/**
 * 错误恢复器接口
 */
export interface ErrorRecoverer {
	/**
	 * 尝试恢复错误
	 */
	recover(error: CoworkflowError): Promise<boolean>

	/**
	 * 检查是否可以恢复指定类型的错误
	 */
	canRecover(error: CoworkflowError): boolean
}

/**
 * 错误通知选项接口
 */
export interface ErrorNotificationOptions {
	/** 是否显示给用户 */
	showToUser?: boolean
	/** 是否记录到日志 */
	logToConsole?: boolean
	/** 是否显示详细信息 */
	showDetails?: boolean
	/** 自定义消息 */
	customMessage?: string
	/** 通知类型 */
	notificationType?: "information" | "warning" | "error"
}

/**
 * 错误统计信息接口
 */
export interface ErrorStatistics {
	/** 总错误数 */
	total: number
	/** 按级别分类的错误数 */
	byLevel: Record<ErrorLevel, number>
	/** 按类别分类的错误数 */
	byCategory: Record<ErrorCategory, number>
	/** 按组件分类的错误数 */
	byComponent: Record<string, number>
	/** 最后错误时间 */
	lastErrorTime?: Date
	/** 最常见错误 */
	mostCommonError?: string
}
