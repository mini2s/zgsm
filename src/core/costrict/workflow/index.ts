/**
 * Coworkflow integration entry point
 * Manages the lifecycle of all coworkflow components
 */

import * as vscode from "vscode"
import { CoworkflowFileWatcher } from "./CoworkflowFileWatcher"
import { CoworkflowCodeLensProvider } from "./CoworkflowCodeLensProvider"
import { CoworkflowDecorationProvider } from "./CoworkflowDecorationProvider"
import { registerCoworkflowCommands, setCommandHandlerDependencies, clearCommandHandlerDependencies } from "./commands"
import { CoworkflowErrorHandler } from "./CoworkflowErrorHandler"
import { TaskEditTracker } from "./TaskEditTracker"
import { TaskContentProvider } from "./TaskContentProvider"
import { TaskSender } from "./TaskSender"
import { ClineProvider } from "../../webview/ClineProvider"
import { getOutputChannel } from "../../../extension"

// Re-export classes and constants for external use
export { CoworkflowFileWatcher } from "./CoworkflowFileWatcher"
export { CoworkflowCodeLensProvider } from "./CoworkflowCodeLensProvider"
export { CoworkflowDecorationProvider } from "./CoworkflowDecorationProvider"
export { COWORKFLOW_COMMANDS } from "./commands"
export * from "./types"

/**
 * Coworkflow integration manager
 */
export class CoworkflowIntegration {
	private fileWatcher: CoworkflowFileWatcher | undefined
	private codeLensProvider: CoworkflowCodeLensProvider | undefined
	private decorationProvider: CoworkflowDecorationProvider | undefined
	private taskEditTracker: TaskEditTracker | undefined
	private taskContentProvider: TaskContentProvider | undefined
	private taskSender: TaskSender | undefined
	private disposables: vscode.Disposable[] = []
	private errorHandler: CoworkflowErrorHandler

	constructor() {
		const outputChannel = getOutputChannel()
		this.errorHandler = new CoworkflowErrorHandler(outputChannel)
	}

	/**
	 * Activate coworkflow integration
	 */
	public activate(context: vscode.ExtensionContext, clineProvider?: ClineProvider): void {
		try {
			// Initialize file watcher
			this.fileWatcher = new CoworkflowFileWatcher()
			this.fileWatcher.initialize()
			this.disposables.push(this.fileWatcher)

			// Initialize task-related components if ClineProvider is available
			if (clineProvider) {
				try {
					// Initialize TaskEditTracker
					this.taskEditTracker = new TaskEditTracker(clineProvider, "coworkflow-integration")
					this.disposables.push(this.taskEditTracker)

					// Initialize TaskContentProvider (no dispose method needed)
					this.taskContentProvider = new TaskContentProvider()

					// Initialize TaskSender with config from settings
					const taskSenderConfig = this.getTaskSenderConfig(context)
					this.taskSender = new TaskSender(taskSenderConfig)

					// Connect TaskEditTracker to FileWatcher
					this.fileWatcher.setTaskEditTracker(this.taskEditTracker)

					console.log("CoworkflowIntegration: Task sync components initialized successfully")
				} catch (taskError) {
					const coworkflowError = this.errorHandler.createError(
						"command_error",
						"warning",
						"Failed to initialize task sync components",
						taskError as Error,
					)
					this.errorHandler.handleError(coworkflowError)
					// Continue without task sync functionality
				}
			} else {
				console.log("CoworkflowIntegration: ClineProvider not available, task sync disabled")
			}

			// Initialize CodeLens provider
			this.codeLensProvider = new CoworkflowCodeLensProvider(this.fileWatcher)
			const codeLensDisposable = vscode.languages.registerCodeLensProvider(
				{ scheme: "file", pattern: "**/.cospec/**/*.md" }, // Updated pattern to support subdirectories
				this.codeLensProvider,
			)
			this.disposables.push(codeLensDisposable)
			this.disposables.push(this.codeLensProvider)

			// Initialize decoration provider
			this.decorationProvider = new CoworkflowDecorationProvider()
			this.disposables.push(this.decorationProvider)

			// Connect file watcher to providers
			this.setupProviderConnections()

			// Register commands
			const commandDisposables = registerCoworkflowCommands(context)
			this.disposables.push(...commandDisposables)

			// Connect command handlers with providers
			setCommandHandlerDependencies({
				codeLensProvider: this.codeLensProvider,
				decorationProvider: this.decorationProvider,
				fileWatcher: this.fileWatcher,
				taskEditTracker: this.taskEditTracker,
				taskContentProvider: this.taskContentProvider,
				taskSender: this.taskSender,
			})

			// Add all disposables to context
			context.subscriptions.push(...this.disposables)

			// Initialize decorations for already open documents with a delay
			// to ensure all components are fully initialized
			setTimeout(() => {
				this.initializeExistingDocuments()
			}, 500)

			this.errorHandler.logError(
				this.errorHandler.createError("command_error", "info", "Coworkflow integration successfully activated"),
			)
			console.log("CoworkflowIntegration: Successfully activated")
		} catch (error) {
			const coworkflowError = this.errorHandler.createError(
				"command_error",
				"critical",
				"Failed to activate coworkflow integration",
				error as Error,
			)
			this.errorHandler.handleError(coworkflowError)

			// Attempt cleanup of partially initialized components
			this.deactivate()
			throw error
		}
	}

