/**
 * Command registration and handlers for coworkflow operations
 */

import * as vscode from "vscode"
import {
	CoworkflowCodeLens,
	CoworkflowCommandContext,
	ContentExtractionContext,
	TaskRunData,
	TaskSenderConfig,
} from "./types"
import { CoworkflowErrorHandler } from "./CoworkflowErrorHandler"
import { getCommand } from "../../../utils/commands"
import { supportPrompt, type SupportPromptType } from "../../../shared/support-prompt"
import { ClineProvider } from "../../webview/ClineProvider"
import { SectionContentExtractor, createContentExtractionContext } from "./SectionContentExtractor"
import { TaskEditTracker } from "./TaskEditTracker"
import { TaskContentProvider } from "./TaskContentProvider"
import { TaskSender } from "./TaskSender"
import path from "path"
import { getOutputChannel } from "../../../extension"

/**
 * Command identifiers for coworkflow operations
 */
export const COWORKFLOW_COMMANDS = {
	UPDATE_SECTION: "coworkflow.updateSection",
	RUN_TASK: "coworkflow.runTask",
	RETRY_TASK: "coworkflow.retryTask",
	REFRESH_CODELENS: "coworkflow.refreshCodeLens",
	REFRESH_DECORATIONS: "coworkflow.refreshDecorations",
} as const

/**
 * Command handler dependencies
 */
interface CommandHandlerDependencies {
	codeLensProvider?: any // Will be properly typed when providers are connected
	decorationProvider?: any
	fileWatcher?: any
	taskEditTracker?: any
	taskContentProvider?: any
	taskSender?: any
}

let dependencies: CommandHandlerDependencies = {}
let errorHandler: CoworkflowErrorHandler
let sectionContentExtractor: SectionContentExtractor

// 任务同步相关组件
let taskEditTracker: TaskEditTracker | undefined
let taskContentProvider: TaskContentProvider | undefined
let taskSender: TaskSender | undefined

/**
 * Set command handler dependencies
 */
export function setCommandHandlerDependencies(deps: CommandHandlerDependencies): void {
	dependencies = deps

	// 设置任务同步相关组件的全局引用
	if (deps.taskEditTracker) {
		taskEditTracker = deps.taskEditTracker
	}
	if (deps.taskContentProvider) {
		taskContentProvider = deps.taskContentProvider
	}
	if (deps.taskSender) {
		taskSender = deps.taskSender
	}
	if (!errorHandler) {
		const outputChannel = getOutputChannel()
		errorHandler = new CoworkflowErrorHandler(outputChannel)
	}
	if (!sectionContentExtractor) {
		const sectionOutputChannel = getOutputChannel()
		sectionContentExtractor = new SectionContentExtractor(sectionOutputChannel, {})
	}

	// 初始化任务同步组件
	initializeTaskSyncComponents()
}

/**
 * 初始化任务同步组件
 */
function initializeTaskSyncComponents(): void {
	try {
		// 初始化任务内容提供器
		if (!taskContentProvider) {
			taskContentProvider = new TaskContentProvider()
		}

		// 初始化任务发送器（使用默认配置）
		if (!taskSender) {
			const defaultConfig: TaskSenderConfig = {
				type: "file",
				endpoint: path.join(
					vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
					".cospec",
					"task-runs.json",
				),
				retryEnabled: true,
				timeout: 30000,
			}
			taskSender = new TaskSender(defaultConfig)
		}

		console.log("TaskSync: 任务同步组件初始化完成")
	} catch (error) {
		console.error("TaskSync: 任务同步组件初始化失败:", error)
	}
}

/**
 * Clear command handler dependencies for cleanup
 */
export function clearCommandHandlerDependencies(): void {
	dependencies = {}
	if (errorHandler) {
		errorHandler.dispose()
	}
	if (sectionContentExtractor) {
		sectionContentExtractor.cleanup()
	}

	// 清理任务同步组件
	if (taskEditTracker) {
		taskEditTracker.dispose()
		taskEditTracker = undefined
	}
	if (taskContentProvider) {
		taskContentProvider.clearCache()
		taskContentProvider = undefined
	}
	if (taskSender) {
		taskSender.clearRetryState()
		taskSender = undefined
	}
}

/**
 * Register all coworkflow commands with VS Code
 */
