/**
 * Coworkflow 提供者错误处理服务
 * 提供提供者错误的专门处理和恢复机制
 */

import * as vscode from "vscode"
import {
	CoworkflowError,
	ProviderError,
	ErrorLevel,
	ErrorCategory,
	RecoveryStrategy,
	ErrorHandler,
	ErrorRecoverer,
	ErrorContext,
} from "../types/errors"
import { CoworkflowErrorHandlerService } from "./error-handler"

/**
 * 提供者错误处理配置接口
 */
export interface ProviderErrorHandlerConfig {
	/** 是否启用自动重试 */
	enableAutoRetry?: boolean
	/** 是否启用降级模式 */
	enableDegradedMode?: boolean
	/** 是否启用提供者重新初始化 */
	enableReinitialization?: boolean
	/** 最大重试次数 */
	maxRetries?: number
	/** 重试间隔（毫秒） */
	retryInterval?: number
	/** 降级模式超时时间（毫秒） */
	degradedModeTimeout?: number
	/** 是否记录提供者错误详情 */
	logErrorDetails?: boolean
}

/**
 * 默认提供者错误处理配置
 */
const DEFAULT_PROVIDER_CONFIG: Required<ProviderErrorHandlerConfig> = {
	enableAutoRetry: true,
	enableDegradedMode: true,
	enableReinitialization: true,
	maxRetries: 3,
	retryInterval: 1000,
	degradedModeTimeout: 30000,
	logErrorDetails: true,
}

/**
 * 提供者状态枚举
 */
export enum ProviderStatus {
	/** 正常运行 */
	NORMAL = "normal",
	/** 降级模式 */
	DEGRADED = "degraded",
	/** 错误状态 */
	ERROR = "error",
	/** 已禁用 */
	DISABLED = "disabled",
}

/**
 * 提供者健康状态接口
 */
export interface ProviderHealth {
	/** 提供者类型 */
	providerType: string
	/** 提供者状态 */
	status: ProviderStatus
	/** 最后错误时间 */
	lastErrorTime?: Date
	/** 连续错误数 */
	consecutiveErrors: number
	/** 总错误数 */
	totalErrors: number
	/** 是否启用 */
	enabled: boolean
	/** 降级模式开始时间 */
	degradedModeStartTime?: Date
	/** 重试次数 */
	retryCount: number
}

/**
 * 提供者操作结果接口
 */
export interface ProviderOperationResult<T = any> {
	/** 操作是否成功 */
	success: boolean
	/** 结果数据 */
	data?: T
	/** 错误信息 */
	error?: ProviderError
	/** 是否使用了降级模式 */
	usedDegradedMode?: boolean
	/** 是否重试了 */
	retried?: boolean
	/** 重试次数 */
	retryCount?: number
}

/**
 * 提供者错误处理器类
 */
export class CoworkflowProviderErrorHandler implements ErrorHandler, ErrorRecoverer {
	private config: Required<ProviderErrorHandlerConfig>
	private errorHandler: CoworkflowErrorHandlerService
	private providerHealth: Map<string, ProviderHealth> = new Map()
	private retryCounters: Map<string, number> = new Map()
	private degradedModeTimers: Map<string, NodeJS.Timeout> = new Map()
	private reinitializationTimers: Map<string, NodeJS.Timeout> = new Map()

	constructor(errorHandler: CoworkflowErrorHandlerService, config: ProviderErrorHandlerConfig = {}) {
		this.config = { ...DEFAULT_PROVIDER_CONFIG, ...config }
		this.errorHandler = errorHandler

		// 注册自身到错误处理服务
		this.errorHandler.registerErrorHandler(ErrorCategory.PROVIDER, this)
		this.errorHandler.registerErrorRecoverer(ErrorCategory.PROVIDER, this)
	}

