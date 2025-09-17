/**
 * Coworkflow 错误边界和容错机制
 * 提供错误边界、容错机制和自动恢复功能
 */

import * as vscode from "vscode"
import {
	CoworkflowError,
	ErrorLevel,
	ErrorCategory,
	RecoveryStrategy,
	ErrorHandler,
	ErrorRecoverer,
	ErrorContext,
} from "../types/errors"
import { CoworkflowErrorHandlerService } from "./error-handler"

/**
 * 错误边界配置接口
 */
export interface ErrorBoundaryConfig {
	/** 是否启用错误边界 */
	enabled?: boolean
	/** 最大连续错误数 */
	maxConsecutiveErrors?: number
	/** 错误恢复间隔（毫秒） */
	recoveryInterval?: number
	/** 是否启用自动恢复 */
	enableAutoRecovery?: boolean
	/** 是否启用降级模式 */
	enableDegradedMode?: boolean
	/** 降级模式超时时间（毫秒） */
	degradedModeTimeout?: number
}

/**
 * 默认错误边界配置
 */
const DEFAULT_BOUNDARY_CONFIG: Required<ErrorBoundaryConfig> = {
	enabled: true,
	maxConsecutiveErrors: 5,
	recoveryInterval: 5000,
	enableAutoRecovery: true,
	enableDegradedMode: true,
	degradedModeTimeout: 30000,
}

/**
 * 组件状态枚举
 */
export enum ComponentStatus {
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
 * 组件健康状态接口
 */
export interface ComponentHealth {
	/** 组件名称 */
	name: string
	/** 组件状态 */
	status: ComponentStatus
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
}

/**
 * 错误边界类
 */
export class CoworkflowErrorBoundary {
	private config: Required<ErrorBoundaryConfig>
	private errorHandler: CoworkflowErrorHandlerService
	private componentHealth: Map<string, ComponentHealth> = new Map()
	private recoveryTimers: Map<string, NodeJS.Timeout> = new Map()
	private degradedModeTimers: Map<string, NodeJS.Timeout> = new Map()
	private globalErrorHandlers: ErrorHandler[] = []
	private globalErrorRecoverers: ErrorRecoverer[] = []

	constructor(errorHandler: CoworkflowErrorHandlerService, config: ErrorBoundaryConfig = {}) {
		this.config = { ...DEFAULT_BOUNDARY_CONFIG, ...config }
		this.errorHandler = errorHandler
		this.setupGlobalErrorHandling()
	}

	/**
	 * 设置全局错误处理
	 */
	private setupGlobalErrorHandling(): void {
		// 监听未捕获的 Promise 异常
		process.on("unhandledRejection", (reason, promise) => {
			this.handleUncaughtException(reason, "Promise", promise)
		})

		// 监听未捕获的异常
		process.on("uncaughtException", (error) => {
			this.handleUncaughtException(error, "Exception")
		})
	}

	/**
	 * 处理未捕获的异常
	 */
	private handleUncaughtException(error: any, type: "Promise" | "Exception", promise?: Promise<any>): void {
		const coworkflowError = this.wrapUnknownError(error, {
			component: "Global",
			operation: `Uncaught ${type}`,
		})

		this.errorHandler.handleError(coworkflowError, {
			showToUser: true,
			showDetails: true,
			notificationType: "error",
		})

		// 记录到控制台
		console.error(`Uncaught ${type}:`, error)
	}

	/**
	 * 包装未知错误
	 */
	private wrapUnknownError(error: any, context: Partial<ErrorContext>): CoworkflowError {
		if (error instanceof CoworkflowError) {
			return error
		}

		const message = error instanceof Error ? error.message : String(error)
		return new CoworkflowError(
			message,
			ErrorLevel.ERROR,
			ErrorCategory.UNKNOWN,
			context,
			RecoveryStrategy.NONE,
			false,
			error instanceof Error ? error : undefined,
		)
	}

	/**
	 * 注册组件
	 */
	registerComponent(name: string): void {
		if (!this.componentHealth.has(name)) {
			const health: ComponentHealth = {
				name,
				status: ComponentStatus.NORMAL,
				consecutiveErrors: 0,
				totalErrors: 0,
				enabled: true,
			}
			this.componentHealth.set(name, health)
		}
	}

