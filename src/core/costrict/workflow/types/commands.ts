/**
 * Coworkflow 命令常量定义
 * 定义了与 .coworkflow Markdown 文件支持相关的所有命令
 */

import * as vscode from "vscode"
import { TaskStatus } from "./interfaces"

/**
 * 命令命名空间
 */
export const COWORKFLOW_COMMANDS = {
	/** 执行任务 */
	EXECUTE_TASK: "coworkflow.executeTask",
	/** 切换任务状态 */
	TOGGLE_TASK_STATUS: "coworkflow.toggleTaskStatus",
	/** 导航到任务 */
	NAVIGATE_TO_TASK: "coworkflow.navigateToTask",
	/** 编辑任务 */
	EDIT_TASK: "coworkflow.editTask",
	/** 刷新文档 */
	REFRESH_DOCUMENT: "coworkflow.refreshDocument",
	/** 显示任务详情 */
	SHOW_TASK_DETAILS: "coworkflow.showTaskDetails",
	/** 创建新任务 */
	CREATE_NEW_TASK: "coworkflow.createNewTask",
	/** 删除任务 */
	DELETE_TASK: "coworkflow.deleteTask",
	/** 移动任务 */
	MOVE_TASK: "coworkflow.moveTask",
	/** 复制任务 */
	COPY_TASK: "coworkflow.copyTask",
	/** 粘贴任务 */
	PASTE_TASK: "coworkflow.pasteTask",
	/** 撤销操作 */
	UNDO_ACTION: "coworkflow.undoAction",
	/** 重做操作 */
	REDO_ACTION: "coworkflow.redoAction",
	/** 保存文档 */
	SAVE_DOCUMENT: "coworkflow.saveDocument",
	/** 导出文档 */
	EXPORT_DOCUMENT: "coworkflow.exportDocument",
	/** 导入文档 */
	IMPORT_DOCUMENT: "coworkflow.importDocument",
	/** 搜索任务 */
	SEARCH_TASKS: "coworkflow.searchTasks",
	/** 过滤任务 */
	FILTER_TASKS: "coworkflow.filterTasks",
	/** 排序任务 */
	SORT_TASKS: "coworkflow.sortTasks",
	/** 折叠/展开任务 */
	TOGGLE_TASK_FOLD: "coworkflow.toggleTaskFold",
	/** 显示帮助 */
	SHOW_HELP: "coworkflow.showHelp",
	/** 显示设置 */
	SHOW_SETTINGS: "coworkflow.showSettings",
	/** 检查更新 */
	CHECK_UPDATES: "coworkflow.checkUpdates",
	/** 报告问题 */
	REPORT_ISSUE: "coworkflow.reportIssue",
	/** 显示关于信息 */
	SHOW_ABOUT: "coworkflow.showAbout",
} as const

/**
 * 命令类型
 */
export type CoworkflowCommand = (typeof COWORKFLOW_COMMANDS)[keyof typeof COWORKFLOW_COMMANDS]

/**
 * 命令参数接口
 */
export interface CoworkflowCommandArgs {
	/** 文档 URI */
	uri?: vscode.Uri
	/** 任务行号 */
	line?: number
	/** 任务范围 */
	range?: vscode.Range
	/** 任务状态 */
	status?: TaskStatus
	/** 附加数据 */
	data?: Record<string, any>
}

/**
 * 命令处理程序接口
 */
export interface CoworkflowCommandHandler {
	/** 命令标识符 */
	command: CoworkflowCommand
	/** 处理程序函数 */
	handler: (args: CoworkflowCommandArgs) => Promise<void> | void
	/** 命令描述 */
	description?: string
	/** 是否启用 */
	enabled?: boolean
}

/**
 * 命令注册表接口
 */
export interface CoworkflowCommandRegistry {
	/** 注册命令 */
	registerCommand(handler: CoworkflowCommandHandler): void
	/** 注销命令 */
	unregisterCommand(command: CoworkflowCommand): void
	/** 执行命令 */
	executeCommand(command: CoworkflowCommand, args?: CoworkflowCommandArgs): Promise<void>
	/** 获取所有命令 */
	getCommands(): CoworkflowCommandHandler[]
	/** 检查命令是否已注册 */
	isCommandRegistered(command: CoworkflowCommand): boolean
	/** 释放资源 */
	dispose(): void
}
