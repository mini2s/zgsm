import * as vscode from "vscode"
import { CoworkflowError, ErrorLevel, ErrorCategory } from "../types/errors"

/**
 * 错误消息模板接口
 */
export interface ErrorMessageTemplate {
	/** 消息ID */
	id: string
	/** 错误类别 */
	category: ErrorCategory
	/** 错误级别 */
	level: ErrorLevel
	/** 标题模板 */
	titleTemplate: string
	/** 消息模板 */
	messageTemplate: string
	/** 解决方案模板 */
	solutionTemplate?: string
	/** 帮助链接 */
	helpLink?: string
	/** 是否显示详情按钮 */
	showDetailsButton: boolean
	/** 是否显示重试按钮 */
	showRetryButton: boolean
	/** 是否显示忽略按钮 */
	showIgnoreButton: boolean
}

/**
 * 错误消息显示配置
 */
export interface ErrorMessageDisplayConfig {
	/** 是否启用本地化消息 */
	enableLocalization: boolean
	/** 当前语言 */
	language: string
	/** 是否启用动画效果 */
	enableAnimations: boolean
	/** 消息显示持续时间（毫秒） */
	displayDuration: number
	/** 最大同时显示的消息数 */
	maxConcurrentMessages: number
	/** 是否启用消息分组 */
	enableMessageGrouping: boolean
	/** 消息分组时间窗口（毫秒） */
	groupingWindow: number
	/** 是否启用错误恢复建议 */
	enableRecoverySuggestions: boolean
	/** 自定义消息模板 */
	customTemplates?: ErrorMessageTemplate[]
}

/**
 * 错误消息显示选项
 */
export interface ErrorMessageOptions {
	/** 是否显示模态对话框 */
	modal?: boolean
	/** 是否显示详细信息 */
	showDetails?: boolean
	/** 自定义按钮 */
	customButtons?: string[]
	/** 回调函数 */
	callback?: (button: string) => void
	/** 是否显示进度 */
	showProgress?: boolean
	/** 进度消息 */
	progressMessage?: string
}

/**
 * 错误消息分组信息
 */
export interface ErrorMessageGroup {
	/** 分组ID */
	id: string
	/** 错误类别 */
	category: ErrorCategory
	/** 错误级别 */
	level: ErrorLevel
	/** 消息数量 */
	count: number
	/** 首个错误消息 */
	firstMessage: string
	/** 最后一个错误消息 */
	lastMessage: string
	/** 首次发生时间 */
	firstOccurrence: Date
	/** 最后发生时间 */
	lastOccurrence: Date
	/** 影响的文件 */
	affectedFiles: Set<string>
}

/**
 * Coworkflow错误消息显示服务
 *
 * 提供用户友好的错误消息显示功能，包括：
 * - 本地化错误消息
 * - 错误消息模板
 * - 消息分组和防抖动
 * - 用户交互和反馈
 * - 错误恢复建议
 */
export class CoworkflowErrorMessageDisplay implements vscode.Disposable {
	private readonly config: ErrorMessageDisplayConfig
	private readonly messageTemplates: Map<string, ErrorMessageTemplate> = new Map()
	private readonly activeMessages: Map<string, vscode.Disposable> = new Map()
	private readonly messageGroups: Map<string, ErrorMessageGroup> = new Map()
	private readonly messageTimers: Map<string, NodeJS.Timeout> = new Map()
	private isDisposed = false

	constructor(config: Partial<ErrorMessageDisplayConfig> = {}) {
		this.config = {
			enableLocalization: true,
			language: "zh-CN",
			enableAnimations: true,
			displayDuration: 5000,
			maxConcurrentMessages: 3,
			enableMessageGrouping: true,
			groupingWindow: 2000,
			enableRecoverySuggestions: true,
			...config,
		}

		this.initializeMessageTemplates()
	}

	/**
	 * 显示错误消息
	 */
	async showError(error: CoworkflowError | Error, options?: ErrorMessageOptions): Promise<string | undefined> {
		if (this.isDisposed) {
			return undefined
		}

		const isCoworkflowError = error instanceof CoworkflowError
		const template = this.getMessageTemplate(isCoworkflowError ? error : undefined)

		// 消息分组
		if (this.config.enableMessageGrouping) {
			const group = this.groupError(error, template)
			if (group.count > 1) {
				return this.showGroupedMessage(group, options)
			}
		}

		// 格式化消息
		const title = this.formatMessage(template.titleTemplate, error)
		const message = this.formatMessage(template.messageTemplate, error)
		const solution = template.solutionTemplate ? this.formatMessage(template.solutionTemplate, error) : undefined

		// 显示消息
		return this.displayMessage(title, message, solution, template, options)
	}