	/**
	 * 注销组件
	 */
	unregisterComponent(name: string): void {
		this.componentHealth.delete(name)
		this.clearRecoveryTimer(name)
		this.clearDegradedModeTimer(name)
	}

	/**
	 * 执行带错误边界的操作
	 */
	async execute<T>(
		componentName: string,
		operation: string,
		fn: () => Promise<T>,
		fallback?: () => Promise<T>,
	): Promise<T> {
		if (!this.config.enabled) {
			return fn()
		}

		this.registerComponent(componentName)
		const health = this.componentHealth.get(componentName)!

		// 检查组件是否启用
		if (!health.enabled) {
			throw new CoworkflowError(
				`组件 ${componentName} 已禁用`,
				ErrorLevel.WARNING,
				ErrorCategory.CONFIGURATION,
				{ component: componentName, operation },
				RecoveryStrategy.NONE,
				false,
			)
		}

		// 检查组件状态
		if (health.status === ComponentStatus.ERROR) {
			throw new CoworkflowError(
				`组件 ${componentName} 处于错误状态`,
				ErrorLevel.ERROR,
				ErrorCategory.PROVIDER,
				{ component: componentName, operation },
				RecoveryStrategy.RETRY,
				true,
			)
		}

		try {
			const result = await fn()
			this.handleSuccess(componentName)
			return result
		} catch (error) {
			await this.handleError(componentName, operation, error)

			// 尝试回退
			if (fallback) {
				try {
					const fallbackResult = await fallback()
					this.handleFallbackSuccess(componentName)
					return fallbackResult
				} catch (fallbackError) {
					this.handleFallbackError(componentName, operation, fallbackError)
					throw error
				}
			}

			throw error
		}
	}

	/**
	 * 处理成功
	 */
	private handleSuccess(componentName: string): void {
		const health = this.componentHealth.get(componentName)!
		health.consecutiveErrors = 0
		health.status = ComponentStatus.NORMAL

		// 清除降级模式
		if (health.degradedModeStartTime) {
			health.degradedModeStartTime = undefined
			this.clearDegradedModeTimer(componentName)
		}
	}

	/**
	 * 处理回退成功
	 */
	private handleFallbackSuccess(componentName: string): void {
		const health = this.componentHealth.get(componentName)!
		health.status = ComponentStatus.DEGRADED
		health.degradedModeStartTime = new Date()

		// 设置降级模式超时
		this.setDegradedModeTimer(componentName)
	}

	/**
	 * 处理错误
	 */
	private async handleError(componentName: string, operation: string, error: any): Promise<void> {
		const health = this.componentHealth.get(componentName)!
		const coworkflowError = this.wrapUnknownError(error, {
			component: componentName,
			operation,
		})

		// 更新组件健康状态
		health.consecutiveErrors++
		health.totalErrors++
		health.lastErrorTime = new Date()

		// 检查是否需要进入错误状态
		if (health.consecutiveErrors >= this.config.maxConsecutiveErrors) {
			health.status = ComponentStatus.ERROR
			health.enabled = false

			// 设置恢复计时器
			this.setRecoveryTimer(componentName)
		} else if (health.consecutiveErrors > 1) {
			// 多次错误，进入降级模式
			health.status = ComponentStatus.DEGRADED
			health.degradedModeStartTime = new Date()
			this.setDegradedModeTimer(componentName)
		}

		// 处理错误
		await this.errorHandler.handleError(coworkflowError, {
			showToUser: health.status === ComponentStatus.ERROR,
			showDetails: true,
			notificationType: health.status === ComponentStatus.ERROR ? "error" : "warning",
		})
	}

	/**
	 * 处理回退错误
	 */
	private handleFallbackError(componentName: string, operation: string, error: any): void {
		const health = this.componentHealth.get(componentName)!
		const coworkflowError = this.wrapUnknownError(error, {
			component: componentName,
			operation,
		})

		// 回退也失败，进入错误状态
		health.status = ComponentStatus.ERROR
		health.enabled = false

		this.setRecoveryTimer(componentName)

		this.errorHandler.handleError(coworkflowError, {
			showToUser: true,
			showDetails: true,
			notificationType: "error",
		})
	}

	/**
	 * 设置恢复计时器
	 */
	private setRecoveryTimer(componentName: string): void {
		this.clearRecoveryTimer(componentName)

		const timer = setTimeout(() => {
			this.recoverComponent(componentName)
		}, this.config.recoveryInterval)

		this.recoveryTimers.set(componentName, timer)
	}