	/**
	 * Deactivate coworkflow integration
	 */
	public deactivate(): void {
		try {
			// Dispose of all disposables in reverse order for proper cleanup
			const disposablesToCleanup = [...this.disposables].reverse()
			disposablesToCleanup.forEach((disposable, index) => {
				try {
					disposable.dispose()
				} catch (error) {
					this.errorHandler.logError(
						this.errorHandler.createError(
							"provider_error",
							"warning",
							`Error disposing component ${index}`,
							error as Error,
						),
					)
				}
			})
			this.disposables = []

			// Clear provider references
			this.fileWatcher = undefined
			this.codeLensProvider = undefined
			this.decorationProvider = undefined
			this.taskEditTracker = undefined
			this.taskContentProvider = undefined
			this.taskSender = undefined

			// Clear command handler dependencies
			clearCommandHandlerDependencies()

			this.errorHandler.logError(
				this.errorHandler.createError(
					"command_error",
					"info",
					"Coworkflow integration successfully deactivated",
				),
			)

			// Dispose error handler last
			this.errorHandler.dispose()

			console.log("CoworkflowIntegration: Successfully deactivated")
		} catch (error) {
			console.error("CoworkflowIntegration: Error during deactivation", error)
			// Still try to dispose error handler
			try {
				this.errorHandler.dispose()
			} catch (handlerError) {
				console.error("CoworkflowIntegration: Error disposing error handler", handlerError)
			}
		}
	}

	/**
	 * Setup connections between file watcher and providers
	 */
	private setupProviderConnections(): void {
		if (!this.fileWatcher || !this.codeLensProvider || !this.decorationProvider) {
			return
		}

		// Connect file change events to providers
		this.disposables.push(
			this.fileWatcher.onDidFileChange((event) => {
				try {
					// Refresh CodeLens when files change
					this.codeLensProvider?.refresh()

					// Update decorations for tasks.md files
					if (event.documentType === "tasks") {
						// Find the document and update decorations
						const document = vscode.workspace.textDocuments.find(
							(doc) => doc.uri.toString() === event.uri.toString(),
						)
						if (document) {
							this.decorationProvider?.updateDecorations(document)
						}
					}
				} catch (error) {
					this.errorHandler.handleError(
						this.errorHandler.createError(
							"provider_error",
							"warning",
							"Error handling file change event",
							error as Error,
							event.uri,
						),
					)
				}
			}),
		)

		// Update decorations when documents are opened
		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((document) => {
				try {
					if (this.isCoworkflowDocument(document)) {
						this.decorationProvider?.updateDecorations(document)
					}
				} catch (error) {
					this.errorHandler.handleError(
						this.errorHandler.createError(
							"provider_error",
							"warning",
							"Error handling document open event",
							error as Error,
							document.uri,
						),
					)
				}
			}),
		)

		// Update decorations when visible editors change
		this.disposables.push(
			vscode.window.onDidChangeVisibleTextEditors(() => {
				try {
					this.decorationProvider?.refreshAll()
				} catch (error) {
					this.errorHandler.handleError(
						this.errorHandler.createError(
							"provider_error",
							"warning",
							"Error handling visible editors change",
							error as Error,
						),
					)
				}
			}),
		)