export function registerCoworkflowCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = []

	// Initialize error handler if not already done
	if (!errorHandler) {
		const commandOutputChannel = getOutputChannel()
		errorHandler = new CoworkflowErrorHandler(commandOutputChannel)
	}

	try {
		// 1.egister update section command
		// 应用 supportPromptConfigs 的 WORKFLOW_RQS_UPDATE 更新需求的提示词
		// 应用 supportPromptConfigs 的 WORKFLOW_DESIGN_UPDATE 更新设计的提示词
		disposables.push(
			vscode.commands.registerCommand(getCommand(COWORKFLOW_COMMANDS.UPDATE_SECTION), handleUpdateSection),
		)

		// 2.Register run task command
		// 应用 supportPromptConfigs 的 WORKFLOW_TASK_RUN 执行任务的提示词
		disposables.push(vscode.commands.registerCommand(getCommand(COWORKFLOW_COMMANDS.RUN_TASK), handleRunTask))

		// 3.Register retry task command
		// 应用 supportPromptConfigs 的 WORKFLOW_TASK_RETRY 重试任务的提示词
		disposables.push(vscode.commands.registerCommand(getCommand(COWORKFLOW_COMMANDS.RETRY_TASK), handleRetryTask))

		// 4.Register refresh CodeLens command
		disposables.push(
			vscode.commands.registerCommand(getCommand(COWORKFLOW_COMMANDS.REFRESH_CODELENS), handleRefreshCodeLens),
		)

		// 5.Register refresh decorations command
		disposables.push(
			vscode.commands.registerCommand(
				getCommand(COWORKFLOW_COMMANDS.REFRESH_DECORATIONS),
				handleRefreshDecorations,
			),
		)
	} catch (error) {
		const coworkflowError = errorHandler.createError(
			"command_error",
			"critical",
			"Failed to register coworkflow commands",
			error as Error,
		)
		errorHandler.handleError(coworkflowError)

		// Dispose any successfully registered commands
		disposables.forEach((d) => {
			try {
				d.dispose()
			} catch (disposeError) {
				console.error("Error disposing command during cleanup", disposeError)
			}
		})

		throw error
	}

	return disposables
}

/**
 * Get scope path (directory path without filename) from URI
 */
function getScopePath(uri: vscode.Uri): string {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
	if (!workspaceFolder) {
		return path.dirname(uri.fsPath)
	}

	const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
	return path.dirname(relativePath)
}

/**
 * Get selected text from the active editor
 */
function getSelectedText(): string {
	const activeEditor = vscode.window.activeTextEditor
	if (!activeEditor) {
		return ""
	}

	const selection = activeEditor.selection
	if (selection.isEmpty) {
		// If no selection, return empty string instead of entire document
		return ""
	}

	return activeEditor.document.getText(selection)
}

/**
 * Get task block content based on CodeLens context
 * Enhanced with section extraction support
 */
async function getTaskBlockContent(commandContext: CoworkflowCommandContext): Promise<string> {
	const activeEditor = vscode.window.activeTextEditor
	if (!activeEditor) {
		return ""
	}

	try {
		// Initialize section content extractor if not available
		if (!sectionContentExtractor) {
			sectionContentExtractor = new SectionContentExtractor()
		}

		// Get selected text if any
		const selection = activeEditor.selection
		const selectedText = !selection.isEmpty ? activeEditor.document.getText(selection) : undefined

		// Create extraction context
		const extractionContext = createContentExtractionContext(commandContext, activeEditor.document, selectedText)

		// Use enhanced content extraction
		const result = await sectionContentExtractor.extractContentForCodeLens(extractionContext)

		if (result.success && result.content.trim()) {
			// Log extraction type for debugging
			console.log(`CoworkflowCommands: Content extracted using ${result.type} method`, {
				documentType: commandContext.documentType,
				lineNumber: commandContext.context?.lineNumber,
				contentLength: result.content.length,
				hasSection: !!result.section,
			})

			return result.content
		}

		// Fallback to legacy method if enhanced extraction fails
		console.warn("CoworkflowCommands: Enhanced extraction failed, using fallback", result.error)
		return getTaskBlockContentLegacy(commandContext)
	} catch (error) {
		// Log error and fallback to legacy method
		console.error("CoworkflowCommands: Error in enhanced content extraction", error)
		return getTaskBlockContentLegacy(commandContext)
	}
}

/**
 * Legacy task block content extraction (fallback)
 */