	/**
	 * 设置降级模式计时器
	 */
	private setDegradedModeTimer(componentName: string): void {
		this.clearDegradedModeTimer(componentName)

		const timer = setTimeout(() => {
			this.exitDegradedMode(componentName)
		}, this.config.degradedModeTimeout)

		this.degradedModeTimers.set(componentName, timer)
	}

	/**
	 * 清除恢复计时器
	 */
	private clearRecoveryTimer(componentName: string): void {
		const timer = this.recoveryTimers.get(componentName)
		if (timer) {
			clearTimeout(timer)
			this.recoveryTimers.delete(componentName)
		}
	}

	/**
	 * 清除降级模式计时器
	 */
	private clearDegradedModeTimer(componentName: string): void {
		const timer = this.degradedModeTimers.get(componentName)
		if (timer) {
			clearTimeout(timer)
			this.degradedModeTimers.delete(componentName)
		}
	}

	/**
	 * 恢复组件
	 */
	private recoverComponent(componentName: string): void {
		const health = this.componentHealth.get(componentName)
		if (health) {
			health.enabled = true
			health.consecutiveErrors = 0
			health.status = ComponentStatus.NORMAL

			vscode.window.showInformationMessage(`组件 ${componentName} 已自动恢复`)
		}

		this.clearRecoveryTimer(componentName)
	}

	/**
	 * 退出降级模式
	 */
	private exitDegradedMode(componentName: string): void {
		const health = this.componentHealth.get(componentName)
		if (health && health.status === ComponentStatus.DEGRADED) {
			health.status = ComponentStatus.NORMAL
			health.degradedModeStartTime = undefined
		}

		this.clearDegradedModeTimer(componentName)
	}

	/**
	 * 手动恢复组件
	 */
	manualRecover(componentName: string): boolean {
		const health = this.componentHealth.get(componentName)
		if (health && health.status === ComponentStatus.ERROR) {
			this.recoverComponent(componentName)
			return true
		}
		return false
	}

	/**
	 * 获取组件健康状态
	 */
	getComponentHealth(componentName: string): ComponentHealth | undefined {
		return this.componentHealth.get(componentName)
	}

	/**
	 * 获取所有组件健康状态
	 */
	getAllComponentHealth(): ComponentHealth[] {
		return Array.from(this.componentHealth.values())
	}

	/**
	 * 检查系统是否健康
	 */
	isSystemHealthy(): boolean {
		return Array.from(this.componentHealth.values()).every((health) => health.status !== ComponentStatus.ERROR)
	}

	/**
	 * 获取系统状态摘要
	 */
	getSystemStatusSummary(): {
		totalComponents: number
		healthyComponents: number
		degradedComponents: number
		errorComponents: number
		disabledComponents: number
		isHealthy: boolean
	} {
		const components = Array.from(this.componentHealth.values())

		return {
			totalComponents: components.length,
			healthyComponents: components.filter((c) => c.status === ComponentStatus.NORMAL).length,
			degradedComponents: components.filter((c) => c.status === ComponentStatus.DEGRADED).length,
			errorComponents: components.filter((c) => c.status === ComponentStatus.ERROR).length,
			disabledComponents: components.filter((c) => !c.enabled).length,
			isHealthy: this.isSystemHealthy(),
		}
	}

	/**
	 * 注册全局错误处理器
	 */
	registerGlobalErrorHandler(handler: ErrorHandler): void {
		this.globalErrorHandlers.push(handler)
	}

	/**
	 * 注册全局错误恢复器
	 */
	registerGlobalErrorRecoverer(recoverer: ErrorRecoverer): void {
		this.globalErrorRecoverers.push(recoverer)
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.recoveryTimers.forEach((timer) => clearTimeout(timer))
		this.recoveryTimers.clear()

		this.degradedModeTimers.forEach((timer) => clearTimeout(timer))
		this.degradedModeTimers.clear()

		this.componentHealth.clear()
		this.globalErrorHandlers.length = 0
		this.globalErrorRecoverers.length = 0
	}
}

/**
 * 创建错误边界实例
 */
export const createErrorBoundary = (
	errorHandler: CoworkflowErrorHandlerService,
	config?: ErrorBoundaryConfig,
): CoworkflowErrorBoundary => {
	return new CoworkflowErrorBoundary(errorHandler, config)
}
