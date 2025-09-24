/**
 * TypeScript interfaces and types for coworkflow support
 */

import * as vscode from "vscode"

/**
 * Task status enumeration matching the checkbox patterns in tasks.md
 */
export type TaskStatusType = "not_started" | "in_progress" | "completed"

/**
 * Document types supported by coworkflow
 * Supports both legacy fixed types and flexible subdirectory-based types
 */
export type CoworkflowDocumentType = "requirements" | "design" | "tasks" | "subdirectory" // For markdown files in subdirectories like specs/

/**
 * Extended document information for subdirectory files
 */
export interface CoworkflowDocumentInfo {
	/** Document type */
	type: CoworkflowDocumentType
	/** Relative path from .cospec directory */
	relativePath: string
	/** File name without extension */
	baseName: string
	/** Subdirectory path (empty for root files) */
	subdirectory: string
}

/**
 * CodeLens action types for different operations
 */
export type CoworkflowActionType = "update" | "run" | "retry" | "loading"

/**
 * Task status model representing a task item in tasks.md
 */
export interface TaskStatus {
	/** Line number where the task appears */
	line: number
	/** Text range of the task item */
	range: vscode.Range
	/** Current status of the task */
	status: TaskStatusType
	/** Full text content of the task */
	text: string
	/** Optional task identifier for sub-tasks (e.g., "1.1", "2.3") */
	taskId?: string
}

/**
 * Extended CodeLens with coworkflow-specific context
 */
export interface CoworkflowCodeLens extends vscode.CodeLens {
	/** Type of document this CodeLens belongs to */
	documentType: CoworkflowDocumentType
	/** Type of action this CodeLens performs */
	actionType: CoworkflowActionType
	/** Additional context for the action */
	context?: {
		/** Task identifier for task-specific actions */
		taskId?: string
		/** Section title for section-specific actions */
		sectionTitle?: string
		/** Line number for precise positioning */
		lineNumber?: number
	}
}

/**
 * File context model for tracking coworkflow files
 */
export interface CoworkflowFileContext {
	/** URI of the file */
	uri: vscode.Uri
	/** Type of coworkflow document */
	type: CoworkflowDocumentType
	/** Extended document information */
	documentInfo: CoworkflowDocumentInfo
	/** Last modification timestamp */
	lastModified: Date
	/** Whether the file is currently active/monitored */
	isActive: boolean
}

/**
 * Configuration for coworkflow file monitoring
 */
export interface CoworkflowWatcherConfig {
	/** Whether to enable file watching */
	enabled: boolean
	/** Debounce delay for file change events (ms) */
	debounceDelay: number
	/** File patterns to watch */
	watchPatterns: string[]
}

/**
 * Interface for coworkflow file watcher
 */
export interface ICoworkflowFileWatcher extends vscode.Disposable {
	/** Initialize the file watcher */
	initialize(): void
	/** Handle file change events */
	onFileChanged(uri: vscode.Uri): void
	/** Get the current coworkflow directory path */
	getCoworkflowPath(): string | undefined
	/** Check if a file is being monitored */
	isMonitoring(uri: vscode.Uri): boolean
	/** Get document information from URI */
	getDocumentInfoFromUri(uri: vscode.Uri): CoworkflowDocumentInfo | undefined
}

/**
 * Interface for coworkflow CodeLens provider
 */
export interface ICoworkflowCodeLensProvider extends vscode.CodeLensProvider {
	/** Refresh CodeLens for all documents */
	refresh(): void
	/** Get document type from URI */
	getDocumentType(uri: vscode.Uri): CoworkflowDocumentType | undefined
}

/**
 * Interface for coworkflow decoration provider
 */
export interface ICoworkflowDecorationProvider extends vscode.Disposable {
	/** Update decorations for a document */
	updateDecorations(document: vscode.TextDocument): void
	/** Clear decorations for a document */
	clearDecorations(document: vscode.TextDocument): void
	/** Refresh all decorations */
	refreshAll(): void
}

/**
 * Command context for coworkflow operations
 */
export interface CoworkflowCommandContext {
	/** Document URI */
	uri: vscode.Uri
	/** Document type */
	documentType: CoworkflowDocumentType
	/** Action type */
	actionType: CoworkflowActionType
	/** Additional context data */
	context?: {
		taskId?: string
		sectionTitle?: string
		lineNumber?: number
	}
}

