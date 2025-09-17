/**
 * Coworkflow 命令处理程序
 * 提供与 .coworkflow Markdown 文件支持相关的命令处理逻辑
 */

import * as vscode from "vscode"
import {
	COWORKFLOW_COMMANDS,
	CoworkflowCommandArgs,
	CoworkflowCommandHandler,
	CoworkflowCommandRegistry,
	CoworkflowCommand,
} from "../types/commands"
import { CoworkflowErrorHandlerService } from "../services"
import { ErrorLevel as ErrorLevelType, ErrorCategory as ErrorCategoryType, CommandError } from "../types/errors"

/**
 * Coworkflow 命令注册表实现
 */
class CoworkflowCommandRegistryImpl implements CoworkflowCommandRegistry {
	private commands = new Map<CoworkflowCommand, CoworkflowCommandHandler>()
	private disposables: vscode.Disposable[] = []
	private errorHandler: CoworkflowErrorHandlerService

	constructor(errorHandler: CoworkflowErrorHandlerService) {
		this.errorHandler = errorHandler
	}

	/**
	 * 注册命令
	 */
	registerCommand(handler: CoworkflowCommandHandler): void {
		this.commands.set(handler.command, handler)

		const disposable = vscode.commands.registerCommand(handler.command, async (args: CoworkflowCommandArgs) => {
			if (handler.enabled !== false) {
				try {
					await handler.handler(args)
				} catch (error) {
					const commandError = new CommandError(
						`执行命令 ${handler.command} 时发生错误`,
						handler.command,
						{ operation: handler.command, data: { args: JSON.stringify(args) } },
						undefined,
						error,
					)

					this.errorHandler.handleError(commandError)
				}
			}
		})

		this.disposables.push(disposable)
	}

	/**
	 * 注销命令
	 */
	unregisterCommand(command: CoworkflowCommand): void {
		this.commands.delete(command)
	}

	/**
	 * 执行命令
	 */
	async executeCommand(command: CoworkflowCommand, args?: CoworkflowCommandArgs): Promise<void> {
		const handler = this.commands.get(command)
		if (handler) {
			try {
				await handler.handler(args || {})
			} catch (error) {
				const commandError = new CommandError(
					`执行命令 ${command} 时发生错误`,
					command,
					{ operation: command, data: { args: JSON.stringify(args) } },
					undefined,
					error,
				)

				this.errorHandler.handleError(commandError)
				throw commandError
			}
		} else {
			const commandError = new CommandError(`命令 ${command} 未注册`, command, {
				operation: command,
				data: { args: JSON.stringify(args) },
			})

			this.errorHandler.handleError(commandError)
			throw commandError
		}
	}

	/**
	 * 获取所有命令
	 */
	getCommands(): CoworkflowCommandHandler[] {
		return Array.from(this.commands.values())
	}

	/**
	 * 检查命令是否已注册
	 */
	isCommandRegistered(command: CoworkflowCommand): boolean {
		return this.commands.has(command)
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.disposables.forEach((disposable) => disposable.dispose())
		this.disposables = []
		this.commands.clear()
	}
}

/**
 * 创建命令注册表实例
 */
export const createCommandRegistry = (errorHandler: CoworkflowErrorHandlerService): CoworkflowCommandRegistry => {
	return new CoworkflowCommandRegistryImpl(errorHandler)
}

/**
 * 默认命令处理程序
 */
