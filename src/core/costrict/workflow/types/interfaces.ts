/**
 * Coworkflow 接口定义
 * 定义了与 .coworkflow Markdown 文件支持相关的所有接口
 */

import * as vscode from "vscode"

/**
 * 任务状态接口
 */
export interface TaskStatus {
	/** 行号 */
	line: number
	/** 范围 */
	range: vscode.Range
	/** 状态 */
	status: "pending" | "in-progress" | "completed" | "blocked"
	/** 状态文本 */
	text: string
}

/**
 * Coworkflow CodeLens 接口
 */
export interface CoworkflowCodeLens {
	/** CodeLens 范围 */
	range: vscode.Range
	/** 文档类型 */
	documentType: "coworkflow" | "markdown"
	/** 动作类型 */
	actionType: "execute" | "navigate" | "toggle" | "edit"
	/** 上下文信息 */
	context?: Record<string, any>
	/** 命令 */
	command?: vscode.Command
	/** 是否已解析 */
	isResolved?: boolean
}

/**
 * Coworkflow 文件上下文接口
 */
export interface CoworkflowFileContext {
	/** 文件 URI */
	uri: vscode.Uri
	/** 文件类型 */
	type: "coworkflow" | "markdown"
	/** 最后修改时间 */
	lastModified: Date
	/** 是否活跃 */
	isActive: boolean
}

/**
 * Coworkflow 文件监视器接口
 */
export interface CoworkflowFileWatcher {
	/** 初始化监视器 */
	initialize(): Promise<void>
	/** 释放资源 */
	dispose(): void
	/** 文件变化回调 */
	onFileChanged: vscode.Event<vscode.Uri>
	/** 获取 Coworkflow 路径 */
	getCoworkflowPath(): string
}

/**
 * Coworkflow CodeLens 提供者接口
 */
export interface CoworkflowCodeLensProvider {
	/** 提供 CodeLens */
	provideCodeLenses(
		document: vscode.TextDocument,
		token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.CodeLens[]>

	/** 解析 CodeLens 命令 */
	resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens>

	/** 释放资源 */
	dispose(): void
}

/**
 * Coworkflow 装饰提供者接口
 */
export interface CoworkflowDecorationProvider {
	/** 更新装饰 */
	updateDecorations(document: vscode.TextDocument): void
	/** 释放资源 */
	dispose(): void
}