/**
 * Event data for file change notifications
 */
export interface CoworkflowFileChangeEvent {
	/** URI of the changed file */
	uri: vscode.Uri
	/** Type of change */
	changeType: vscode.FileChangeType
	/** Document type if applicable */
	documentType?: CoworkflowDocumentType
}

/**
 * Error severity levels for coworkflow operations
 */
export type CoworkflowErrorSeverity = "info" | "warning" | "error" | "critical"

/**
 * Error types for coworkflow operations
 */
export type CoworkflowErrorType =
	| "file_system_error"
	| "parsing_error"
	| "provider_error"
	| "command_error"
	| "permission_error"
	| "not_found_error"

/**
 * Structured error information for coworkflow operations
 */
export interface CoworkflowError {
	/** Error type classification */
	type: CoworkflowErrorType
	/** Error severity level */
	severity: CoworkflowErrorSeverity
	/** Human-readable error message */
	message: string
	/** Technical details for debugging */
	details?: string
	/** URI of the file related to the error */
	uri?: vscode.Uri
	/** Original error object if available */
	originalError?: Error
	/** Timestamp when error occurred */
	timestamp: Date
}

/**
 * Error handling configuration
 */
export interface CoworkflowErrorConfig {
	/** Whether to log errors to console */
	logToConsole: boolean
	/** Whether to show user notifications for errors */
	showUserNotifications: boolean
	/** Minimum severity level for user notifications */
	notificationThreshold: CoworkflowErrorSeverity
	/** Whether to include technical details in user messages */
	includeTechnicalDetails: boolean
}

/**
 * Interface for error handling utilities
 */
export interface ICoworkflowErrorHandler {
	/** Handle an error with appropriate logging and user feedback */
	handleError(error: CoworkflowError): void
	/** Create a structured error from an exception */
	createError(
		type: CoworkflowErrorType,
		severity: CoworkflowErrorSeverity,
		message: string,
		originalError?: Error,
		uri?: vscode.Uri,
	): CoworkflowError
	/** Log an error without user notification */
	logError(error: CoworkflowError): void
	/** Show user notification for an error */
	showErrorNotification(error: CoworkflowError): void
}

/**
 * 扩展的层级任务状态接口
 * 在原有 TaskStatus 基础上添加层级信息
 */
export interface HierarchicalTaskStatus extends TaskStatus {
	/** 层级深度（0为根级别） */
	hierarchyLevel: number
	/** 父任务的行号（如果有） */
	parentLine?: number
	/** 子任务的行号列表 */
	childrenLines: number[]
	/** 子内容的行号列表（包括普通文本、列表项等） */
	childContentLines: number[]
	/** 层级路径（如 [0, 1, 2] 表示第1个根任务的第2个子任务的第3个子任务） */
	hierarchyPath: number[]
	/** 完整的层级ID（如 "1.2.3"） */
	hierarchicalId: string
}

/**
 * 子内容项接口
 * 表示任务下的非任务内容（如普通文本、列表项等）
 */
export interface TaskChildContent {
	/** 行号 */
	line: number
	/** 文本范围 */
	range: vscode.Range
	/** 内容文本 */
	text: string
	/** 缩进层级 */
	indentLevel: number
	/** 父任务行号 */
	parentTaskLine: number
	/** 父任务状态（用于继承装饰） */
	parentTaskStatus: TaskStatusType
}

/**
 * 层级节点结构
 * 用于构建任务的层级关系树
 */
export interface HierarchyNode {
	/** 任务状态信息 */
	task: HierarchicalTaskStatus
	/** 父节点引用 */
	parent: HierarchyNode | null
	/** 子节点列表 */
	children: HierarchyNode[]
	/** 层级深度 */
	level: number
}

/**
 * 缩进风格配置
 * 用于智能检测和适应项目的缩进风格
 */
export interface IndentStyle {
	/** 缩进类型：空格或制表符 */
	type: "space" | "tab"
	/** 缩进大小：空格数量或制表符数量 */
	size: number
}

/**
 * 层级装饰配置
 * 定义层级装饰的视觉样式和行为
 */
