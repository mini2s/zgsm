/**
 * Coworkflow 提供者
 * 提供与 .coworkflow Markdown 文件支持相关的各种提供者实现
 */

import * as vscode from "vscode"
import {
	CoworkflowCodeLensProvider,
	CoworkflowDecorationProvider,
	CoworkflowFileWatcher,
	CoworkflowCodeLens,
	TaskStatus,
} from "../types/interfaces"
import {
	CoworkflowErrorHandlerService,
	CoworkflowProviderErrorHandler,
	CoworkflowParsingErrorHandler,
	CoworkflowErrorBoundary,
} from "../services"
import { ErrorLevel, ErrorCategory, ProviderError, ParsingError } from "../types/errors"

/**
 * Markdown 解析工具类
 */
class MarkdownParser {
	/**
	 * 解析 Markdown 文档结构
	 */
	parseDocument(content: string): {
		headings: Array<{ level: number; text: string; line: number }>
		tasks: Array<{ text: string; line: number; completed: boolean }>
	} {
		const lines = content.split("\n")
		const headings: Array<{ level: number; text: string; line: number }> = []
		const tasks: Array<{ text: string; line: number; completed: boolean }> = []

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			// 解析标题
			const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
			if (headingMatch) {
				headings.push({
					level: headingMatch[1].length,
					text: headingMatch[2].trim(),
					line: i,
				})
			}

			// 解析任务项
			const taskMatch = line.match(/^-\s+\[([ x])\]\s+(.+)$/)
			if (taskMatch) {
				tasks.push({
					text: taskMatch[2].trim(),
					line: i,
					completed: taskMatch[1] === "x",
				})
			}
		}

		return { headings, tasks }
	}

	/**
	 * 查找特定级别的标题
	 */
	findHeadingsByLevel(content: string, level: number): Array<{ text: string; line: number }> {
		const { headings } = this.parseDocument(content)
		return headings.filter((h) => h.level === level).map((h) => ({ text: h.text, line: h.line }))
	}

	/**
	 * 查找所有任务项
	 */
	findAllTasks(content: string): Array<{ text: string; line: number; completed: boolean }> {
		const { tasks } = this.parseDocument(content)
		return tasks
	}

	/**
	 * 查找未完成的任务
	 */
	findPendingTasks(content: string): Array<{ text: string; line: number }> {
		const { tasks } = this.parseDocument(content)
		return tasks.filter((t) => !t.completed).map((t) => ({ text: t.text, line: t.line }))
	}

	/**
	 * 查找已完成的任务
	 */
	findCompletedTasks(content: string): Array<{ text: string; line: number }> {
		const { tasks } = this.parseDocument(content)
		return tasks.filter((t) => t.completed).map((t) => ({ text: t.text, line: t.line }))
	}
}

/**
 * 任务状态解析工具类
 */
class TaskStatusParser {
	/**
	 * 解析文档中的任务状态
	 */
	parseTaskStatuses(content: string): TaskStatus[] {
		const lines = content.split("\n")
		const taskStatuses: TaskStatus[] = []

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const taskStatus = this.parseTaskStatus(line, i)
			if (taskStatus) {
				taskStatuses.push(taskStatus)
			}
		}