function getTaskBlockContentLegacy(commandContext: CoworkflowCommandContext): string {
	const activeEditor = vscode.window.activeTextEditor
	if (!activeEditor) {
		return ""
	}

	// If user has selected text, use that
	const selection = activeEditor.selection
	if (!selection.isEmpty) {
		return activeEditor.document.getText(selection)
	}

	// If no selection, try to get the task block based on context
	if (commandContext.context?.lineNumber !== undefined) {
		const lineNumber = commandContext.context.lineNumber
		const document = activeEditor.document

		// Get the task line
		if (lineNumber >= 0 && lineNumber < document.lineCount) {
			const taskLine = document.lineAt(lineNumber)

			// For tasks.md files, try to get the task and its sub-content
			if (commandContext.documentType === "tasks") {
				return getTaskWithSubContent(document, lineNumber)
			}

			// For other files, just return the line
			return taskLine.text
		}
	}

	return ""
}

/**
 * Get task content including sub-items
 */
function getTaskWithSubContent(document: vscode.TextDocument, taskLineNumber: number): string {
	const lines: string[] = []
	const taskLine = document.lineAt(taskLineNumber)
	const taskIndent = getIndentLevel(taskLine.text)

	// Add the task line itself
	lines.push(taskLine.text)

	// Look for sub-content (indented lines following the task)
	for (let i = taskLineNumber + 1; i < document.lineCount; i++) {
		const line = document.lineAt(i)
		const lineText = line.text.trim()

		// Stop if we hit an empty line or a line with same/less indentation that looks like another task
		if (lineText === "") {
			continue
		}

		const lineIndent = getIndentLevel(line.text)

		// If this line has less or equal indentation and looks like a task, stop
		if (lineIndent <= taskIndent && (lineText.startsWith("- [") || lineText.startsWith("* ["))) {
			break
		}

		// If this line has more indentation, it's sub-content
		if (lineIndent > taskIndent) {
			lines.push(line.text)
		} else {
			// Same or less indentation but not a task - could be section header, stop
			break
		}
	}

	return lines.join("\n")
}

/**
 * Get indentation level of a line
 */
function getIndentLevel(line: string): number {
	let indent = 0
	for (const char of line) {
		if (char === " ") {
			indent++
		} else if (char === "\t") {
			indent += 4 // Treat tab as 4 spaces
		} else {
			break
		}
	}
	return indent
}
// 需求：requirements
const requirementMode = "architect"
// 设计：architect
const designMode = "task"
// 任务：task
const taskMode = "code"

/**
 * Handle update section command
 */
async function handleUpdateSection(codeLens: CoworkflowCodeLens): Promise<void> {
	try {
		// Validate CodeLens parameter
		if (!codeLens) {
			throw new Error("CodeLens parameter is required")
		}

		if (!codeLens.documentType) {
			throw new Error("CodeLens documentType is required")
		}

		if (!codeLens.actionType) {
			throw new Error("CodeLens actionType is required")
		}

		const commandContext = createCommandContext(codeLens)

		// Get required parameters for prompt
		const scope = getScopePath(commandContext.uri)
		const selectedText = await getTaskBlockContent(commandContext)

		const mode = commandContext.documentType === "requirements" ? requirementMode : designMode // 需求/设计相关操作使用 architect 模式
		// Determine prompt type based on document type
		let promptType: SupportPromptType
		if (commandContext.documentType === "requirements") {
			promptType = "WORKFLOW_RQS_UPDATE"
		} else if (commandContext.documentType === "design") {
			promptType = "WORKFLOW_DESIGN_UPDATE"
		} else {
			throw new Error(`Unsupported document type for update: ${commandContext.documentType}`)
		}

		// Create the prompt using supportPrompt
		await ClineProvider.handleWorkflowAction(
			promptType,
			{
				scope,
				selectedText,
				mode,
			},
			mode,
		)

		// Log detailed context for debugging
		console.log("CoworkflowCommands: Update section requested", {
			documentType: commandContext.documentType,
			actionType: commandContext.actionType,
			uri: commandContext.uri.toString(),
			context: commandContext.context,
			scope,
			selectedTextLength: selectedText.length,
			promptType,
		})
	} catch (error) {
		handleCommandError("Update Section", error, codeLens?.range)
	}
}

/**
 * Handle run task command
 */
