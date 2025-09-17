/**
 * Coworkflow 解析错误处理服务
 * 提供解析错误的专门处理和恢复机制
 */

import * as vscode from "vscode"
import {
	CoworkflowError,
	ParsingError,
	ErrorLevel,
	ErrorCategory,
	RecoveryStrategy,
	ErrorHandler,
	ErrorRecoverer,
	ErrorContext,
} from "../types/errors"
import { CoworkflowErrorHandlerService } from "./error-handler"

/**
 * 解析错误处理配置接口
 */
export interface ParsingErrorHandlerConfig {
	/** 是否启用自动修复 */
	enableAutoFix?: boolean
	/** 是否启用回退解析 */
	enableFallbackParsing?: boolean
	/** 是否启用部分解析 */
	enablePartialParsing?: boolean
	/** 最大重试次数 */
	maxRetries?: number
	/** 重试间隔（毫秒） */
	retryInterval?: number
	/** 是否记录解析错误详情 */
	logErrorDetails?: boolean
}

/**
 * 默认解析错误处理配置
 */
const DEFAULT_PARSING_CONFIG: Required<ParsingErrorHandlerConfig> = {
	enableAutoFix: true,
	enableFallbackParsing: true,
	enablePartialParsing: true,
	maxRetries: 3,
	retryInterval: 500,
	logErrorDetails: true,
}

/**
 * 解析修复规则接口
 */
export interface ParseFixRule {
	/** 错误模式 */
	errorPattern: RegExp
	/** 修复函数 */
	fix: (content: string, match: RegExpMatchArray) => string
	/** 修复描述 */
	description: string
}

/**
 * 解析结果接口
 */
export interface ParseResult<T = any> {
	/** 解析是否成功 */
	success: boolean
	/** 解析结果数据 */
	data?: T
	/** 解析错误 */
	error?: ParsingError
	/** 是否使用了回退机制 */
	usedFallback?: boolean
	/** 是否部分解析 */
	isPartial?: boolean
	/** 修复的次数 */
	fixCount?: number
}

/**
 * 解析错误处理器类
 */
export class CoworkflowParsingErrorHandler implements ErrorHandler, ErrorRecoverer {
	private config: Required<ParsingErrorHandlerConfig>
	private errorHandler: CoworkflowErrorHandlerService
	private retryCounters: Map<string, number> = new Map()
	private fixRules: ParseFixRule[] = []

	constructor(errorHandler: CoworkflowErrorHandlerService, config: ParsingErrorHandlerConfig = {}) {
		this.config = { ...DEFAULT_PARSING_CONFIG, ...config }
		this.errorHandler = errorHandler

		// 注册自身到错误处理服务
		this.errorHandler.registerErrorHandler(ErrorCategory.PARSING, this)
		this.errorHandler.registerErrorRecoverer(ErrorCategory.PARSING, this)

		// 初始化修复规则
		this.initializeFixRules()
	}

	/**
	 * 初始化修复规则
	 */
	private initializeFixRules(): void {
		// Markdown 标题格式修复
		this.fixRules.push({
			errorPattern: /^(#+\s*)([^\n\r]+)$/gm,
			fix: (content, match) => {
				const [, prefix, text] = match
				// 清理标题前后的多余空格
				return `${prefix}${text.trim()}`
			},
			description: "修复标题格式",
		})

		// 任务列表格式修复
		this.fixRules.push({
			errorPattern: /^(-\s*\[)([ \-x])(\]\s*.+)$/gm,
			fix: (content, match) => {
				const [, prefix, status, suffix] = match
				// 标准化任务状态字符
				const normalizedStatus = status.toLowerCase()
				if (normalizedStatus === " " || normalizedStatus === "-" || normalizedStatus === "x") {
					return `${prefix}${normalizedStatus}${suffix}`
				}
				return `${prefix} ${suffix}` // 默认为未完成状态
			},
			description: "修复任务列表格式",
		})

		// 链接格式修复
		this.fixRules.push({
			errorPattern: /\[([^\]]+)\]\(([^)]+)\)/g,
			fix: (content, match) => {
				const [, text, url] = match
				// 清理链接文本和 URL
				const cleanText = text.trim()
				const cleanUrl = url.trim()
				return `[${cleanText}](${cleanUrl})`
			},
			description: "修复链接格式",
		})

