/**
 * Coworkflow 模块主入口
 * 提供与 .coworkflow Markdown 文件支持相关的核心功能
 */

import * as vscode from "vscode"
import { createCommandRegistry, createDefaultCommandHandlers } from "./commands"
import { createProviders } from "./providers"
import {
	createErrorHandler,
	createFileSystemErrorHandler,
	createParsingErrorHandler,
	createProviderErrorHandler,
	createErrorLogger,
	createErrorMessageDisplay,
	createErrorBoundary,
} from "./services"
import { CoworkflowCommandRegistry } from "./types/commands"

/**
 * Coworkflow 模块配置接口
 */
export interface CoworkflowConfig {
	/** 是否启用 CodeLens */
	enableCodeLens?: boolean
	/** 是否启用装饰 */
	enableDecorations?: boolean
	/** 是否启用文件监视 */
	enableFileWatcher?: boolean
	/** 自定义命令处理程序 */
	customCommandHandlers?: any[]
}

/**
 * Coworkflow 模块类
 */
export class CoworkflowModule {
	private commandRegistry: CoworkflowCommandRegistry
	private providers: ReturnType<typeof createProviders>
	private errorHandler: ReturnType<typeof createErrorHandler>
	private fileSystemErrorHandler: ReturnType<typeof createFileSystemErrorHandler>
	private parsingErrorHandler: ReturnType<typeof createParsingErrorHandler>
	private errorLogger: ReturnType<typeof createErrorLogger>
	private errorMessageDisplay: ReturnType<typeof createErrorMessageDisplay>
	private errorBoundary: ReturnType<typeof createErrorBoundary>
	private disposables: vscode.Disposable[] = []
	private isInitialized = false

	constructor(private config: CoworkflowConfig = {}) {
		this.errorLogger = createErrorLogger()
		this.errorMessageDisplay = createErrorMessageDisplay()
		this.errorHandler = createErrorHandler()
		this.errorBoundary = createErrorBoundary(this.errorHandler)
		this.fileSystemErrorHandler = createFileSystemErrorHandler(this.errorHandler)
		this.parsingErrorHandler = createParsingErrorHandler(this.errorHandler)

		// 创建命令注册表时传入错误处理服务
		this.commandRegistry = createCommandRegistry(this.errorHandler)

		// 创建提供者专用的错误处理服务
		const providerErrorHandler = createProviderErrorHandler(this.errorHandler)

		// 创建提供者时传入错误处理服务
		this.providers = createProviders(
			this.errorHandler,
			providerErrorHandler,
			this.parsingErrorHandler,
			this.fileSystemErrorHandler,
			this.errorBoundary,
		)
	}