export interface HierarchyDecorationConfig {
	/** 最大支持层级深度 */
	maxDepth: number
	/** 左边框宽度配置 */
	borderWidth: {
		/** 基础宽度（px） */
		base: number
		/** 每级递增（px） */
		increment: number
	}
	/** 颜色配置 */
	colors: {
		/** 不同层级的未开始颜色 */
		notStarted: string[]
		/** 不同层级的进行中颜色 */
		inProgress: string[]
		/** 不同层级的已完成颜色 */
		completed: string[]
	}
	/** 缩进可视化配置 */
	indentVisualization: {
		/** 是否启用缩进可视化 */
		enabled: boolean
		/** 可视化样式 */
		style: "line" | "block" | "gradient"
	}
}

/**
 * 层级装饰策略接口
 * 定义如何应用层级装饰的策略
 */
export interface IHierarchyDecorationStrategy {
	/**
	 * 应用层级装饰
	 * @param document 文档对象
	 * @param hierarchyTree 层级关系树
	 * @param editor 编辑器实例
	 */
	applyDecorations(document: vscode.TextDocument, hierarchyTree: HierarchyNode[], editor: vscode.TextEditor): void
}

/**
 * 层级检测器接口
 * 定义层级识别和解析的核心功能
 */
export interface IHierarchyDetector {
	/**
	 * 检测任务的层级深度
	 * @param line 文本行内容
	 * @returns 层级深度（-1表示非任务行，0为根级别）
	 */
	detectHierarchyLevel(line: string): number

	/**
	 * 构建层级关系树
	 * @param tasks 层级任务状态列表
	 * @returns 层级关系树的根节点列表
	 */
	buildHierarchyTree(tasks: HierarchicalTaskStatus[]): HierarchyNode[]

	/**
	 * 分析文档的缩进风格
	 * @param document 文档对象
	 * @returns 缩进风格配置
	 */
	analyzeIndentStyle(document: vscode.TextDocument): IndentStyle
}

/**
 * 扩展的装饰提供器接口
 * 在原有基础上添加层级装饰支持
 */
export interface IHierarchicalCoworkflowDecorationProvider extends ICoworkflowDecorationProvider {
	/**
	 * 解析文档中的层级任务状态
	 * @param document 文档对象
	 * @returns 层级任务状态列表
	 */
	parseHierarchicalTaskStatuses(document: vscode.TextDocument): HierarchicalTaskStatus[]

	/**
	 * 更新层级装饰配置
	 * @param config 新的层级装饰配置
	 */
	updateHierarchyConfig(config: HierarchyDecorationConfig): void

	/**
	 * 获取当前层级装饰配置
	 * @returns 当前配置
	 */
	getHierarchyConfig(): HierarchyDecorationConfig
}

/**
 * 章节提取相关的类型定义
 */

/**
 * 章节信息接口（从 MarkdownSectionExtractor 导入）
 */
export interface MarkdownSection {
	/** 章节标题（包含 # 符号） */
	title: string
	/** 章节标题（不包含 # 符号） */
	cleanTitle: string
	/** 标题行号（0-based） */
	headerLine: number
	/** 标题级别（1-6） */
	level: number
	/** 章节开始行号（标题行） */
	startLine: number
	/** 章节结束行号（不包含） */
	endLine: number
	/** 章节完整内容（包含标题） */
	content: string
	/** 章节内容（不包含标题） */
	bodyContent: string
	/** 文本范围 */
	range: vscode.Range
}

/**
 * 章节提取选项
 */
export interface SectionExtractionOptions {
	/** 是否包含标题行 */
	includeHeader?: boolean
	/** 是否包含子章节 */
	includeSubsections?: boolean
	/** 最大提取深度（相对于当前章节） */
	maxDepth?: number
	/** 是否去除空行 */
	trimEmptyLines?: boolean
	/** 超时时间（毫秒） */
	timeout?: number
}

/**
 * 内容提取上下文
 */
export interface ContentExtractionContext {
	/** 文档对象 */
	document: vscode.TextDocument
	/** 文档类型 */
	documentType: CoworkflowDocumentType
	/** 行号（可选） */
	lineNumber?: number
	/** 用户选择的文本（可选） */
	selectedText?: string
	/** 是否强制提取章节 */
	forceSection?: boolean
}

/**
 * 提取结果
 */
export interface ExtractionResult {
	/** 提取的内容 */
	content: string
	/** 提取类型 */
	type: "selection" | "section" | "line" | "fallback"
	/** 章节信息（如果适用） */
	section?: MarkdownSection
	/** 是否成功 */
	success: boolean
	/** 错误信息（如果有） */
	error?: string
}