	/**
	 * 显示警告消息
	 */
	async showWarning(message: string, options?: ErrorMessageOptions): Promise<string | undefined> {
		if (this.isDisposed) {
			return undefined
		}

		const template = this.getMessageTemplate(undefined, ErrorLevel.WARNING)
		const title = this.formatMessage(template.titleTemplate, new Error(message))

		return this.displayMessage(title, message, undefined, template, options)
	}

	/**
	 * 显示信息消息
	 */
	async showInfo(message: string, options?: ErrorMessageOptions): Promise<string | undefined> {
		if (this.isDisposed) {
			return undefined
		}

		const template = this.getMessageTemplate(undefined, ErrorLevel.INFO)
		const title = this.formatMessage(template.titleTemplate, new Error(message))

		return this.displayMessage(title, message, undefined, template, options)
	}

	/**
	 * 显示进度消息
	 */
	showProgress(message: string, increment?: number): void {
		if (this.isDisposed) {
			return
		}

		// TODO: 实现进度消息显示
		// 这里需要实现进度条或进度通知的显示逻辑
	}

	/**
	 * 隐藏进度消息
	 */
	hideProgress(): void {
		// TODO: 实现进度消息隐藏
	}

	/**
	 * 清除所有活动消息
	 */
	clearAllMessages(): void {
		this.activeMessages.forEach((disposable) => disposable.dispose())
		this.activeMessages.clear()

		this.messageTimers.forEach((timer) => clearTimeout(timer))
		this.messageTimers.clear()
	}

	/**
	 * 获取消息模板
	 */
	getMessageTemplate(error?: CoworkflowError, level?: ErrorLevel): ErrorMessageTemplate {
		const templateId = error ? `${error.category}:${error.level}` : `system:${level || ErrorLevel.INFO}`

		let template = this.messageTemplates.get(templateId)

		if (!template) {
			// 使用默认模板
			template = this.getDefaultTemplate(error, level)
		}

		return template
	}

	/**
	 * 添加自定义消息模板
	 */
	addCustomTemplate(template: ErrorMessageTemplate): void {
		this.messageTemplates.set(template.id, template)
	}

	/**
	 * 移除消息模板
	 */
	removeTemplate(templateId: string): void {
		this.messageTemplates.delete(templateId)
	}

	/**
	 * 获取所有活动消息
	 */
	getActiveMessages(): string[] {
		return Array.from(this.activeMessages.keys())
	}

	/**
	 * 获取消息分组统计
	 */
	getMessageGroups(): ErrorMessageGroup[] {
		return Array.from(this.messageGroups.values()).sort(
			(a, b) => b.lastOccurrence.getTime() - a.lastOccurrence.getTime(),
		)
	}