		return taskStatuses
	}

	/**
	 * 解析单行任务状态
	 */
	private parseTaskStatus(line: string, lineNumber: number): TaskStatus | null {
		// 匹配 [ ]、[-]、[x] 模式
		const match = line.match(/^-\s+\[([ \-x])\]\s+(.+)$/)
		if (!match) {
			return null
		}

		const statusChar = match[1]
		const taskText = match[2].trim()
		const status = this.mapStatusCharToStatus(statusChar)

		// 计算任务状态的范围
		const startIndex = line.indexOf("[")
		const endIndex = line.indexOf("]") + 1
		const range = new vscode.Range(
			new vscode.Position(lineNumber, startIndex),
			new vscode.Position(lineNumber, endIndex),
		)

		return {
			line: lineNumber,
			range,
			status,
			text: taskText,
		}
	}

	/**
	 * 将状态字符映射到状态枚举
	 */
	private mapStatusCharToStatus(statusChar: string): "pending" | "in-progress" | "completed" | "blocked" {
		switch (statusChar) {
			case " ":
				return "pending"
			case "-":
				return "in-progress"
			case "x":
				return "completed"
			default:
				return "pending"
		}
	}

	/**
	 * 查找特定状态的任务
	 */
	findTasksByStatus(content: string, status: "pending" | "in-progress" | "completed" | "blocked"): TaskStatus[] {
		const allTasks = this.parseTaskStatuses(content)
		return allTasks.filter((task) => task.status === status)
	}

	/**
	 * 获取任务统计信息
	 */
	getTaskStatistics(content: string): {
		pending: number
		inProgress: number
		completed: number
		blocked: number
		total: number
	} {
		const allTasks = this.parseTaskStatuses(content)

		return {
			pending: allTasks.filter((task) => task.status === "pending").length,
			inProgress: allTasks.filter((task) => task.status === "in-progress").length,
			completed: allTasks.filter((task) => task.status === "completed").length,
			blocked: allTasks.filter((task) => task.status === "blocked").length,
			total: allTasks.length,
		}
	}
}

/**
 * Coworkflow CodeLens 提供者实现
 */
export class CoworkflowCodeLensProviderImpl implements CoworkflowCodeLensProvider {
	private disposables: vscode.Disposable[] = []
	private markdownParser: MarkdownParser
	private errorHandler: CoworkflowErrorHandlerService
	private providerErrorHandler: CoworkflowProviderErrorHandler
	private parsingErrorHandler: CoworkflowParsingErrorHandler
	private errorBoundary: CoworkflowErrorBoundary

	constructor(
		errorHandler: CoworkflowErrorHandlerService,
		providerErrorHandler: CoworkflowProviderErrorHandler,
		parsingErrorHandler: CoworkflowParsingErrorHandler,
		errorBoundary: CoworkflowErrorBoundary,
	) {
		this.markdownParser = new MarkdownParser()
		this.errorHandler = errorHandler
		this.providerErrorHandler = providerErrorHandler
		this.parsingErrorHandler = parsingErrorHandler
		this.errorBoundary = errorBoundary
	}

	/**
	 * 提供 CodeLens
	 */
	async provideCodeLenses(
		document: vscode.TextDocument,
		token: vscode.CancellationToken,
	): Promise<vscode.CodeLens[]> {
		if (token.isCancellationRequested) {
			return []
		}

		try {
			const documentType = this.detectDocumentType(document)
			if (!documentType) {
				return []
			}

			const codeLenses: vscode.CodeLens[] = []
			const content = document.getText()
			const lines = content.split("\n")

			switch (documentType) {
				case "requirements":
					codeLenses.push(...this.createRequirementsCodeLenses(document, lines))
					break
				case "design":
					codeLenses.push(...this.createDesignCodeLenses(document, lines))
					break
				case "tasks":
					codeLenses.push(...this.createTasksCodeLenses(document, lines))
					break
			}

			return codeLenses
		} catch (error) {
			console.error("Error providing CodeLenses:", error)
			return []
		}
	}

	/**
	 * 解析 CodeLens 命令
	 */
	async resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Promise<vscode.CodeLens> {
		if (token.isCancellationRequested) {
			return codeLens
		}

		try {
			// 如果命令已经存在，直接返回
			if (codeLens.command) {
				return codeLens
			}

			// 根据文档类型和位置创建适当的命令
			// 这里可以根据需要添加更多的逻辑来解析 CodeLens
			return codeLens
		} catch (error) {
			console.error("Error resolving CodeLens:", error)
			return codeLens
		}
	}

	/**
	 * 检测文档类型
	 */
	public detectDocumentType(document: vscode.TextDocument): "requirements" | "design" | "tasks" | null {
		const fileName = document.uri.fsPath.split("/").pop() || ""

		if (fileName === "requirements.md") {
			return "requirements"
		} else if (fileName === "design.md") {
			return "design"
		} else if (fileName === "tasks.md") {
			return "tasks"
		}

		return null
	}