/**
 * 提取策略配置
 */
export interface ExtractionStrategy {
	/** requirements.md 的提取选项 */
	requirements: SectionExtractionOptions
	/** design.md 的提取选项 */
	design: SectionExtractionOptions
	/** tasks.md 的提取选项 */
	tasks: SectionExtractionOptions
	/** 默认提取选项 */
	default: SectionExtractionOptions
}

/**
 * 扩展的 CoworkflowCommandContext 接口
 * 添加章节提取相关的上下文信息
 */
export interface EnhancedCoworkflowCommandContext extends CoworkflowCommandContext {
	/** 章节信息（如果适用） */
	section?: MarkdownSection
	/** 提取结果 */
	extractionResult?: ExtractionResult
	/** 是否启用章节提取 */
	enableSectionExtraction?: boolean
}

/**
 * 章节提取器接口
 */
export interface IMarkdownSectionExtractor {
	/**
	 * 提取文档中的所有章节
	 * @param document VS Code 文档对象
	 * @returns 章节信息数组
	 */
	extractSections(document: vscode.TextDocument): MarkdownSection[]

	/**
	 * 获取指定标题行的完整章节内容
	 * @param document VS Code 文档对象
	 * @param headerLine 标题行号（0-based）
	 * @param options 提取选项
	 * @returns 章节内容字符串
	 */
	getSectionContent(document: vscode.TextDocument, headerLine: number, options?: SectionExtractionOptions): string

	/**
	 * 检测标题级别
	 * @param line 文本行
	 * @returns 标题级别（1-6），如果不是标题返回 -1
	 */
	detectHeaderLevel(line: string): number

	/**
	 * 查找章节边界
	 * @param lines 文档行数组
	 * @param startLine 起始行号
	 * @param headerLevel 标题级别
	 * @param options 提取选项
	 * @returns 章节边界信息
	 */
	findSectionBoundary(
		lines: string[],
		startLine: number,
		headerLevel: number,
		options?: SectionExtractionOptions,
	): { startLine: number; endLine: number }

	/**
	 * 清理缓存
	 */
	clearCache(): void

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats(): { size: number; lastCleanup: Date }
}

/**
 * 智能内容提取器接口
 */
export interface ISectionContentExtractor {
	/**
	 * 为 CodeLens 提取内容
	 * @param context 提取上下文
	 * @returns 提取结果
	 */
	extractContentForCodeLens(context: ContentExtractionContext): Promise<ExtractionResult>

	/**
	 * 判断是否需要提取章节
	 * @param context 提取上下文
	 * @returns 是否需要提取章节
	 */
	shouldExtractSection(context: ContentExtractionContext): boolean

	/**
	 * 获取性能指标
	 */
	getPerformanceMetrics(): Map<string, number>

	/**
	 * 清理缓存和指标
	 */
	cleanup(): void

	/**
	 * 更新提取策略
	 */
	updateStrategy(strategy: Partial<ExtractionStrategy>): void

	/**
	 * 获取当前提取策略
	 */
	getStrategy(): ExtractionStrategy

	/**
	 * 获取章节提取器实例
	 */
	getSectionExtractor(): IMarkdownSectionExtractor
}

/**
 * 章节提取配置
 */
export interface SectionExtractionConfig {
	/** 是否启用章节提取 */
	enabled: boolean
	/** 默认提取策略 */
	defaultStrategy: ExtractionStrategy
	/** 性能监控配置 */
	performance: {
		/** 是否启用性能监控 */
		enabled: boolean
		/** 性能指标保留时间（毫秒） */
		retentionTime: number
		/** 慢查询阈值（毫秒） */
		slowQueryThreshold: number
	}
	/** 缓存配置 */
	cache: {
		/** 是否启用缓存 */
		enabled: boolean
		/** 缓存大小限制 */
		maxSize: number
		/** 缓存过期时间（毫秒） */
		ttl: number
	}
}

/**
 * 任务同步相关的类型定义
 * 基于技术设计文档中的接口定义
 */

/**
 * Git 变更行信息
 */