	/**
	 * 初始化消息模板
	 */
	private initializeMessageTemplates(): void {
		// 文件系统错误模板
		this.addMessageTemplate({
			id: "file-system:error",
			category: ErrorCategory.FILE_SYSTEM,
			level: ErrorLevel.ERROR,
			titleTemplate: "文件系统错误",
			messageTemplate: "无法访问文件: {message}",
			solutionTemplate: "请检查文件权限和磁盘空间",
			showDetailsButton: true,
			showRetryButton: true,
			showIgnoreButton: false,
		})

		// 解析错误模板
		this.addMessageTemplate({
			id: "parsing:error",
			category: ErrorCategory.PARSING,
			level: ErrorLevel.ERROR,
			titleTemplate: "解析错误",
			messageTemplate: "无法解析 Markdown 内容: {message}",
			solutionTemplate: "请检查 Markdown 语法格式",
			showDetailsButton: true,
			showRetryButton: true,
			showIgnoreButton: true,
		})

		// 提供者错误模板
		this.addMessageTemplate({
			id: "provider:error",
			category: ErrorCategory.PROVIDER,
			level: ErrorLevel.ERROR,
			titleTemplate: "提供者错误",
			messageTemplate: "CodeLens 或装饰提供者失败: {message}",
			solutionTemplate: "请重新加载窗口或重启 VS Code",
			showDetailsButton: true,
			showRetryButton: true,
			showIgnoreButton: false,
		})

		// 命令错误模板
		this.addMessageTemplate({
			id: "command:error",
			category: ErrorCategory.COMMAND,
			level: ErrorLevel.ERROR,
			titleTemplate: "命令执行错误",
			messageTemplate: "命令执行失败: {message}",
			solutionTemplate: "请检查命令参数和上下文",
			showDetailsButton: true,
			showRetryButton: true,
			showIgnoreButton: true,
		})

		// 系统信息模板
		this.addMessageTemplate({
			id: "system:info",
			category: ErrorCategory.UNKNOWN,
			level: ErrorLevel.INFO,
			titleTemplate: "系统信息",
			messageTemplate: "{message}",
			showDetailsButton: false,
			showRetryButton: false,
			showIgnoreButton: true,
		})

		// 系统警告模板
		this.addMessageTemplate({
			id: "system:warning",
			category: ErrorCategory.UNKNOWN,
			level: ErrorLevel.WARNING,
			titleTemplate: "系统警告",
			messageTemplate: "{message}",
			showDetailsButton: true,
			showRetryButton: false,
			showIgnoreButton: true,
		})
	}

	/**
	 * 添加消息模板
	 */
	private addMessageTemplate(template: ErrorMessageTemplate): void {
		this.messageTemplates.set(template.id, template)
	}

	/**
	 * 获取默认模板
	 */
	private getDefaultTemplate(error?: CoworkflowError, level?: ErrorLevel): ErrorMessageTemplate {
		return {
			id: "default",
			category: error?.category || ErrorCategory.UNKNOWN,
			level: error?.level || level || ErrorLevel.ERROR,
			titleTemplate: "错误",
			messageTemplate: "{message}",
			showDetailsButton: true,
			showRetryButton: false,
			showIgnoreButton: true,
		}
	}

	/**
	 * 格式化消息
	 */
	private formatMessage(template: string, error: Error): string {
		let message = template.replace("{message}", error.message)

		if (error instanceof CoworkflowError) {
			message = message.replace("{category}", error.category)
			message = message.replace("{level}", error.level)
			message = message.replace("{recoverable}", error.recoverable ? "可恢复" : "不可恢复")
			message = message.replace("{strategy}", error.recoveryStrategy)

			if (error.context.uri) {
				message = message.replace("{file}", error.context.uri.fsPath)
			}

			if (error.context.line !== undefined) {
				message = message.replace("{line}", error.context.line.toString())
			}

			if (error.context.component) {
				message = message.replace("{component}", error.context.component)
			}

			if (error.context.operation) {
				message = message.replace("{operation}", error.context.operation)
			}
		}

		return message
	}

	/**
	 * 分组错误
	 */
	private groupError(error: Error, template: ErrorMessageTemplate): ErrorMessageGroup {
		const groupKey = `${template.category}:${template.level}`
		let group = this.messageGroups.get(groupKey)

		if (!group) {
			group = {
				id: groupKey,
				category: template.category,
				level: template.level,
				count: 0,
				firstMessage: "",
				lastMessage: "",
				firstOccurrence: new Date(),
				lastOccurrence: new Date(),
				affectedFiles: new Set(),
			}
			this.messageGroups.set(groupKey, group)
		}

		group.count++
		group.lastMessage = error.message
		group.lastOccurrence = new Date()

		if (group.count === 1) {
			group.firstMessage = error.message
			group.firstOccurrence = new Date()
		}

		// 清理旧的分组
		this.cleanupOldGroups()

		return group
	}

	/**
	 * 显示分组消息
	 */
	private async showGroupedMessage(
		group: ErrorMessageGroup,
		options?: ErrorMessageOptions,
	): Promise<string | undefined> {
		const title = `${group.category} 错误 (${group.count} 次)`
		const message =
			`最近发生 ${group.count} 次 ${group.category} 错误\n` +
			`首次: ${group.firstMessage}\n` +
			`最近: ${group.lastMessage}`

		const buttons = ["查看详情", "清除统计"]
		if (options?.customButtons) {
			buttons.push(...options.customButtons)
		}

		const result = await vscode.window.showErrorMessage(message, ...buttons)

		if (result === "查看详情") {
			this.showGroupDetails(group)
		} else if (result === "清除统计") {
			this.messageGroups.delete(group.id)
		}

		return result
	}