	/**
	 * 为 requirements.md 创建 CodeLens
	 */
	private createRequirementsCodeLenses(document: vscode.TextDocument, lines: string[]): vscode.CodeLens[] {
		const codeLenses: vscode.CodeLens[] = []

		// 查找所有段落标题（## 标题格式）
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const match = line.match(/^##\s+(.+)$/)

			if (match) {
				const range = new vscode.Range(i, 0, i, line.length)
				const codeLens: vscode.CodeLens = new vscode.CodeLens(range)
				codeLens.command = {
					title: "Update",
					command: "coworkflow.updateRequirement",
					arguments: [
						{
							uri: document.uri,
							line: i,
							title: match[1].trim(),
							type: "requirement",
						},
					],
				}

				codeLenses.push(codeLens)
			}
		}

		return codeLenses
	}

	/**
	 * 为 design.md 创建 CodeLens
	 */
	private createDesignCodeLenses(document: vscode.TextDocument, lines: string[]): vscode.CodeLens[] {
		const codeLenses: vscode.CodeLens[] = []

		// 查找所有主要段落标题（## 标题格式）
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const match = line.match(/^##\s+(.+)$/)

			if (match) {
				const range = new vscode.Range(i, 0, i, line.length)
				const codeLens: vscode.CodeLens = new vscode.CodeLens(range)
				codeLens.command = {
					title: "Update",
					command: "coworkflow.updateDesign",
					arguments: [
						{
							uri: document.uri,
							line: i,
							title: match[1].trim(),
							type: "design",
						},
					],
				}

				codeLenses.push(codeLens)
			}
		}

		return codeLenses
	}

	/**
	 * 为 tasks.md 创建 CodeLens
	 */
	private createTasksCodeLenses(document: vscode.TextDocument, lines: string[]): vscode.CodeLens[] {
		const codeLenses: vscode.CodeLens[] = []

		// 查找所有任务项（- [ ] 任务格式 或 - [x] 任务格式）
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const match = line.match(/^-\s+\[([ x])\]\s+(.+)$/)

			if (match) {
				const isCompleted = match[1] === "x"
				const taskTitle = match[2].trim()
				const range = new vscode.Range(i, 0, i, line.length)

				// 为每个任务创建 Run CodeLens
				const runCodeLens: vscode.CodeLens = new vscode.CodeLens(range)
				runCodeLens.command = {
					title: "Run",
					command: "coworkflow.runTask",
					arguments: [
						{
							uri: document.uri,
							line: i,
							title: taskTitle,
							type: "task",
							status: isCompleted ? "completed" : "pending",
						},
					],
				}

				codeLenses.push(runCodeLens)

				// 为未完成的任务创建 Retry CodeLens
				if (!isCompleted) {
					const retryCodeLens: vscode.CodeLens = new vscode.CodeLens(range)
					retryCodeLens.command = {
						title: "Retry",
						command: "coworkflow.retryTask",
						arguments: [
							{
								uri: document.uri,
								line: i,
								title: taskTitle,
								type: "task",
								status: "pending",
							},
						],
					}

					codeLenses.push(retryCodeLens)
				}
			}
		}

		return codeLenses
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.disposables.forEach((disposable) => disposable.dispose())
		this.disposables = []
	}
}

/**
 * Coworkflow 装饰提供者实现
 */
export class CoworkflowDecorationProviderImpl implements CoworkflowDecorationProvider {
	private disposables: vscode.Disposable[] = []
	private taskStatusParser: TaskStatusParser
	private decorationTypes: Map<string, vscode.TextEditorDecorationType>
	private activeDecorations: Map<string, vscode.DecorationOptions[]>
	private errorHandler: CoworkflowErrorHandlerService
	private providerErrorHandler: CoworkflowProviderErrorHandler
	private parsingErrorHandler: CoworkflowParsingErrorHandler
	private errorBoundary: CoworkflowErrorBoundary

	constructor(
		errorHandler: CoworkflowErrorHandlerService,
		providerErrorHandler: CoworkflowProviderErrorHandler,
		parsingErrorHandler: CoworkflowParsingErrorHandler,
		errorBoundary: CoworkflowErrorBoundary,
	) {
		this.taskStatusParser = new TaskStatusParser()
		this.decorationTypes = new Map()
		this.activeDecorations = new Map()
		this.errorHandler = errorHandler
		this.providerErrorHandler = providerErrorHandler
		this.parsingErrorHandler = parsingErrorHandler
		this.errorBoundary = errorBoundary
		this.initializeDecorationTypes()
		this.setupEventListeners()
	}