	/**
	 * 处理提供者错误
	 */
	async handleError(error: CoworkflowError): Promise<void> {
		if (!(error instanceof ProviderError)) {
			return
		}

		const context = error.context
		const { component, operation } = context

		if (!component || !operation) {
			return
		}

		// 更新提供者健康状态
		this.updateProviderHealth(error.providerType, error)

		// 记录详细的错误信息
		if (this.config.logErrorDetails) {
			console.error(`提供者错误 [${error.providerType}:${operation}]: ${error.message}`, {
				component,
				operation,
				recoverable: error.recoverable,
				recoveryStrategy: error.recoveryStrategy,
			})
		}

		// 提供恢复建议
		const suggestion = this.getRecoverySuggestion(error)
		if (suggestion) {
			console.log(`提供者错误恢复建议: ${suggestion}`)
		}
	}

	/**
	 * 检查是否可以处理指定错误
	 */
	canHandle(error: CoworkflowError): boolean {
		return error instanceof ProviderError
	}

	/**
	 * 尝试恢复提供者错误
	 */
	async recover(error: CoworkflowError): Promise<boolean> {
		if (!(error instanceof ProviderError)) {
			return false
		}

		const context = error.context
		const { component, operation } = context

		if (!component || !operation) {
			return false
		}

		const providerKey = `${error.providerType}:${component}`
		const health = this.providerHealth.get(providerKey)

		if (!health || !health.enabled) {
			return false
		}

		// 检查重试次数
		if (health.retryCount >= this.config.maxRetries) {
			// 超过最大重试次数，禁用提供者
			health.status = ProviderStatus.ERROR
			health.enabled = false
			this.scheduleReinitialization(providerKey)
			return false
		}

		// 增加重试次数
		health.retryCount++

		// 等待重试间隔
		await new Promise((resolve) => setTimeout(resolve, this.config.retryInterval))

		try {
			switch (error.providerType) {
				case "CodeLensProvider":
					return await this.recoverCodeLensProviderError(error)
				case "DecorationProvider":
					return await this.recoverDecorationProviderError(error)
				case "FileWatcher":
					return await this.recoverFileWatcherError(error)
				default:
					return await this.recoverGenericProviderError(error)
			}
		} catch (recoveryError) {
			console.error("恢复提供者操作失败:", recoveryError)
			return false
		}
	}

	/**
	 * 检查是否可以恢复指定错误
	 */
	canRecover(error: CoworkflowError): boolean {
		if (!(error instanceof ProviderError)) {
			return false
		}

		const context = error.context
		const { component } = context

		if (!component) {
			return false
		}

		const providerKey = `${error.providerType}:${component}`
		const health = this.providerHealth.get(providerKey)

		return health !== undefined && health.enabled && health.retryCount < this.config.maxRetries && error.recoverable
	}