async function handleRunTask(codeLens: CoworkflowCodeLens): Promise<void> {
	try {
		// Validate CodeLens parameter
		if (!codeLens) {
			throw new Error("CodeLens parameter is required")
		}

		if (!codeLens.documentType || codeLens.documentType !== "tasks") {
			throw new Error("Run task command requires a tasks document CodeLens")
		}

		if (!codeLens.actionType || codeLens.actionType !== "run") {
			throw new Error('CodeLens actionType must be "run" for run task command')
		}

		const commandContext = createCommandContext(codeLens)

		// // Validate task context
		// if (!commandContext.context?.taskId) {
		// 	errorHandler.logError(
		// 		errorHandler.createError(
		// 			"command_error",
		// 			"warning",
		// 			"Task ID not found - proceeding with generic task execution",
		// 			undefined,
		// 			commandContext.uri,
		// 		),
		// 	)
		// }

		// Get required parameters for prompt
		const scope = getScopePath(commandContext.uri)
		const selectedText = await getTaskBlockContent(commandContext)

		// 任务同步功能：收集和发送任务数据
		await handleTaskSync(commandContext, selectedText)

		// Create the prompt using supportPrompt
		await ClineProvider.handleWorkflowAction(
			"WORKFLOW_TASK_RUN",
			{
				scope,
				selectedText,
				mode: taskMode,
			},
			taskMode,
		)
	} catch (error) {
		handleCommandError("Run Task", error, codeLens?.range)
	}
}

/**
 * Handle retry task command
 */
async function handleRetryTask(codeLens: CoworkflowCodeLens): Promise<void> {
	try {
		// Validate CodeLens parameter
		if (!codeLens) {
			throw new Error("CodeLens parameter is required")
		}

		if (!codeLens.documentType || codeLens.documentType !== "tasks") {
			throw new Error("Retry task command requires a tasks document CodeLens")
		}

		if (!codeLens.actionType || codeLens.actionType !== "retry") {
			throw new Error('CodeLens actionType must be "retry" for retry task command')
		}

		const commandContext = createCommandContext(codeLens)

		// // Validate task context
		// if (!commandContext.context?.taskId) {
		// 	errorHandler.logError(
		// 		errorHandler.createError(
		// 			"command_error",
		// 			"warning",
		// 			"Task ID not found - proceeding with generic task execution",
		// 			undefined,
		// 			commandContext.uri,
		// 		),
		// 	)
		// }

		// Get required parameters for prompt
		const scope = getScopePath(commandContext.uri)
		const selectedText = await getTaskBlockContent(commandContext)
		// // Create the prompt using supportPrompt
		await ClineProvider.handleWorkflowAction(
			"WORKFLOW_TASK_RETRY",
			{
				scope,
				selectedText,
				mode: taskMode,
			},
			taskMode,
		)
	} catch (error) {
		handleCommandError("Retry Task", error, codeLens?.range)
	}
}

/**
 * Handle refresh CodeLens command
 */
async function handleRefreshCodeLens(): Promise<void> {
	try {
		let refreshed = false

		// Try to refresh through the provider if available
		if (dependencies.codeLensProvider && typeof dependencies.codeLensProvider.refresh === "function") {
			try {
				dependencies.codeLensProvider.refresh()
				refreshed = true
				errorHandler.logError(
					errorHandler.createError("command_error", "info", "CodeLens refreshed through provider"),
				)
			} catch (providerError) {
				errorHandler.logError(
					errorHandler.createError(
						"provider_error",
						"warning",
						"Error refreshing CodeLens through provider - trying fallback",
						providerError as Error,
					),
				)
			}
		}

		// Fallback to VS Code command if provider refresh failed
		if (!refreshed) {
			try {
				await vscode.commands.executeCommand("vscode.executeCodeLensProvider")
				refreshed = true
				errorHandler.logError(
					errorHandler.createError("command_error", "info", "CodeLens refreshed through VS Code command"),
				)
			} catch (vscodeError) {
				errorHandler.logError(
					errorHandler.createError(
						"command_error",
						"warning",
						"Error refreshing CodeLens through VS Code command",
						vscodeError as Error,
					),
				)
			}
		}

		if (refreshed) {
			vscode.window.showInformationMessage("CodeLens refreshed")
		} else {
			throw new Error("Failed to refresh CodeLens through all available methods")
		}
	} catch (error) {
		handleCommandError("Refresh CodeLens", error)
	}
}

/**
 * Handle refresh decorations command
 */
