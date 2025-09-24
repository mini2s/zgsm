import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { ITaskContentProvider, TaskInfo } from "./types"

/**
 * 任务内容提供器
 * 负责读取和解析 tasks.md 文件内容
 * 提供内容获取和格式化功能
 */
export class TaskContentProvider implements ITaskContentProvider {
	private contentCache = new Map<string, { content: string; timestamp: number }>()
	private readonly CACHE_TTL = 5000 // 5秒缓存过期时间

	/**
	 * 获取文件内容
	 * 支持缓存以提高性能
	 */
	async getFileContent(filePath: string): Promise<string> {
		try {
			// 检查缓存
			const cached = this.contentCache.get(filePath)
			if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
				return cached.content
			}

			// 读取文件内容
			const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
			const content = await fs.readFile(absolutePath, "utf-8")

			// 更新缓存
			this.contentCache.set(filePath, {
				content,
				timestamp: Date.now(),
			})

			return content
		} catch (error) {
			console.error(`TaskContentProvider: Failed to read file ${filePath}:`, error)
			throw new Error(`无法读取文件 ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * 解析指定行的任务信息
	 * 支持 Markdown 任务列表格式：- [ ], - [x], - [-]
	 */
	parseTaskAtLine(content: string, line: number): TaskInfo | null {
		const lines = content.split("\n")

		// 检查行号是否有效
		if (line < 0 || line >= lines.length) {
			return null
		}

		const lineContent = lines[line]
		const taskMatch = this.parseTaskLine(lineContent)

		if (!taskMatch) {
			return null
		}

		return {
			line,
			content: taskMatch.content,
			status: taskMatch.status,
			taskId: taskMatch.taskId,
		}
	}

	/**
	 * 提取所有任务
	 * 遍历文件内容，找出所有任务行
	 */
	extractAllTasks(content: string): TaskInfo[] {
		const lines = content.split("\n")
		const tasks: TaskInfo[] = []

		lines.forEach((lineContent, index) => {
			const taskMatch = this.parseTaskLine(lineContent)
			if (taskMatch) {
				tasks.push({
					line: index,
					content: taskMatch.content,
					status: taskMatch.status,
					taskId: taskMatch.taskId,
				})
			}
		})

		return tasks
	}

	/**
	 * 解析单行任务内容
	 * 支持的格式：
	 * - [ ] 未开始的任务
	 * - [-] 进行中的任务
	 * - [x] 已完成的任务
	 */
	private parseTaskLine(
		line: string,
	): { content: string; status: "pending" | "in-progress" | "completed"; taskId?: string } | null {
		// 匹配任务行的正则表达式
		const taskRegex = /^\s*[-*]\s*\[([x\s-])\]\s*(.+)$/i
		const match = line.match(taskRegex)

		if (!match) {
			return null
		}

		const statusChar = match[1].toLowerCase()
		const taskContent = match[2].trim()

		// 确定任务状态
		let status: "pending" | "in-progress" | "completed"
		switch (statusChar) {
			case "x":
				status = "completed"
				break
			case "-":
				status = "in-progress"
				break
			case " ":
			default:
				status = "pending"
				break
		}

		// 尝试提取任务ID（如果存在）
		const taskIdMatch = taskContent.match(/^(\d+(?:\.\d+)*)\s+(.+)$/)
		let taskId: string | undefined
		let content: string

		if (taskIdMatch) {
			taskId = taskIdMatch[1]
			content = taskIdMatch[2].trim()
		} else {
			content = taskContent
		}

		return {
			content,
			status,
			taskId,
		}
	}

	/**
	 * 获取任务的上下文内容
	 * 包括任务本身及其子内容（缩进的内容）
	 */
	getTaskWithContext(content: string, taskLine: number): string {
		const lines = content.split("\n")

		if (taskLine < 0 || taskLine >= lines.length) {
			return ""
		}

		const result: string[] = []
		const taskLineContent = lines[taskLine]
		const taskIndent = this.getIndentLevel(taskLineContent)

		// 添加任务行本身
		result.push(taskLineContent)

		// 查找任务的子内容（缩进更深的行）
		for (let i = taskLine + 1; i < lines.length; i++) {
			const line = lines[i]
			const lineText = line.trim()

			// 跳过空行
			if (lineText === "") {
				continue
			}

			const lineIndent = this.getIndentLevel(line)

			// 如果遇到同级或更高级的内容，停止
			if (
				lineIndent <= taskIndent &&
				(lineText.startsWith("- [") || lineText.startsWith("* [") || lineText.startsWith("#"))
			) {
				break
			}

			// 如果是更深层次的缩进，添加到结果中
			if (lineIndent > taskIndent) {
				result.push(line)
			} else {
				// 同级别的非任务内容也停止
				break
			}
		}

		return result.join("\n")
	}

	/**
	 * 计算行的缩进级别
	 */
	private getIndentLevel(line: string): number {
		let indent = 0
		for (const char of line) {
			if (char === " ") {
				indent++
			} else if (char === "\t") {
				indent += 4 // 制表符按4个空格计算
			} else {
				break
			}
		}
		return indent
	}

	/**
	 * 清除内容缓存
	 */
	clearCache(): void {
		this.contentCache.clear()
	}

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats(): { size: number; files: string[] } {
		return {
			size: this.contentCache.size,
			files: Array.from(this.contentCache.keys()),
		}
	}

	/**
	 * 验证文件是否为有效的 tasks.md 文件
	 */
	async validateTasksFile(filePath: string): Promise<boolean> {
		try {
			const content = await this.getFileContent(filePath)

			// 检查是否包含任务格式
			const hasTaskFormat = /^\s*[-*]\s*\[[x\s-]\]/m.test(content)

			// 检查文件名是否为 tasks.md
			const isTasksFile = path.basename(filePath).toLowerCase() === "tasks.md"

			return hasTaskFormat && isTasksFile
		} catch (error) {
			console.error(`TaskContentProvider: Failed to validate tasks file ${filePath}:`, error)
			return false
		}
	}

	/**
	 * 获取任务统计信息
	 */
	async getTaskStatistics(filePath: string): Promise<{
		total: number
		pending: number
		inProgress: number
		completed: number
	}> {
		try {
			const content = await this.getFileContent(filePath)
			const tasks = this.extractAllTasks(content)

			const stats = {
				total: tasks.length,
				pending: 0,
				inProgress: 0,
				completed: 0,
			}

			tasks.forEach((task) => {
				switch (task.status) {
					case "pending":
						stats.pending++
						break
					case "in-progress":
						stats.inProgress++
						break
					case "completed":
						stats.completed++
						break
				}
			})

			return stats
		} catch (error) {
			console.error(`TaskContentProvider: Failed to get task statistics for ${filePath}:`, error)
			return { total: 0, pending: 0, inProgress: 0, completed: 0 }
		}
	}
}