	/**
	 * 初始化装饰类型
	 */
	private initializeDecorationTypes(): void {
		// [ ]（未开始）：无背景装饰
		const pendingDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: undefined, // 无背景
			isWholeLine: true,
		})
		this.decorationTypes.set("pending", pendingDecorationType)
		this.disposables.push(pendingDecorationType)

		// [-]（进行中）：浅黄色背景
		const inProgressDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(255, 255, 0, 0.2)",
			isWholeLine: true,
		})
		this.decorationTypes.set("in-progress", inProgressDecorationType)
		this.disposables.push(inProgressDecorationType)

		// [x]（已完成）：浅绿色背景
		const completedDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(0, 255, 0, 0.2)",
			isWholeLine: true,
		})
		this.decorationTypes.set("completed", completedDecorationType)
		this.disposables.push(completedDecorationType)
	}

	/**
	 * 设置事件监听器
	 */
	private setupEventListeners(): void {
		// 监听文档变化事件
		const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
			if (this.isCoworkflowDocument(event.document)) {
				this.updateDecorations(event.document)
			}
		})

		// 监听活动编辑器变化事件
		const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor && this.isCoworkflowDocument(editor.document)) {
				this.updateDecorations(editor.document)
			}
		})

		this.disposables.push(onDidChangeTextDocument, onDidChangeActiveTextEditor)
	}

	/**
	 * 检查是否为 Coworkflow 文档
	 */
	private isCoworkflowDocument(document: vscode.TextDocument): boolean {
		return document.uri.fsPath.includes(".coworkflow") && document.uri.fsPath.endsWith(".md")
	}

	/**
	 * 更新装饰
	 */
	updateDecorations(document: vscode.TextDocument): void {
		try {
			if (!this.isCoworkflowDocument(document)) {
				return
			}

			const activeEditor = vscode.window.activeTextEditor
			if (!activeEditor || activeEditor.document.uri !== document.uri) {
				return
			}

			// 清除现有装饰
			this.clearAllDecorations(activeEditor)

			// 解析任务状态
			const taskStatuses = this.taskStatusParser.parseTaskStatuses(document.getText())

			// 按状态分组装饰
			const decorationsByStatus = new Map<string, vscode.DecorationOptions[]>()
			decorationsByStatus.set("pending", [])
			decorationsByStatus.set("in-progress", [])
			decorationsByStatus.set("completed", [])

			taskStatuses.forEach((taskStatus) => {
				const decoration: vscode.DecorationOptions = {
					range: taskStatus.range,
					hoverMessage: this.getHoverMessage(taskStatus),
				}

				const statusDecorations = decorationsByStatus.get(taskStatus.status) || []
				statusDecorations.push(decoration)
				decorationsByStatus.set(taskStatus.status, statusDecorations)
			})

			// 应用装饰
			decorationsByStatus.forEach((decorations, status) => {
				const decorationType = this.decorationTypes.get(status)
				if (decorationType && decorations.length > 0) {
					activeEditor.setDecorations(decorationType, decorations)
					this.activeDecorations.set(status, decorations)
				}
			})
		} catch (error) {
			console.error("Error updating decorations:", error)
			// 不抛出错误，避免影响其他功能
		}
	}

	/**
	 * 清除所有装饰
	 */
	private clearAllDecorations(editor: vscode.TextEditor): void {
		this.decorationTypes.forEach((decorationType, status) => {
			editor.setDecorations(decorationType, [])
		})
		this.activeDecorations.clear()
	}

	/**
	 * 获取悬停消息
	 */
	private getHoverMessage(taskStatus: TaskStatus): vscode.MarkdownString {
		const statusMessages = {
			pending: "任务未开始",
			"in-progress": "任务进行中",
			completed: "任务已完成",
			blocked: "任务被阻塞",
		}

		const message = new vscode.MarkdownString()
		message.appendMarkdown(`**任务状态**: ${statusMessages[taskStatus.status]}\n\n`)
		message.appendMarkdown(`**任务内容**: ${taskStatus.text}`)

		return message
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.disposables.forEach((disposable) => {
			try {
				disposable.dispose()
			} catch (error) {
				console.error("Error disposing decoration provider resource:", error)
			}
		})
		this.disposables = []
		this.decorationTypes.clear()
		this.activeDecorations.clear()
	}
}