async function handleRefreshDecorations(): Promise<void> {
	try {
		let refreshed = false

		// Try to refresh through the provider if available
		if (dependencies.decorationProvider && typeof dependencies.decorationProvider.refreshAll === "function") {
			try {
				dependencies.decorationProvider.refreshAll()
				refreshed = true
				errorHandler.logError(
					errorHandler.createError("command_error", "info", "Decorations refreshed through provider"),
				)
			} catch (providerError) {
				errorHandler.logError(
					errorHandler.createError(
						"provider_error",
						"warning",
						"Error refreshing decorations through provider",
						providerError as Error,
					),
				)
			}
		} else {
			errorHandler.logError(
				errorHandler.createError(
					"provider_error",
					"warning",
					"Decoration provider not available or does not support refreshAll",
				),
			)
		}

		if (refreshed) {
			vscode.window.showInformationMessage("Decorations refreshed")
		} else {
			vscode.window.showWarningMessage("Decorations refresh failed - provider not available")
		}

		console.log("CoworkflowCommands: Refresh decorations requested")
	} catch (error) {
		handleCommandError("Refresh Decorations", error)
	}
}

/**
 * Create command context from CodeLens
 */
function createCommandContext(codeLens: CoworkflowCodeLens): CoworkflowCommandContext {
	try {
		// Extract URI from the current active editor
		const activeEditor = vscode.window.activeTextEditor
		if (!activeEditor) {
			throw new Error("No active editor found - please open a coworkflow document")
		}

		// Validate that the active editor is a coworkflow document
		if (!isCoworkflowDocument(activeEditor.document.uri)) {
			throw new Error("Active editor is not a coworkflow document - expected .cospec/*.md file")
		}

		// Validate CodeLens range is within document bounds
		if (codeLens.range) {
			const documentLineCount = activeEditor.document.lineCount
			if (codeLens.range.start.line >= documentLineCount || codeLens.range.end.line >= documentLineCount) {
				errorHandler.logError(
					errorHandler.createError(
						"command_error",
						"warning",
						`CodeLens range (${codeLens.range.start.line}-${codeLens.range.end.line}) exceeds document bounds (${documentLineCount} lines)`,
						undefined,
						activeEditor.document.uri,
					),
				)
			}
		}

		return {
			uri: activeEditor.document.uri,
			documentType: codeLens.documentType,
			actionType: codeLens.actionType,
			context: codeLens.context,
		}
	} catch (error) {
		const coworkflowError = errorHandler.createError(
			"command_error",
			"error",
			"Error creating command context",
			error as Error,
		)
		errorHandler.handleError(coworkflowError)
		throw error
	}
}

/**
 * Handle command execution errors gracefully
 */
function handleCommandError(commandName: string, error: unknown, range?: vscode.Range): void {
	try {
		const errorMessage = error instanceof Error ? error.message : "Unknown error"
		const originalError = error instanceof Error ? error : new Error(String(error))

		// Create structured error
		const coworkflowError = errorHandler.createError(
			"command_error",
			"error",
			`${commandName} command failed: ${errorMessage}`,
			originalError,
			vscode.window.activeTextEditor?.document.uri,
		)

		// Handle the error through the error handler
		errorHandler.handleError(coworkflowError)

		// Show user-friendly error message with actions
		const actions: string[] = ["Show Details"]
		if (range && vscode.window.activeTextEditor) {
			actions.push("Go to Location")
		}

		vscode.window
			.showErrorMessage(`Coworkflow ${commandName} failed: ${errorMessage}`, ...actions)
			.then((action) => {
				if (action === "Show Details") {
					// Show detailed error information
					const detailMessage = `Command: ${commandName}\nError: ${errorMessage}\nTime: ${new Date().toLocaleString()}`
					if (originalError.stack) {
						vscode.window.showInformationMessage(detailMessage, { modal: true })
					}
				} else if (action === "Go to Location" && range && vscode.window.activeTextEditor) {
					// Navigate to the error location
					const editor = vscode.window.activeTextEditor
					editor.selection = new vscode.Selection(range.start, range.end)
					editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
				}
			})
	} catch (handlerError) {
		// Fallback error handling if the error handler itself fails
		console.error(`CoworkflowCommands: Error in ${commandName}`, error)
		console.error("CoworkflowCommands: Error handler also failed", handlerError)

		// Basic user notification as last resort
		const basicMessage = error instanceof Error ? error.message : "Unknown error"
		vscode.window.showErrorMessage(`Coworkflow ${commandName} failed: ${basicMessage}`)
	}
}

/**
 * Utility function to check if a URI is a coworkflow document
 * Supports the three fixed files (requirements.md, design.md, tasks.md) in root and subdirectories
 */