	/**
	 * 显示分组详情
	 */
	private showGroupDetails(group: ErrorMessageGroup): void {
		const details = [
			`错误类别: ${group.category}`,
			`错误级别: ${group.level}`,
			`发生次数: ${group.count}`,
			`首次发生: ${group.firstOccurrence.toLocaleString()}`,
			`最近发生: ${group.lastOccurrence.toLocaleString()}`,
			`首次消息: ${group.firstMessage}`,
			`最近消息: ${group.lastMessage}`,
			`影响文件数: ${group.affectedFiles.size}`,
		]

		const message = details.join("\n")
		vscode.window.showInformationMessage(message, "确定")
	}

	/**
	 * 显示消息
	 */
	private async displayMessage(
		title: string,
		message: string,
		solution?: string,
		template?: ErrorMessageTemplate,
		options?: ErrorMessageOptions,
	): Promise<string | undefined> {
		// 限制同时显示的消息数量
		if (this.activeMessages.size >= this.config.maxConcurrentMessages) {
			this.clearOldestMessage()
		}

		const fullMessage = solution ? `${message}\n\n解决方案: ${solution}` : message

		// 构建按钮列表
		const buttons: string[] = []
		if (template?.showDetailsButton && options?.showDetails !== false) {
			buttons.push("查看详情")
		}
		if (template?.showRetryButton) {
			buttons.push("重试")
		}
		if (template?.showIgnoreButton) {
			buttons.push("忽略")
		}
		if (options?.customButtons) {
			buttons.push(...options.customButtons)
		}

		let result: string | undefined

		if (options?.modal) {
			// 模态对话框
			result = await vscode.window.showErrorMessage(fullMessage, ...buttons)
		} else {
			// 普通通知
			switch (template?.level || ErrorLevel.ERROR) {
				case ErrorLevel.INFO:
					result = await vscode.window.showInformationMessage(fullMessage, ...buttons)
					break
				case ErrorLevel.WARNING:
					result = await vscode.window.showWarningMessage(fullMessage, ...buttons)
					break
				case ErrorLevel.ERROR:
				case ErrorLevel.CRITICAL:
					result = await vscode.window.showErrorMessage(fullMessage, ...buttons)
					break
			}
		}

		// 处理按钮点击
		if (result && options?.callback) {
			options.callback(result)
		}

		// 自动隐藏消息
		if (this.config.displayDuration > 0) {
			this.scheduleMessageHide(title)
		}

		return result
	}

	/**
	 * 清理旧的分组
	 */
	private cleanupOldGroups(): void {
		const now = new Date()
		const cutoff = new Date(now.getTime() - this.config.groupingWindow)

		for (const [key, group] of this.messageGroups) {
			if (group.lastOccurrence < cutoff) {
				this.messageGroups.delete(key)
			}
		}
	}

	/**
	 * 清除最旧的消息
	 */
	private clearOldestMessage(): void {
		const oldestKey = this.activeMessages.keys().next().value
		if (oldestKey) {
			const disposable = this.activeMessages.get(oldestKey)
			if (disposable) {
				disposable.dispose()
				this.activeMessages.delete(oldestKey)
			}
		}
	}

	/**
	 * 安排消息隐藏
	 */
	private scheduleMessageHide(messageKey: string): void {
		const timer = setTimeout(() => {
			const disposable = this.activeMessages.get(messageKey)
			if (disposable) {
				disposable.dispose()
				this.activeMessages.delete(messageKey)
			}
			this.messageTimers.delete(messageKey)
		}, this.config.displayDuration)

		this.messageTimers.set(messageKey, timer)
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.isDisposed = true

		this.clearAllMessages()
		this.messageGroups.clear()
		this.messageTemplates.clear()
	}
}

/**
 * 创建错误消息显示服务实例
 */
export const createErrorMessageDisplay = (config?: Partial<ErrorMessageDisplayConfig>) => {
	return new CoworkflowErrorMessageDisplay(config)
}