export interface GitChangedLine {
	/** 变更类型：新增、删除、修改 */
	type: "added" | "removed" | "modified"
	/** 行号 */
	line: number
	/** 行内容 */
	content: string
	/** 原始行号（用于修改的情况） */
	originalLine?: number
}

/**
 * 任务运行数据结构
 * 包含执行任务时需要发送的所有信息
 */
export interface TaskRunData {
	/** 基本信息 */
	filePath: string // '.cospec/tasks.md'
	timestamp: number // 执行时间戳

	/** 任务信息 */
	taskLine: number // 任务所在行号
	taskContent: string // 任务内容
	taskStatus: "pending" | "in-progress" | "completed" // 任务状态

	/** 文件内容 */
	fullFileContent: string // 完整文件内容
	hasUserEdits: boolean // 是否包含用户编辑
	lastEditTime?: number // 最后编辑时间

	/** Git Diff 相关信息 */
	diffContent?: string // git diff 输出
	changedLines?: GitChangedLine[] // 变更的行信息
	hasGitChanges?: boolean // 是否有 git 变更
	fileStatus?: "modified" | "added" | "deleted" | "renamed" | "untracked" | "unchanged" // 文件状态

	/** 上下文信息 */
	workspacePath: string // 工作区路径
	taskId?: string // 关联的任务ID
	userId?: string // 用户ID（如果有认证）
}

/**
 * 发送器配置
 * 支持多种发送方式的配置
 */
export interface TaskSenderConfig {
	type: "http" | "file" | "api"
	endpoint: string // HTTP URL 或文件路径
	headers?: Record<string, string>
	timeout?: number
	retryEnabled?: boolean // 是否启用重试
}

/**
 * 编辑跟踪状态
 * 记录文件的编辑状态和时间信息
 */
export interface EditTrackingState {
	filePath: string
	lastEditTime: number
	hasUserEdits: boolean
	editCount: number
}

/**
 * 发送结果
 * 表示任务数据发送的结果
 */
export interface SendResult {
	success: boolean
	error?: string
	responseData?: any
	timestamp: number
}

/**
 * 任务信息
 * 从 Markdown 中解析出的任务信息
 */
export interface TaskInfo {
	line: number
	content: string
	status: "pending" | "in-progress" | "completed"
	taskId?: string
}

/**
 * 任务编辑跟踪器接口
 * 专门用于跟踪 .cospec/tasks.md 文件的编辑
 */
export interface ITaskEditTracker {
	/**
	 * 处理文件编辑事件
	 * @param filePath 文件路径
	 * @param source 编辑源
	 */
	onFileEdited(filePath: string, source: import("../../context-tracking/FileContextTrackerTypes").RecordSource): void

	/**
	 * 检查文件是否有最近的编辑
	 * @param filePath 文件路径
	 * @returns 是否有最近编辑
	 */
	hasRecentEdits(filePath: string): boolean

	/**
	 * 获取文件的编辑状态
	 * @param filePath 文件路径
	 * @returns 编辑状态或null
	 */
	getEditState(filePath: string): EditTrackingState | null

	/**
	 * 清除文件的编辑状态
	 * @param filePath 文件路径
	 */
	clearEditState(filePath: string): void
}

/**
 * 任务内容提供器接口
 * 负责读取和解析任务文件内容
 */
export interface ITaskContentProvider {
	/**
	 * 获取文件内容
	 * @param filePath 文件路径
	 * @returns 文件内容
	 */
	getFileContent(filePath: string): Promise<string>

	/**
	 * 解析指定行的任务信息
	 * @param content 文件内容
	 * @param line 行号
	 * @returns 任务信息或null
	 */
	parseTaskAtLine(content: string, line: number): TaskInfo | null

	/**
	 * 提取所有任务
	 * @param content 文件内容
	 * @returns 任务信息数组
	 */
	extractAllTasks(content: string): TaskInfo[]
}

/**
 * 任务发送器接口
 * 支持多种发送方式的统一接口
 */
export interface ITaskSender {
	/**
	 * 发送任务数据
	 * @param data 任务运行数据
	 * @returns 发送结果
	 */
	send(data: TaskRunData): Promise<SendResult>

	/**
	 * 配置发送器
	 * @param config 发送器配置
	 */
	configure(config: TaskSenderConfig): void

	/**
	 * 测试连接
	 * @returns 连接是否成功
	 */
	testConnection(): Promise<boolean>
}