		// 代码块格式修复
		this.fixRules.push({
			errorPattern: /```(\w+)?\s*\n([\s\S]*?)\n```/g,
			fix: (content, match) => {
				const [, language, code] = match
				// 清理代码块内容
				const cleanCode = code.trim()
				if (language) {
					return `\`\`\`${language.trim()}\n${cleanCode}\n\`\`\``
				}
				return `\`\`\`\n${cleanCode}\n\`\`\``
			},
			description: "修复代码块格式",
		})
	}

	/**
	 * 处理解析错误
	 */
	async handleError(error: CoworkflowError): Promise<void> {
		if (!(error instanceof ParsingError)) {
			return
		}

		const context = error.context
		const { uri, line, operation } = context

		if (!operation) {
			return
		}

		// 记录详细的错误信息
		if (this.config.logErrorDetails) {
			console.error(`解析错误 [${operation}]: ${error.message}`, {
				uri: uri?.fsPath,
				line,
				lineContent: error.lineContent,
				recoverable: error.recoverable,
				recoveryStrategy: error.recoveryStrategy,
			})
		}

		// 提供修复建议
		const suggestion = this.getFixSuggestion(error)
		if (suggestion) {
			console.log(`解析错误修复建议: ${suggestion}`)
		}
	}

	/**
	 * 检查是否可以处理指定错误
	 */
	canHandle(error: CoworkflowError): boolean {
		return error instanceof ParsingError
	}

	/**
	 * 尝试恢复解析错误
	 */
	async recover(error: CoworkflowError): Promise<boolean> {
		if (!(error instanceof ParsingError)) {
			return false
		}

		const context = error.context
		const { uri, operation } = context

		if (!uri || !operation) {
			return false
		}

		const operationKey = `${operation}:${uri.fsPath}`
		const retryCount = this.retryCounters.get(operationKey) || 0

		if (retryCount >= this.config.maxRetries) {
			this.retryCounters.delete(operationKey)
			return false
		}

		this.retryCounters.set(operationKey, retryCount + 1)

		// 等待重试间隔
		await new Promise((resolve) => setTimeout(resolve, this.config.retryInterval))

		try {
			switch (operation) {
				case "parse-markdown":
					return await this.recoverMarkdownParseError(uri, error)
				case "parse-tasks":
					return await this.recoverTasksParseError(uri, error)
				case "parse-structure":
					return await this.recoverStructureParseError(uri, error)
				default:
					return false
			}
		} catch (recoveryError) {
			console.error("恢复解析操作失败:", recoveryError)
			return false
		}
	}

	/**
	 * 检查是否可以恢复指定错误
	 */
	canRecover(error: CoworkflowError): boolean {
		if (!(error instanceof ParsingError)) {
			return false
		}

		const context = error.context
		const { operation } = context

		if (!operation) {
			return false
		}

		const operationKey = `${operation}:${error.context.uri?.fsPath || ""}`
		const retryCount = this.retryCounters.get(operationKey) || 0

		return retryCount < this.config.maxRetries && error.recoverable
	}

	/**
	 * 恢复 Markdown 解析错误
	 */
	private async recoverMarkdownParseError(uri: vscode.Uri, error: ParsingError): Promise<boolean> {
		try {
			// 读取文件内容
			const content = await this.safeReadFile(uri)

			// 尝试自动修复
			if (this.config.enableAutoFix) {
				const fixedContent = this.tryAutoFix(content)
				if (fixedContent !== content) {
					await this.safeWriteFile(uri, fixedContent)
					console.log(`自动修复 Markdown 文件: ${uri.fsPath}`)
					return true
				}
			}

			// 尝试回退解析
			if (this.config.enableFallbackParsing) {
				const parseResult = this.tryFallbackMarkdownParse(content)
				if (parseResult.success) {
					console.log(`使用回退解析成功解析 Markdown 文件: ${uri.fsPath}`)
					return true
				}
			}

			return false
		} catch (recoveryError) {
			console.error("恢复 Markdown 解析错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复任务解析错误
	 */
	private async recoverTasksParseError(uri: vscode.Uri, error: ParsingError): Promise<boolean> {
		try {
			// 读取文件内容
			const content = await this.safeReadFile(uri)

			// 尝试自动修复
			if (this.config.enableAutoFix) {
				const fixedContent = this.tryAutoFix(content)
				if (fixedContent !== content) {
					await this.safeWriteFile(uri, fixedContent)
					console.log(`自动修复任务文件: ${uri.fsPath}`)
					return true
				}
			}

			// 尝试部分解析
			if (this.config.enablePartialParsing) {
				const parseResult = this.tryPartialTasksParse(content)
				if (parseResult.success) {
					console.log(`使用部分解析成功解析任务文件: ${uri.fsPath}`)
					return true
				}
			}

			return false
		} catch (recoveryError) {
			console.error("恢复任务解析错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复结构解析错误
	 */
	private async recoverStructureParseError(uri: vscode.Uri, error: ParsingError): Promise<boolean> {
		try {
			// 读取文件内容
			const content = await this.safeReadFile(uri)

			// 尝试自动修复
			if (this.config.enableAutoFix) {
				const fixedContent = this.tryAutoFix(content)
				if (fixedContent !== content) {
					await this.safeWriteFile(uri, fixedContent)
					console.log(`自动修复结构文件: ${uri.fsPath}`)
					return true
				}
			}

			// 尝试回退解析
			if (this.config.enableFallbackParsing) {
				const parseResult = this.tryFallbackStructureParse(content)
				if (parseResult.success) {
					console.log(`使用回退解析成功解析结构文件: ${uri.fsPath}`)
					return true
				}
			}

			return false
		} catch (recoveryError) {
			console.error("恢复结构解析错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 安全地执行解析操作
	 */
	async safeParse<T>(
		operation: string,
		uri: vscode.Uri,
		parseFn: (content: string) => T,
		fallbackParseFn?: (content: string) => T,
	): Promise<ParseResult<T>> {
		try {
			const content = await this.safeReadFile(uri)
			let fixCount = 0
			let currentContent = content
			let result: T

			// 尝试解析
			try {
				result = parseFn(currentContent)
				return {
					success: true,
					data: result,
					fixCount,
				}
			} catch (parseError) {
				// 尝试自动修复
				if (this.config.enableAutoFix) {
					const fixedContent = this.tryAutoFix(currentContent)
					if (fixedContent !== currentContent) {
						fixCount++
						currentContent = fixedContent

						try {
							result = parseFn(currentContent)
							// 保存修复后的内容
							await this.safeWriteFile(uri, currentContent)
							return {
								success: true,
								data: result,
								fixCount,
							}
						} catch (fixedParseError) {
							// 修复后仍然失败，继续尝试其他恢复方法
						}
					}
				}

				// 尝试回退解析
				if (fallbackParseFn && this.config.enableFallbackParsing) {
					try {
						result = fallbackParseFn(currentContent)
						return {
							success: true,
							data: result,
							usedFallback: true,
							fixCount,
						}
					} catch (fallbackError) {
						// 回退解析也失败
					}
				}

				// 所有恢复方法都失败，创建错误
				const parsingError = new ParsingError(
					parseError instanceof Error ? parseError.message : String(parseError),
					{ uri, operation },
					currentContent.split("\n")[Math.max(0, (parseError as any).lineNumber || 0)],
					RecoveryStrategy.FALLBACK,
					parseError instanceof Error ? parseError : undefined,
				)

				return {
					success: false,
					error: parsingError,
					fixCount,
				}
			}
		} catch (error) {
			const parsingError = new ParsingError(
				error instanceof Error ? error.message : String(error),
				{ uri, operation },
				undefined,
				RecoveryStrategy.NONE,
				error instanceof Error ? error : undefined,
			)

			return {
				success: false,
				error: parsingError,
			}
		}
	}

	/**
	 * 尝试自动修复
	 */
	private tryAutoFix(content: string): string {
		let fixedContent = content
		let appliedFixes = 0

		for (const rule of this.fixRules) {
			const matches = fixedContent.match(rule.errorPattern)
			if (matches) {
				fixedContent = fixedContent.replace(rule.errorPattern, rule.fix)
				appliedFixes++
				console.log(`应用修复规则: ${rule.description} (${matches.length} 处)`)
			}
		}

		return fixedContent
	}

	/**
	 * 尝试回退 Markdown 解析
	 */
	private tryFallbackMarkdownParse(content: string): ParseResult<any> {
		try {
			// 简化的 Markdown 解析，只提取基本结构
			const lines = content.split("\n")
			const structure = {
				headings: [] as Array<{ level: number; text: string; line: number }>,
				paragraphs: [] as Array<{ text: string; line: number }>,
				lists: [] as Array<{ items: string[]; line: number }>,
			}

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim()

				// 标题
				const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
				if (headingMatch) {
					structure.headings.push({
						level: headingMatch[1].length,
						text: headingMatch[2],
						line: i,
					})
					continue
				}

				// 列表项
				if (line.startsWith("- ") || line.startsWith("* ") || line.match(/^\d+\.\s/)) {
					const currentList = structure.lists[structure.lists.length - 1]
					if (currentList && currentList.line === i - 1) {
						currentList.items.push(line.replace(/^[-*]\s|^\d+\.\s/, ""))
					} else {
						structure.lists.push({
							items: [line.replace(/^[-*]\s|^\d+\.\s/, "")],
							line: i,
						})
					}
					continue
				}

				// 段落
				if (line.length > 0) {
					structure.paragraphs.push({
						text: line,
						line: i,
					})
				}
			}

			return {
				success: true,
				data: structure,
				usedFallback: true,
			}
		} catch (error) {
			return {
				success: false,
				error: new ParsingError(
					error instanceof Error ? error.message : String(error),
					{ operation: "fallback-markdown-parse" },
					undefined,
					RecoveryStrategy.NONE,
					error instanceof Error ? error : undefined,
				),
			}
		}
	}

	/**
	 * 尝试部分任务解析
	 */
	private tryPartialTasksParse(content: string): ParseResult<any> {
		try {
			const lines = content.split("\n")
			const validTasks = []
			const invalidLines = []

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]
				const taskMatch = line.match(/^-\s*\[([ \-x])\]\s+(.+)$/)

				if (taskMatch) {
					const [, status, text] = taskMatch
					validTasks.push({
						line: i,
						status: status === "x" ? "completed" : status === "-" ? "in-progress" : "pending",
						text: text.trim(),
					})
				} else if (line.trim().length > 0) {
					invalidLines.push({
						line: i,
						content: line,
					})
				}
			}

			return {
				success: true,
				data: {
					validTasks,
					invalidLines,
					totalTasks: validTasks.length,
					invalidLineCount: invalidLines.length,
				},
				isPartial: invalidLines.length > 0,
			}
		} catch (error) {
			return {
				success: false,
				error: new ParsingError(
					error instanceof Error ? error.message : String(error),
					{ operation: "partial-tasks-parse" },
					undefined,
					RecoveryStrategy.NONE,
					error instanceof Error ? error : undefined,
				),
			}
		}
	}

	/**
	 * 尝试回退结构解析
	 */
	private tryFallbackStructureParse(content: string): ParseResult<any> {
		try {
			const lines = content.split("\n")
			const structure = {
				sections: [] as Array<{ title: string; level: number; line: number }>,
				contentBlocks: [] as Array<{ type: string; content: string; line: number }>,
			}

			let currentSection = null

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim()

				// 检测标题
				const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
				if (headingMatch) {
					currentSection = {
						title: headingMatch[2],
						level: headingMatch[1].length,
						line: i,
					}
					structure.sections.push(currentSection)
					continue
				}

				// 内容块
				if (line.length > 0) {
					let type = "text"
					if (line.startsWith("```")) {
						type = "code"
					} else if (line.startsWith(">")) {
						type = "quote"
					} else if (line.match(/^[-*]\s/)) {
						type = "list"
					}

					structure.contentBlocks.push({
						type,
						content: line,
						line: i,
					})
				}
			}

			return {
				success: true,
				data: structure,
				usedFallback: true,
			}
		} catch (error) {
			return {
				success: false,
				error: new ParsingError(
					error instanceof Error ? error.message : String(error),
					{ operation: "fallback-structure-parse" },
					undefined,
					RecoveryStrategy.NONE,
					error instanceof Error ? error : undefined,
				),
			}
		}
	}

	/**
	 * 获取修复建议
	 */
	private getFixSuggestion(error: ParsingError): string | null {
		const { operation, line } = error.context

		if (!operation) {
			return null
		}

		switch (operation) {
			case "parse-markdown":
				return "检查 Markdown 语法是否正确，特别是标题、链接和代码块格式。"
			case "parse-tasks":
				return "检查任务列表格式，确保使用 [- [ ] 任务] 或 [- [x] 任务] 格式。"
			case "parse-structure":
				return "检查文档结构，确保标题层级正确，段落格式一致。"
			default:
				return "检查文件格式和语法是否正确。"
		}
	}

	/**
	 * 安全读取文件
	 */
	private async safeReadFile(uri: vscode.Uri): Promise<string> {
		try {
			const content = await vscode.workspace.fs.readFile(uri)
			return new TextDecoder().decode(content)
		} catch (error) {
			throw new ParsingError(
				`无法读取文件: ${error instanceof Error ? error.message : String(error)}`,
				{ uri, operation: "read-file" },
				undefined,
				RecoveryStrategy.NONE,
				error instanceof Error ? error : undefined,
			)
		}
	}

	/**
	 * 安全写入文件
	 */
	private async safeWriteFile(uri: vscode.Uri, content: string): Promise<void> {
		try {
			const encoder = new TextEncoder()
			const data = encoder.encode(content)
			await vscode.workspace.fs.writeFile(uri, data)
		} catch (error) {
			throw new ParsingError(
				`无法写入文件: ${error instanceof Error ? error.message : String(error)}`,
				{ uri, operation: "write-file" },
				undefined,
				RecoveryStrategy.NONE,
				error instanceof Error ? error : undefined,
			)
		}
	}

	/**
	 * 添加自定义修复规则
	 */
	addFixRule(rule: ParseFixRule): void {
		this.fixRules.push(rule)
	}

	/**
	 * 重置重试计数器
	 */
	resetRetryCounters(): void {
		this.retryCounters.clear()
	}

	/**
	 * 获取重试统计信息
	 */
	getRetryStats(): { [key: string]: number } {
		const stats: { [key: string]: number } = {}
		this.retryCounters.forEach((count, key) => {
			stats[key] = count
		})
		return stats
	}

	/**
	 * 获取修复规则
	 */
	getFixRules(): ParseFixRule[] {
		return [...this.fixRules]
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.retryCounters.clear()
		this.fixRules.length = 0
	}
}

/**
 * 创建解析错误处理器实例
 */
export const createParsingErrorHandler = (
	errorHandler: CoworkflowErrorHandlerService,
	config?: ParsingErrorHandlerConfig,
): CoworkflowParsingErrorHandler => {
	return new CoworkflowParsingErrorHandler(errorHandler, config)
}