	/**
	 * 初始化模块
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			// 注册默认命令处理程序
			const defaultHandlers = createDefaultCommandHandlers()
			defaultHandlers.forEach((handler) => {
				this.commandRegistry.registerCommand(handler)
			})

			// 注册自定义命令处理程序
			if (this.config.customCommandHandlers) {
				this.config.customCommandHandlers.forEach((handler) => {
					this.commandRegistry.registerCommand(handler)
				})
			}

			// 注册 CodeLens 提供者
			if (this.config.enableCodeLens !== false) {
				const codeLensDisposable = vscode.languages.registerCodeLensProvider(
					{ pattern: "**/.coworkflow/**/*.md" },
					this.providers.codeLensProvider,
				)
				this.disposables.push(codeLensDisposable)
			}

			// 注册文件监视器
			if (this.config.enableFileWatcher !== false) {
				await this.providers.fileWatcher.initialize()

				// 监听文件变化事件
				this.providers.fileWatcher.onFileChanged((uri) => {
					this.handleFileChanged(uri)
				})
			}

			// 注册文档事件监听器
			this.registerDocumentEventListeners()

			this.isInitialized = true
		} catch (error) {
			console.error("Failed to initialize Coworkflow module:", error)
			throw error
		}
	}

	/**
	 * 处理文件变化
	 */
	private handleFileChanged(uri: vscode.Uri): void {
		// TODO: 实现文件变化处理逻辑
		console.log(`File changed: ${uri.fsPath}`)
	}

	/**
	 * 注册文档事件监听器
	 */
	private registerDocumentEventListeners(): void {
		// 监听文档打开事件
		const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
			if (this.isCoworkflowDocument(document)) {
				this.handleDocumentOpen(document)
			}
		})

		// 监听文档保存事件
		const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument((document) => {
			if (this.isCoworkflowDocument(document)) {
				this.handleDocumentSave(document)
			}
		})

		// 监听活动编辑器变化事件
		const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor && this.isCoworkflowDocument(editor.document)) {
				this.handleActiveEditorChange(editor.document)
			}
		})

		this.disposables.push(onDidOpenTextDocument, onDidSaveTextDocument, onDidChangeActiveTextEditor)
	}

	/**
	 * 检查是否为 Coworkflow 文档
	 */
	private isCoworkflowDocument(document: vscode.TextDocument): boolean {
		return document.uri.fsPath.includes(".coworkflow") && document.uri.fsPath.endsWith(".md")
	}

	/**
	 * 处理文档打开
	 */
	private handleDocumentOpen(document: vscode.TextDocument): void {
		// TODO: 实现文档打开处理逻辑
		if (this.config.enableDecorations !== false) {
			this.providers.decorationProvider.updateDecorations(document)
		}
	}

	/**
	 * 处理文档保存
	 */
	private handleDocumentSave(document: vscode.TextDocument): void {
		// TODO: 实现文档保存处理逻辑
		if (this.config.enableDecorations !== false) {
			this.providers.decorationProvider.updateDecorations(document)
		}
	}

	/**
	 * 处理活动编辑器变化
	 */
	private handleActiveEditorChange(document: vscode.TextDocument): void {
		// TODO: 实现活动编辑器变化处理逻辑
		if (this.config.enableDecorations !== false) {
			this.providers.decorationProvider.updateDecorations(document)
		}
	}

	/**
	 * 获取命令注册表
	 */
	getCommandRegistry(): CoworkflowCommandRegistry {
		return this.commandRegistry
	}

	/**
	 * 获取提供者
	 */
	getProviders() {
		return this.providers
	}

	/**
	 * 获取错误处理服务
	 */
	getErrorHandler() {
		return this.errorHandler
	}

	/**
	 * 获取文件系统错误处理服务
	 */
	getFileSystemErrorHandler() {
		return this.fileSystemErrorHandler
	}

	/**
	 * 获取解析错误处理服务
	 */
	getParsingErrorHandler() {
		return this.parsingErrorHandler
	}

	/**
	 * 获取错误日志记录服务
	 */
	getErrorLogger() {
		return this.errorLogger
	}

	/**
	 * 获取错误消息显示服务
	 */
	getErrorMessageDisplay() {
		return this.errorMessageDisplay
	}

	/**
	 * 获取错误边界服务
	 */
	getErrorBoundary() {
		return this.errorBoundary
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.disposables.forEach((disposable) => disposable.dispose())
		this.disposables = []

		this.commandRegistry.dispose()
		this.providers.codeLensProvider.dispose()
		this.providers.decorationProvider.dispose()
		this.providers.fileWatcher.dispose()
		this.errorHandler.dispose()
		this.fileSystemErrorHandler.dispose()
		this.parsingErrorHandler.dispose()
		this.errorLogger.dispose()
		this.errorMessageDisplay.dispose()
		this.errorBoundary.dispose()

		this.isInitialized = false
	}
}

/**
 * 创建 Coworkflow 模块实例
 */
export const createCoworkflowModule = (config?: CoworkflowConfig): CoworkflowModule => {
	return new CoworkflowModule(config)
}