/**
 * Coworkflow 文件监视器实现
 */
export class CoworkflowFileWatcherImpl implements CoworkflowFileWatcher {
	private disposables: vscode.Disposable[] = []
	private _onFileChanged = new vscode.EventEmitter<vscode.Uri>()
	private workspacePath: string
	private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map()
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map()
	private workspaceWatcher: vscode.Disposable | null = null
	private isInitialized = false
	private errorHandler: CoworkflowErrorHandlerService
	private fileSystemErrorHandler: any // 将在后续更新中添加正确的类型
	private errorBoundary: CoworkflowErrorBoundary

	public readonly onFileChanged = this._onFileChanged.event

	constructor(
		errorHandler: CoworkflowErrorHandlerService,
		fileSystemErrorHandler: any,
		errorBoundary: CoworkflowErrorBoundary,
	) {
		this.workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ""
		this.errorHandler = errorHandler
		this.fileSystemErrorHandler = fileSystemErrorHandler
		this.errorBoundary = errorBoundary
	}

	/**
	 * 初始化监视器
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			await this.setupWorkspaceWatcher()
			await this.setupFileWatchers()
			this.isInitialized = true
		} catch (error) {
			console.error("Failed to initialize CoworkflowFileWatcher:", error)
			throw error
		}
	}

	/**
	 * 设置工作区监视器
	 */
	private async setupWorkspaceWatcher(): Promise<void> {
		// 监听工作区文件夹变化
		this.workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
			await this.handleWorkspaceChange()
		})

		this.disposables.push(this.workspaceWatcher)
	}

	/**
	 * 处理工作区变化
	 */
	private async handleWorkspaceChange(): Promise<void> {
		// 清理现有的文件监视器
		this.disposeFileWatchers()

		// 更新工作区路径
		this.workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ""

		// 重新建立文件监视器
		await this.setupFileWatchers()
	}

	/**
	 * 设置文件监视器
	 */
	private async setupFileWatchers(): Promise<void> {
		if (!this.workspacePath) {
			console.warn("No workspace folder available")
			return
		}

		const coworkflowPath = this.getCoworkflowPath()

		try {
			// 检查 .coworkflow 目录是否存在
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(coworkflowPath))
			} catch (error) {
				// 目录不存在，创建它
				try {
					await vscode.workspace.fs.createDirectory(vscode.Uri.file(coworkflowPath))
					console.log(`Created .coworkflow directory: ${coworkflowPath}`)
				} catch (createError) {
					console.warn(`Failed to create .coworkflow directory: ${createError}`)
					return
				}
			}

			// 监控特定的文件：requirements.md, design.md, tasks.md
			const targetFiles = ["requirements.md", "design.md", "tasks.md"]

			for (const fileName of targetFiles) {
				const filePath = `${coworkflowPath}/${fileName}`
				const fileUri = vscode.Uri.file(filePath)

				try {
					// 检查文件是否存在，如果不存在则创建
					try {
						await vscode.workspace.fs.stat(fileUri)
					} catch (fileError) {
						// 文件不存在，创建空文件
						await vscode.workspace.fs.writeFile(fileUri, new Uint8Array())
						console.log(`Created empty file: ${filePath}`)
					}

					// 创建文件监视器
					const watcher = vscode.workspace.createFileSystemWatcher(
						new vscode.RelativePattern(coworkflowPath, fileName),
					)

					// 监听文件变化事件
					watcher.onDidChange((uri) => this.handleFileChange(uri, "change"))
					watcher.onDidCreate((uri) => this.handleFileChange(uri, "create"))
					watcher.onDidDelete((uri) => this.handleFileChange(uri, "delete"))

					this.fileWatchers.set(fileName, watcher)
					this.disposables.push(watcher)
				} catch (error) {
					console.warn(`Failed to setup watcher for ${fileName}:`, error)
				}
			}
		} catch (error) {
			console.error("Failed to setup file watchers:", error)
		}
	}

	/**
	 * 处理文件变化
	 */
	private handleFileChange(uri: vscode.Uri, eventType: "change" | "create" | "delete"): void {
		const fileName = uri.fsPath.split("/").pop() || ""

		// 实现防抖动机制
		if (this.debounceTimers.has(fileName)) {
			clearTimeout(this.debounceTimers.get(fileName)!)
		}

		const timer = setTimeout(() => {
			this.debounceTimers.delete(fileName)

			// 通知文件变化
			this._onFileChanged.fire(uri)

			// 记录变化事件
			console.log(`File ${eventType}: ${uri.fsPath}`)

			// 这里可以添加更多的协调逻辑，比如通知其他提供者
			this.notifyProviders(uri, eventType)
		}, 300) // 300ms 防抖动延迟

		this.debounceTimers.set(fileName, timer)
	}

	/**
	 * 通知其他提供者文件变化
	 */
	private notifyProviders(uri: vscode.Uri, eventType: "change" | "create" | "delete"): void {
		// 这里可以实现提供者之间的协调更新机制
		// 例如，通知 CodeLens 提供者和装饰提供者更新
		// 具体的实现可以根据需要扩展

		// 发送自定义事件到 VS Code 事件系统
		const event = new CoworkflowFileChangeEvent(uri, eventType)
		vscode.commands.executeCommand("coworkflow.fileChanged", event)
	}

	/**
	 * 清理文件监视器
	 */
	private disposeFileWatchers(): void {
		this.fileWatchers.forEach((watcher, fileName) => {
			watcher.dispose()
			console.log(`Disposed watcher for: ${fileName}`)
		})
		this.fileWatchers.clear()

		// 清理防抖动计时器
		this.debounceTimers.forEach((timer, fileName) => {
			clearTimeout(timer)
		})
		this.debounceTimers.clear()
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.disposeFileWatchers()

		if (this.workspaceWatcher) {
			this.workspaceWatcher.dispose()
			this.workspaceWatcher = null
		}

		this.disposables.forEach((disposable) => disposable.dispose())
		this.disposables = []
		this._onFileChanged.dispose()

		this.isInitialized = false
		console.log("CoworkflowFileWatcher disposed")
	}

	/**
	 * 获取 Coworkflow 路径
	 */
	getCoworkflowPath(): string {
		if (!this.workspacePath) {
			return ""
		}
		return `${this.workspacePath}/.coworkflow`
	}

	/**
	 * 检查文件是否存在
	 */
	async fileExists(filePath: string): Promise<boolean> {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
			return true
		} catch {
			return false
		}
	}

	/**
	 * 获取监视的文件列表
	 */
	getWatchedFiles(): string[] {
		return Array.from(this.fileWatchers.keys())
	}

	/**
	 * 重新初始化监视器
	 */
	async reinitialize(): Promise<void> {
		this.dispose()
		await this.initialize()
	}
}

/**
 * 文件变化事件类
 */
class CoworkflowFileChangeEvent {
	constructor(
		public readonly uri: vscode.Uri,
		public readonly type: "change" | "create" | "delete",
	) {}
}

/**
 * 创建提供者实例
 */
export const createProviders = (
	errorHandler: CoworkflowErrorHandlerService,
	providerErrorHandler: CoworkflowProviderErrorHandler,
	parsingErrorHandler: CoworkflowParsingErrorHandler,
	fileSystemErrorHandler: any, // 将在后续更新中添加正确的类型
	errorBoundary: CoworkflowErrorBoundary,
) => {
	const codeLensProvider = new CoworkflowCodeLensProviderImpl(
		errorHandler,
		providerErrorHandler,
		parsingErrorHandler,
		errorBoundary,
	)
	const decorationProvider = new CoworkflowDecorationProviderImpl(
		errorHandler,
		providerErrorHandler,
		parsingErrorHandler,
		errorBoundary,
	)
	const fileWatcher = new CoworkflowFileWatcherImpl(errorHandler, fileSystemErrorHandler, errorBoundary)

	return {
		codeLensProvider,
		decorationProvider,
		fileWatcher,
	}
}