export function isCoworkflowDocument(uri: vscode.Uri): boolean {
	const path = uri.path
	const fileName = path.split("/").pop()
	const parentDir = path.split("/")

	// Check if file is within .cospec directory
	if (!parentDir.includes(".cospec")) {
		return false
	}

	// Only allow the three specific file names
	return ["requirements.md", "design.md", "tasks.md"].includes(fileName || "")
}

/**
 * 处理任务同步功能
 * 收集任务数据并发送到配置的端点，集成 git diff 功能精确检测变更
 */
async function handleTaskSync(commandContext: CoworkflowCommandContext, selectedText: string): Promise<void> {
	try {
		// 确保任务同步组件已初始化
		if (!taskContentProvider || !taskSender) {
			console.warn("TaskSync: 任务同步组件未初始化，跳过同步")
			return
		}

		const filePath = commandContext.uri.fsPath

		// 检查是否为 tasks.md 文件
		if (!filePath.endsWith("tasks.md")) {
			return
		}

		// 获取完整文件内容
		const fullFileContent = await taskContentProvider.getFileContent(filePath)

		// 解析当前行的任务信息
		const taskLine = commandContext.context?.lineNumber || 0
		const taskInfo = taskContentProvider.parseTaskAtLine(fullFileContent, taskLine)

		if (!taskInfo) {
			console.warn("TaskSync: 无法解析任务信息，跳过同步")
			return
		}

		// 获取增强的编辑状态（包含 git diff 信息）
		let hasUserEdits = false
		let lastEditTime = Date.now()
		let diffContent = ""
		let changedLines: import("./types").GitChangedLine[] = []
		let hasGitChanges = false
		let fileStatus: "modified" | "added" | "deleted" | "renamed" | "untracked" | "unchanged" = "unchanged"

		try {
			if (taskEditTracker) {
				// 获取增强的编辑状态
				const enhancedState = await taskEditTracker.getEnhancedEditState(filePath)

				// 传统编辑状态
				hasUserEdits = enhancedState.editState?.hasUserEdits || false
				lastEditTime = enhancedState.editState?.lastEditTime || Date.now()

				// Git diff 信息
				if (enhancedState.gitDiff) {
					diffContent = enhancedState.gitDiff.diffContent
					changedLines = enhancedState.gitDiff.changedLines
					hasGitChanges = enhancedState.gitDiff.hasGitChanges
					fileStatus = enhancedState.gitDiff.fileStatus
				}

				console.log("TaskSync: 获取到增强编辑状态", {
					hasUserEdits,
					hasGitChanges,
					fileStatus,
					changedLinesCount: changedLines.length,
					hasAnyChanges: enhancedState.hasAnyChanges,
				})
			}
		} catch (error) {
			console.warn("TaskSync: 获取增强编辑状态时发生错误，使用默认值:", error)
			hasUserEdits = false
		}

		// 构建任务运行数据（包含 git diff 信息）
		const taskRunData: TaskRunData = {
			filePath: path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "", filePath),
			timestamp: Date.now(),
			taskLine: taskInfo.line,
			taskContent: taskInfo.content,
			taskStatus: taskInfo.status,
			fullFileContent,
			hasUserEdits,
			lastEditTime,
			// Git diff 相关字段
			diffContent: diffContent || undefined,
			changedLines: changedLines.length > 0 ? changedLines : undefined,
			hasGitChanges,
			fileStatus,
			workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
			taskId: taskInfo.taskId,
			userId: undefined, // 可以从认证服务获取
		}

		// 发送任务数据
		const result = await taskSender.send(taskRunData)

		if (result.success) {
			console.log("TaskSync: 任务数据发送成功", {
				taskLine: taskRunData.taskLine,
				taskContent: taskRunData.taskContent,
				hasUserEdits: taskRunData.hasUserEdits,
				hasGitChanges: taskRunData.hasGitChanges,
				fileStatus: taskRunData.fileStatus,
				changedLinesCount: taskRunData.changedLines?.length || 0,
				timestamp: result.timestamp,
			})

			// 成功发送后清除编辑状态
			try {
				if (taskEditTracker && (hasUserEdits || hasGitChanges)) {
					taskEditTracker.clearEditState(filePath)
					console.log("TaskSync: 已清除编辑状态")
				}
			} catch (error) {
				console.warn("TaskSync: 清除编辑状态时发生错误:", error)
			}
		} else {
			console.error("TaskSync: 任务数据发送失败", result.error)
		}
	} catch (error) {
		console.error("TaskSync: 处理任务同步时发生错误:", error)
		// 不抛出错误，避免影响主要功能
	}
}