export const createDefaultCommandHandlers = (): CoworkflowCommandHandler[] => {
	return [
		{
			command: COWORKFLOW_COMMANDS.EXECUTE_TASK,
			description: "执行任务",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("执行任务功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.TOGGLE_TASK_STATUS,
			description: "切换任务状态",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("切换任务状态功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.NAVIGATE_TO_TASK,
			description: "导航到任务",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("导航到任务功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.EDIT_TASK,
			description: "编辑任务",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("编辑任务功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.REFRESH_DOCUMENT,
			description: "刷新文档",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("刷新文档功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.SHOW_TASK_DETAILS,
			description: "显示任务详情",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("显示任务详情功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.CREATE_NEW_TASK,
			description: "创建新任务",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("创建新任务功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.DELETE_TASK,
			description: "删除任务",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("删除任务功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.SHOW_HELP,
			description: "显示帮助",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("Coworkflow 帮助功能待实现")
			},
		},
		{
			command: COWORKFLOW_COMMANDS.SHOW_SETTINGS,
			description: "显示设置",
			handler: async (args: CoworkflowCommandArgs) => {
				vscode.window.showInformationMessage("Coworkflow 设置功能待实现")
			},
		},
		// Coworkflow CodeLens 特定命令
		{
			command: "coworkflow.updateRequirement" as CoworkflowCommand,
			description: "更新需求",
			handler: async (args: CoworkflowCommandArgs) => {
				if (args.data && typeof args.data === "object" && "title" in args.data) {
					const title = (args.data as any).title as string
					const result = await vscode.window.showInformationMessage(
						`更新需求: ${title}`,
						{ modal: true },
						"确认",
						"取消",
					)

					if (result === "确认") {
						vscode.window.showInformationMessage(`需求 "${title}" 已更新`)
					}
				} else {
					vscode.window.showErrorMessage("更新需求时缺少必要参数")
				}
			},
		},
		{
			command: "coworkflow.updateDesign" as CoworkflowCommand,
			description: "更新设计",
			handler: async (args: CoworkflowCommandArgs) => {
				if (args.data && typeof args.data === "object" && "title" in args.data) {
					const title = (args.data as any).title as string
					const result = await vscode.window.showInformationMessage(
						`更新设计: ${title}`,
						{ modal: true },
						"确认",
						"取消",
					)

					if (result === "确认") {
						vscode.window.showInformationMessage(`设计 "${title}" 已更新`)
					}
				} else {
					vscode.window.showErrorMessage("更新设计时缺少必要参数")
				}
			},
		},
		{
			command: "coworkflow.runTask" as CoworkflowCommand,
			description: "运行任务",
			handler: async (args: CoworkflowCommandArgs) => {
				if (args.data && typeof args.data === "object" && "title" in args.data) {
					const title = (args.data as any).title as string
					const status = (args.data as any).status as string

					if (status === "completed") {
						vscode.window.showInformationMessage(`任务 "${title}" 已完成，无需运行`)
						return
					}

					const result = await vscode.window.showInformationMessage(
						`运行任务: ${title}`,
						{ modal: true },
						"开始",
						"取消",
					)

					if (result === "开始") {
						vscode.window.showInformationMessage(`任务 "${title}" 正在运行...`)
						// 这里可以添加实际的任务执行逻辑
						setTimeout(() => {
							vscode.window.showInformationMessage(`任务 "${title}" 执行完成`)
						}, 2000)
					}
				} else {
					vscode.window.showErrorMessage("运行任务时缺少必要参数")
				}
			},
		},
		{
			command: "coworkflow.retryTask" as CoworkflowCommand,
			description: "重试任务",
			handler: async (args: CoworkflowCommandArgs) => {
				if (args.data && typeof args.data === "object" && "title" in args.data) {
					const title = (args.data as any).title as string
					const result = await vscode.window.showInformationMessage(
						`重试任务: ${title}`,
						{ modal: true },
						"重试",
						"取消",
					)

					if (result === "重试") {
						vscode.window.showInformationMessage(`任务 "${title}" 正在重试...`)
						// 这里可以添加实际的任务重试逻辑
						setTimeout(() => {
							vscode.window.showInformationMessage(`任务 "${title}" 重试完成`)
						}, 2000)
					}
				} else {
					vscode.window.showErrorMessage("重试任务时缺少必要参数")
				}
			},
		},
	]
}