		// Handle workspace folder changes
		this.disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders((event) => {
				try {
					// If workspace folders are removed, clean up related resources
					if (event.removed.length > 0) {
						console.log("CoworkflowIntegration: Workspace folders removed, refreshing watchers")
						// File watcher will handle this automatically through its own event handler
					}

					// If workspace folders are added, the file watcher will detect them
					if (event.added.length > 0) {
						console.log("CoworkflowIntegration: Workspace folders added, refreshing watchers")
					}
				} catch (error) {
					this.errorHandler.handleError(
						this.errorHandler.createError(
							"file_system_error",
							"warning",
							"Error handling workspace folder changes",
							error as Error,
						),
					)
				}
			}),
		)

		// Handle configuration changes
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration((event) => {
				try {
					// Check if coworkflow-related configuration changed
					if (event.affectsConfiguration("coworkflow")) {
						console.log("CoworkflowIntegration: Configuration changed, refreshing providers")
						this.codeLensProvider?.refresh()
						this.decorationProvider?.refreshAll()
					}
				} catch (error) {
					this.errorHandler.handleError(
						this.errorHandler.createError(
							"provider_error",
							"warning",
							"Error handling configuration change",
							error as Error,
						),
					)
				}
			}),
		)
	}

	/**
	 * Check if a document is a coworkflow document
	 */
	private isCoworkflowDocument(document: vscode.TextDocument): boolean {
		if (!this.fileWatcher) {
			return false
		}

		// First try to get document info from file watcher
		const documentInfo = this.fileWatcher.getDocumentInfoFromUri(document.uri)
		if (documentInfo !== undefined) {
			return true
		}

		// Fallback: check if the file path matches coworkflow pattern
		const path = document.uri.path
		const fileName = path.split("/").pop()
		const parentDir = path.split("/")

		// Check if file is within .cospec directory
		if (!parentDir.includes(".cospec")) {
			return false
		}

		// Check if it's one of the supported files
		return fileName === "tasks.md" || fileName === "requirements.md" || fileName === "design.md"
	}

	/**
	 * Get the current file watcher instance
	 */
	public getFileWatcher(): CoworkflowFileWatcher | undefined {
		return this.fileWatcher
	}

	/**
	 * Get the current CodeLens provider instance
	 */
	public getCodeLensProvider(): CoworkflowCodeLensProvider | undefined {
		return this.codeLensProvider
	}

	/**
	 * Get the current decoration provider instance
	 */
	public getDecorationProvider(): CoworkflowDecorationProvider | undefined {
		return this.decorationProvider
	}

	/**
	 * Get the current task edit tracker instance
	 */
	public getTaskEditTracker(): TaskEditTracker | undefined {
		return this.taskEditTracker
	}

	/**
	 * Get the current task content provider instance
	 */
	public getTaskContentProvider(): TaskContentProvider | undefined {
		return this.taskContentProvider
	}

	/**
	 * Get the current task sender instance
	 */
	public getTaskSender(): TaskSender | undefined {
		return this.taskSender
	}

	/**
	 * 获取任务发送器配置
	 * @param context VSCode 扩展上下文
	 * @returns 任务发送器配置
	 */
	private getTaskSenderConfig(context: vscode.ExtensionContext): any {
		// 从 VSCode 配置中读取任务同步设置
		const config = vscode.workspace.getConfiguration("roo-code")

		return {
			type: config.get<"http" | "file" | "api">("taskSyncType") || "file",
			endpoint: config.get<string>("taskSyncEndpoint") || ".cospec/task-sync-data.json",
			timeout: config.get<number>("taskSyncTimeout") || 5000,
			retryEnabled: config.get<boolean>("taskSyncRetryEnabled") ?? true,
			headers: config.get<Record<string, string>>("taskSyncHeaders") || {},
		}
	}

	/**
	 * Initialize decorations for already open documents
	 */
	private initializeExistingDocuments(): void {
		try {
			// Apply decorations to already open coworkflow documents
			vscode.workspace.textDocuments.forEach((document) => {
				if (this.isCoworkflowDocument(document)) {
					console.log(`CoworkflowIntegration: Initializing decorations for ${document.uri.path}`)
					this.decorationProvider?.updateDecorations(document)
				}
			})
		} catch (error) {
			this.errorHandler.handleError(
				this.errorHandler.createError(
					"provider_error",
					"warning",
					"Error initializing decorations for existing documents",
					error as Error,
				),
			)
		}
	}

	/**
	 * Handle graceful shutdown scenarios
	 */
	public gracefulShutdown(): void {
		try {
			console.log("CoworkflowIntegration: Starting graceful shutdown")

			// Clear decorations from all open documents
			if (this.decorationProvider) {
				vscode.workspace.textDocuments.forEach((document) => {
					if (this.isCoworkflowDocument(document)) {
						this.decorationProvider?.clearDecorations(document)
					}
				})
			}

			// Perform normal deactivation
			this.deactivate()

			console.log("CoworkflowIntegration: Graceful shutdown completed")
		} catch (error) {
			console.error("CoworkflowIntegration: Error during graceful shutdown", error)
			// Still attempt normal deactivation
			this.deactivate()
		}
	}
}

// Global instance
let coworkflowIntegration: CoworkflowIntegration | undefined

/**
 * Activate coworkflow integration
 */
export function activateCoworkflowIntegration(context: vscode.ExtensionContext): void {
	if (coworkflowIntegration) {
		console.warn("CoworkflowIntegration: Already activated")
		return
	}

	coworkflowIntegration = new CoworkflowIntegration()
	coworkflowIntegration.activate(context)
}

/**
 * Deactivate coworkflow integration
 */
export function deactivateCoworkflowIntegration(): void {
	if (coworkflowIntegration) {
		coworkflowIntegration.gracefulShutdown()
		coworkflowIntegration = undefined
	}
}

/**
 * Get the current coworkflow integration instance
 */
export function getCoworkflowIntegration(): CoworkflowIntegration | undefined {
	return coworkflowIntegration
}
