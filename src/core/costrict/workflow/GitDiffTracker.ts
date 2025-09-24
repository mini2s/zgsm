import * as vscode from "vscode"
import { execSync } from "child_process"
import * as path from "path"

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
 * Git Diff 结果
 */
export interface GitDiffResult {
	/** 是否有 git 变更 */
	hasGitChanges: boolean
	/** git diff 原始输出 */
	diffContent: string
	/** 解析后的变更行信息 */
	changedLines: GitChangedLine[]
	/** 文件状态 */
	fileStatus: "modified" | "added" | "deleted" | "renamed" | "untracked" | "unchanged"
	/** 错误信息（如果有） */
	error?: string
}

/**
 * Git Diff 跟踪器
 * 用于获取文件的 git diff 信息，精确检测用户编辑的具体内容
 */
export class GitDiffTracker {
	private workspaceRoot: string

	constructor(workspaceRoot?: string) {
		this.workspaceRoot = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()
	}

	/**
	 * 获取文件的 git diff 信息
	 * @param filePath 文件路径（相对于工作区根目录）
	 * @returns Git diff 结果
	 */
	async getFileDiff(filePath: string): Promise<GitDiffResult> {
		try {
			// 确保文件路径是相对于工作区根目录的
			const relativePath = this.getRelativePath(filePath)

			// 检查文件是否在 git 仓库中
			if (!(await this.isGitRepository())) {
				return {
					hasGitChanges: false,
					diffContent: "",
					changedLines: [],
					fileStatus: "untracked",
					error: "Not a git repository",
				}
			}

			// 检查文件状态
			const fileStatus = await this.getFileStatus(relativePath)

			// 如果文件未跟踪或未修改，返回空结果
			if (fileStatus === "untracked" || fileStatus === "unchanged") {
				return {
					hasGitChanges: false,
					diffContent: "",
					changedLines: [],
					fileStatus,
				}
			}

			// 获取 git diff 输出
			const diffContent = await this.getRawDiff(relativePath)

			if (!diffContent.trim()) {
				return {
					hasGitChanges: false,
					diffContent: "",
					changedLines: [],
					fileStatus,
				}
			}

			// 解析 diff 内容
			const changedLines = this.parseDiffContent(diffContent)

			return {
				hasGitChanges: true,
				diffContent,
				changedLines,
				fileStatus,
			}
		} catch (error) {
			console.error("GitDiffTracker: 获取文件 diff 失败:", error)
			return {
				hasGitChanges: false,
				diffContent: "",
				changedLines: [],
				fileStatus: "unchanged",
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}

	/**
	 * 检查是否为 git 仓库
	 */
	private async isGitRepository(): Promise<boolean> {
		try {
			execSync("git rev-parse --git-dir", {
				cwd: this.workspaceRoot,
				stdio: "pipe",
			})
			return true
		} catch {
			return false
		}
	}

	/**
	 * 获取文件状态
	 */
	private async getFileStatus(relativePath: string): Promise<GitDiffResult["fileStatus"]> {
		try {
			const output = execSync(`git status --porcelain "${relativePath}"`, {
				cwd: this.workspaceRoot,
				encoding: "utf8",
				stdio: "pipe",
			}).trim()

			if (!output) {
				return "unchanged"
			}

			const statusCode = output.substring(0, 2)

			// 解析 git status 状态码
			if (statusCode.includes("M")) {
				return "modified"
			} else if (statusCode.includes("A")) {
				return "added"
			} else if (statusCode.includes("D")) {
				return "deleted"
			} else if (statusCode.includes("R")) {
				return "renamed"
			} else if (statusCode.includes("??")) {
				return "untracked"
			}

			return "modified" // 默认为修改状态
		} catch {
			return "unchanged"
		}
	}

	/**
	 * 获取原始 git diff 输出
	 */
	private async getRawDiff(relativePath: string): Promise<string> {
		try {
			// 使用 --no-index 选项来比较工作区文件与 HEAD
			const output = execSync(`git diff HEAD "${relativePath}"`, {
				cwd: this.workspaceRoot,
				encoding: "utf8",
				stdio: "pipe",
			})
			return output
		} catch (error) {
			// 如果文件是新文件，尝试获取完整内容作为新增
			try {
				const output = execSync(`git diff --no-index /dev/null "${relativePath}"`, {
					cwd: this.workspaceRoot,
					encoding: "utf8",
					stdio: "pipe",
				})
				return output
			} catch {
				return ""
			}
		}
	}

	/**
	 * 解析 git diff 内容
	 */
	private parseDiffContent(diffContent: string): GitChangedLine[] {
		const lines = diffContent.split("\n")
		const changedLines: GitChangedLine[] = []
		let currentLine = 0
		let originalLine = 0

		for (const line of lines) {
			// 解析 hunk 头部信息 (@@)
			const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
			if (hunkMatch) {
				originalLine = parseInt(hunkMatch[1], 10)
				currentLine = parseInt(hunkMatch[2], 10)
				continue
			}

			// 跳过文件头部信息
			if (
				line.startsWith("diff --git") ||
				line.startsWith("index ") ||
				line.startsWith("---") ||
				line.startsWith("+++")
			) {
				continue
			}

			// 解析变更行
			if (line.startsWith("+") && !line.startsWith("+++")) {
				// 新增行
				changedLines.push({
					type: "added",
					line: currentLine,
					content: line.substring(1), // 移除 '+' 前缀
				})
				currentLine++
			} else if (line.startsWith("-") && !line.startsWith("---")) {
				// 删除行
				changedLines.push({
					type: "removed",
					line: originalLine,
					content: line.substring(1), // 移除 '-' 前缀
					originalLine: originalLine,
				})
				originalLine++
			} else if (line.startsWith(" ")) {
				// 未变更行，更新行号
				currentLine++
				originalLine++
			}
		}

		// 检测修改行（删除后紧跟新增的情况）
		this.detectModifiedLines(changedLines)

		return changedLines
	}

	/**
	 * 检测修改的行（将连续的删除+新增转换为修改）
	 */
	private detectModifiedLines(changedLines: GitChangedLine[]): void {
		for (let i = 0; i < changedLines.length - 1; i++) {
			const current = changedLines[i]
			const next = changedLines[i + 1]

			// 如果当前是删除，下一个是新增，且行号连续，则认为是修改
			if (
				current.type === "removed" &&
				next.type === "added" &&
				next.line === (current.originalLine || current.line)
			) {
				// 将新增行标记为修改
				next.type = "modified"
				next.originalLine = current.line

				// 移除删除行
				changedLines.splice(i, 1)
				i-- // 调整索引
			}
		}
	}

	/**
	 * 获取相对路径
	 */
	private getRelativePath(filePath: string): string {
		if (path.isAbsolute(filePath)) {
			return path.relative(this.workspaceRoot, filePath)
		}
		return filePath
	}

	/**
	 * 获取工作区根目录
	 */
	getWorkspaceRoot(): string {
		return this.workspaceRoot
	}

	/**
	 * 设置工作区根目录
	 */
	setWorkspaceRoot(workspaceRoot: string): void {
		this.workspaceRoot = workspaceRoot
	}

	/**
	 * 检查文件是否有未提交的变更
	 */
	async hasUncommittedChanges(filePath: string): Promise<boolean> {
		const result = await this.getFileDiff(filePath)
		return result.hasGitChanges
	}

	/**
	 * 获取变更统计信息
	 */
	async getChangeStats(filePath: string): Promise<{
		addedLines: number
		removedLines: number
		modifiedLines: number
		totalChanges: number
	}> {
		const result = await this.getFileDiff(filePath)

		const stats = {
			addedLines: 0,
			removedLines: 0,
			modifiedLines: 0,
			totalChanges: 0,
		}

		for (const line of result.changedLines) {
			switch (line.type) {
				case "added":
					stats.addedLines++
					break
				case "removed":
					stats.removedLines++
					break
				case "modified":
					stats.modifiedLines++
					break
			}
		}

		stats.totalChanges = stats.addedLines + stats.removedLines + stats.modifiedLines
		return stats
	}
}