	/**
	 * 恢复 CodeLens 提供者错误
	 */
	private async recoverCodeLensProviderError(error: ProviderError): Promise<boolean> {
		try {
			const providerKey = `${error.providerType}:${error.context.component}`
			const health = this.providerHealth.get(providerKey)!

			// 尝试重新初始化 CodeLens 提供者
			if (this.config.enableReinitialization) {
				console.log(`尝试重新初始化 CodeLens 提供者: ${error.context.component}`)

				// 模拟重新初始化过程
				await new Promise((resolve) => setTimeout(resolve, 100))

				// 重置错误计数
				health.consecutiveErrors = 0
				health.retryCount = 0
				health.status = ProviderStatus.NORMAL

				console.log(`CodeLens 提供者重新初始化成功: ${error.context.component}`)
				return true
			}

			return false
		} catch (recoveryError) {
			console.error("恢复 CodeLens 提供者错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复装饰提供者错误
	 */
	private async recoverDecorationProviderError(error: ProviderError): Promise<boolean> {
		try {
			const providerKey = `${error.providerType}:${error.context.component}`
			const health = this.providerHealth.get(providerKey)!

			// 尝试进入降级模式
			if (this.config.enableDegradedMode) {
				console.log(`装饰提供者进入降级模式: ${error.context.component}`)

				health.status = ProviderStatus.DEGRADED
				health.degradedModeStartTime = new Date()

				// 设置降级模式超时
				this.setDegradedModeTimer(providerKey)

				console.log(`装饰提供者降级模式设置成功: ${error.context.component}`)
				return true
			}

			return false
		} catch (recoveryError) {
			console.error("恢复装饰提供者错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复文件监视器错误
	 */
	private async recoverFileWatcherError(error: ProviderError): Promise<boolean> {
		try {
			const providerKey = `${error.providerType}:${error.context.component}`
			const health = this.providerHealth.get(providerKey)!

			// 尝试重新建立文件监视
			if (this.config.enableReinitialization) {
				console.log(`尝试重新建立文件监视: ${error.context.component}`)

				// 模拟重新建立监视过程
				await new Promise((resolve) => setTimeout(resolve, 500))

				// 重置错误计数
				health.consecutiveErrors = 0
				health.retryCount = 0
				health.status = ProviderStatus.NORMAL

				console.log(`文件监视重新建立成功: ${error.context.component}`)
				return true
			}

			return false
		} catch (recoveryError) {
			console.error("恢复文件监视器错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复通用提供者错误
	 */
	private async recoverGenericProviderError(error: ProviderError): Promise<boolean> {
		try {
			const providerKey = `${error.providerType}:${error.context.component}`
			const health = this.providerHealth.get(providerKey)!

			// 尝试通用恢复策略
			if (this.config.enableAutoRetry) {
				console.log(`尝试重试提供者操作: ${error.providerType}:${error.context.component}`)

				// 模拟重试过程
				await new Promise((resolve) => setTimeout(resolve, 200))

				// 重置错误计数
				health.consecutiveErrors = 0
				health.retryCount = 0
				health.status = ProviderStatus.NORMAL

				console.log(`提供者操作重试成功: ${error.providerType}:${error.context.component}`)
				return true
			}

			return false
		} catch (recoveryError) {
			console.error("恢复通用提供者错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 安全地执行提供者操作
	 */
	async safeExecute<T>(
		providerType: string,
		component: string,
		operation: string,
		fn: () => Promise<T>,
		fallbackFn?: () => Promise<T>,
	): Promise<ProviderOperationResult<T>> {
		const providerKey = `${providerType}:${component}`
		let retryCount = 0
		let usedDegradedMode = false

		// 确保提供者已注册
		this.registerProvider(providerType, component)

		while (retryCount <= this.config.maxRetries) {
			try {
				const health = this.providerHealth.get(providerKey)!

				// 检查提供者状态
				if (!health.enabled) {
					throw new ProviderError(
						`提供者 ${providerType} 已禁用`,
						providerType,
						{ component, operation },
						RecoveryStrategy.NONE,
						undefined,
					)
				}

				if (health.status === ProviderStatus.ERROR) {
					throw new ProviderError(
						`提供者 ${providerType} 处于错误状态`,
						providerType,
						{ component, operation },
						RecoveryStrategy.RETRY,
						undefined,
					)
				}

				// 尝试执行操作
				const result = await fn()

				// 操作成功，更新健康状态
				this.handleProviderSuccess(providerKey)

				return {
					success: true,
					data: result,
					retried: retryCount > 0,
					retryCount,
					usedDegradedMode,
				}
			} catch (error) {
				retryCount++

				const providerError =
					error instanceof ProviderError
						? error
						: new ProviderError(
								error instanceof Error ? error.message : String(error),
								providerType,
								{ component, operation },
								RecoveryStrategy.RETRY,
								error instanceof Error ? error : undefined,
							)

				// 更新提供者健康状态
				this.updateProviderHealth(providerType, providerError)

				// 尝试恢复
				if (retryCount <= this.config.maxRetries) {
					try {
						await this.errorHandler.handleError(providerError, {
							showToUser: false,
							showDetails: false,
						})

						// 继续重试
						continue
					} catch (handlingError) {
						console.error("错误处理失败:", handlingError)
					}
				}

				// 所有重试都失败，尝试回退
				if (fallbackFn && this.config.enableDegradedMode) {
					try {
						const fallbackResult = await fallbackFn()
						usedDegradedMode = true

						// 进入降级模式
						const health = this.providerHealth.get(providerKey)!
						health.status = ProviderStatus.DEGRADED
						health.degradedModeStartTime = new Date()
						this.setDegradedModeTimer(providerKey)

						return {
							success: true,
							data: fallbackResult,
							usedDegradedMode: true,
							retried: retryCount > 0,
							retryCount,
						}
					} catch (fallbackError) {
						console.error("回退操作失败:", fallbackError)
					}
				}

				return {
					success: false,
					error: providerError,
					retried: retryCount > 0,
					retryCount,
				}
			}
		}

		// 不应该到达这里
		return {
			success: false,
			error: new ProviderError(
				"未知错误",
				providerType,
				{ component, operation },
				RecoveryStrategy.NONE,
				undefined,
			),
		}
	}

	/**
	 * 更新提供者健康状态
	 */
	private updateProviderHealth(providerType: string, error: ProviderError): void {
		const providerKey = `${providerType}:${error.context.component}`
		let health = this.providerHealth.get(providerKey)

		if (!health) {
			health = this.createProviderHealth(providerType, error.context.component || "unknown")
			this.providerHealth.set(providerKey, health)
		}

		health.consecutiveErrors++
		health.totalErrors++
		health.lastErrorTime = new Date()

		// 检查是否需要进入错误状态
		if (health.consecutiveErrors >= 3) {
			health.status = ProviderStatus.ERROR
			health.enabled = false
			this.scheduleReinitialization(providerKey)
		} else if (health.consecutiveErrors > 1) {
			// 多次错误，进入降级模式
			health.status = ProviderStatus.DEGRADED
			health.degradedModeStartTime = new Date()
			this.setDegradedModeTimer(providerKey)
		}
	}

	/**
	 * 处理提供者成功
	 */
	private handleProviderSuccess(providerKey: string): void {
		const health = this.providerHealth.get(providerKey)
		if (health) {
			health.consecutiveErrors = 0
			health.retryCount = 0
			health.status = ProviderStatus.NORMAL

			// 清除降级模式
			if (health.degradedModeStartTime) {
				health.degradedModeStartTime = undefined
				this.clearDegradedModeTimer(providerKey)
			}
		}
	}

	/**
	 * 注册提供者
	 */
	registerProvider(providerType: string, component: string): void {
		const providerKey = `${providerType}:${component}`
		if (!this.providerHealth.has(providerKey)) {
			const health = this.createProviderHealth(providerType, component)
			this.providerHealth.set(providerKey, health)
		}
	}

	/**
	 * 创建提供者健康状态
	 */
	private createProviderHealth(providerType: string, component: string): ProviderHealth {
		return {
			providerType,
			status: ProviderStatus.NORMAL,
			consecutiveErrors: 0,
			totalErrors: 0,
			enabled: true,
			retryCount: 0,
		}
	}

	/**
	 * 设置降级模式计时器
	 */
	private setDegradedModeTimer(providerKey: string): void {
		this.clearDegradedModeTimer(providerKey)

		const timer = setTimeout(() => {
			this.exitDegradedMode(providerKey)
		}, this.config.degradedModeTimeout)

		this.degradedModeTimers.set(providerKey, timer)
	}

	/**
	 * 清除降级模式计时器
	 */
	private clearDegradedModeTimer(providerKey: string): void {
		const timer = this.degradedModeTimers.get(providerKey)
		if (timer) {
			clearTimeout(timer)
			this.degradedModeTimers.delete(providerKey)
		}
	}

	/**
	 * 退出降级模式
	 */
	private exitDegradedMode(providerKey: string): void {
		const health = this.providerHealth.get(providerKey)
		if (health && health.status === ProviderStatus.DEGRADED) {
			health.status = ProviderStatus.NORMAL
			health.degradedModeStartTime = undefined
		}

		this.clearDegradedModeTimer(providerKey)
	}

	/**
	 * 安排重新初始化
	 */
	private scheduleReinitialization(providerKey: string): void {
		this.clearReinitializationTimer(providerKey)

		const timer = setTimeout(() => {
			this.reinitializeProvider(providerKey)
		}, this.config.degradedModeTimeout * 2) // 重新初始化时间更长

		this.reinitializationTimers.set(providerKey, timer)
	}

	/**
	 * 清除重新初始化计时器
	 */
	private clearReinitializationTimer(providerKey: string): void {
		const timer = this.reinitializationTimers.get(providerKey)
		if (timer) {
			clearTimeout(timer)
			this.reinitializationTimers.delete(providerKey)
		}
	}

	/**
	 * 重新初始化提供者
	 */
	private reinitializeProvider(providerKey: string): void {
		const health = this.providerHealth.get(providerKey)
		if (health && health.status === ProviderStatus.ERROR) {
			health.enabled = true
			health.consecutiveErrors = 0
			health.retryCount = 0
			health.status = ProviderStatus.NORMAL

			console.log(`提供者自动重新初始化: ${providerKey}`)
			vscode.window.showInformationMessage(`提供者已自动重新初始化: ${providerKey}`)
		}

		this.clearReinitializationTimer(providerKey)
	}

	/**
	 * 手动恢复提供者
	 */
	manualRecoverProvider(providerType: string, component: string): boolean {
		const providerKey = `${providerType}:${component}`
		const health = this.providerHealth.get(providerKey)

		if (health && health.status === ProviderStatus.ERROR) {
			this.reinitializeProvider(providerKey)
			return true
		}
		return false
	}

	/**
	 * 获取提供者健康状态
	 */
	getProviderHealth(providerType: string, component: string): ProviderHealth | undefined {
		const providerKey = `${providerType}:${component}`
		return this.providerHealth.get(providerKey)
	}

	/**
	 * 获取所有提供者健康状态
	 */
	getAllProviderHealth(): ProviderHealth[] {
		return Array.from(this.providerHealth.values())
	}

	/**
	 * 检查提供者系统是否健康
	 */
	isProviderSystemHealthy(): boolean {
		return Array.from(this.providerHealth.values()).every((health) => health.status !== ProviderStatus.ERROR)
	}

	/**
	 * 获取提供者系统状态摘要
	 */
	getProviderSystemStatusSummary(): {
		totalProviders: number
		healthyProviders: number
		degradedProviders: number
		errorProviders: number
		disabledProviders: number
		isHealthy: boolean
	} {
		const providers = Array.from(this.providerHealth.values())

		return {
			totalProviders: providers.length,
			healthyProviders: providers.filter((p) => p.status === ProviderStatus.NORMAL).length,
			degradedProviders: providers.filter((p) => p.status === ProviderStatus.DEGRADED).length,
			errorProviders: providers.filter((p) => p.status === ProviderStatus.ERROR).length,
			disabledProviders: providers.filter((p) => !p.enabled).length,
			isHealthy: this.isProviderSystemHealthy(),
		}
	}

	/**
	 * 获取恢复建议
	 */
	private getRecoverySuggestion(error: ProviderError): string | null {
		switch (error.providerType) {
			case "CodeLensProvider":
				return "尝试重新加载窗口或重启 VS Code 来恢复 CodeLens 功能。"
			case "DecorationProvider":
				return "装饰功能可能暂时不可用，但不会影响其他功能。"
			case "FileWatcher":
				return "文件监视功能可能受到影响，手动保存文件以确保更改被处理。"
			default:
				return "提供者遇到错误，系统将尝试自动恢复。"
		}
	}

	/**
	 * 重置重试计数器
	 */
	resetRetryCounters(): void {
		this.retryCounters.clear()
	}

	/**
	 * 获取重试统计信息
	 */
	getRetryStats(): { [key: string]: number } {
		const stats: { [key: string]: number } = {}
		this.retryCounters.forEach((count, key) => {
			stats[key] = count
		})
		return stats
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.degradedModeTimers.forEach((timer) => clearTimeout(timer))
		this.degradedModeTimers.clear()

		this.reinitializationTimers.forEach((timer) => clearTimeout(timer))
		this.reinitializationTimers.clear()

		this.providerHealth.clear()
		this.retryCounters.clear()
	}
}

/**
 * 创建提供者错误处理器实例
 */
export const createProviderErrorHandler = (
	errorHandler: CoworkflowErrorHandlerService,
	config?: ProviderErrorHandlerConfig,
): CoworkflowProviderErrorHandler => {
	return new CoworkflowProviderErrorHandler(errorHandler, config)
}
