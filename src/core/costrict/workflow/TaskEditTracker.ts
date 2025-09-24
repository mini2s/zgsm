import { FileContextTracker } from "../../context-tracking/FileContextTracker"
import { ClineProvider } from "../../webview/ClineProvider"
import { RecordSource } from "../../context-tracking/FileContextTrackerTypes"
import { ITaskEditTracker, EditTrackingState, GitChangedLine } from "./types"
import { GitDiffTracker, GitDiffResult } from "./GitDiffTracker"

/**
 * 任务编辑跟踪器
 * 扩展现有的 FileContextTracker 功能，专门追踪 .cospec/tasks.md 文件的用户编辑
 * 维护编辑状态和内容缓存，集成 git diff 功能精确检测变更
 */
export class TaskEditTracker implements ITaskEditTracker {
	private fileContextTracker: FileContextTracker
	private editStates = new Map<string, EditTrackingState>()
	private gitDiffTracker: GitDiffTracker
	private readonly TASKS_FILE_PATTERN = /\.cospec[\/\\]tasks\.md$/

	constructor(provider: ClineProvider, taskId: string) {
		this.fileContextTracker = new FileContextTracker(provider, taskId)
		this.gitDiffTracker = new GitDiffTracker()
	}

	/**
	 * 处理文件编辑事件
	 * 如果是 tasks.md 文件的用户编辑，则记录编辑状态
	 */
	onFileEdited(filePath: string, source: RecordSource): void {
		// 首先调用原有的文件上下文跟踪
		this.fileContextTracker.trackFileContext(filePath, source)

		// 如果是 tasks.md 文件且是用户编辑，则记录编辑状态
		if (this.isTasksFile(filePath) && source === "user_edited") {
			const existingState = this.editStates.get(filePath)
			const state: EditTrackingState = {
				filePath,
				lastEditTime: Date.now(),
				hasUserEdits: true,
				editCount: (existingState?.editCount || 0) + 1,
			}
			this.editStates.set(filePath, state)

			console.log(`TaskEditTracker: Recorded edit for ${filePath}, count: ${state.editCount}`)
		}
	}

	/**
	 * 检查文件是否有最近的编辑
	 */
	hasRecentEdits(filePath: string): boolean {
		if (!this.isTasksFile(filePath)) {
			return false
		}

		const state = this.editStates.get(filePath)
		return state?.hasUserEdits || false
	}

	/**
	 * 获取文件的编辑状态
	 */
	getEditState(filePath: string): EditTrackingState | null {
		if (!this.isTasksFile(filePath)) {
			return null
		}

		return this.editStates.get(filePath) || null
	}

	/**
	 * 获取文件的 git diff 信息
	 * @param filePath 文件路径
	 * @returns Git diff 结果
	 */
	async getGitDiff(filePath: string): Promise<GitDiffResult | null> {
		if (!this.isTasksFile(filePath)) {
			return null
		}

		try {
			return await this.gitDiffTracker.getFileDiff(filePath)
		} catch (error) {
			console.error(`TaskEditTracker: 获取 git diff 失败 (${filePath}):`, error)
			return null
		}
	}

	/**
	 * 检查文件是否有 git 变更
	 * @param filePath 文件路径
	 * @returns 是否有 git 变更
	 */
	async hasGitChanges(filePath: string): Promise<boolean> {
		const diffResult = await this.getGitDiff(filePath)
		return diffResult?.hasGitChanges || false
	}

	/**
	 * 获取文件的变更统计信息
	 * @param filePath 文件路径
	 * @returns 变更统计信息
	 */
	async getChangeStats(filePath: string): Promise<{
		addedLines: number
		removedLines: number
		modifiedLines: number
		totalChanges: number
	} | null> {
		if (!this.isTasksFile(filePath)) {
			return null
		}

		try {
			return await this.gitDiffTracker.getChangeStats(filePath)
		} catch (error) {
			console.error(`TaskEditTracker: 获取变更统计失败 (${filePath}):`, error)
			return null
		}
	}

	/**
	 * 获取增强的编辑状态（包含 git diff 信息）
	 * @param filePath 文件路径
	 * @returns 增强的编辑状态
	 */
	async getEnhancedEditState(filePath: string): Promise<{
		editState: EditTrackingState | null
		gitDiff: GitDiffResult | null
		hasAnyChanges: boolean
	}> {
		const editState = this.getEditState(filePath)
		const gitDiff = await this.getGitDiff(filePath)

		const hasAnyChanges = editState?.hasUserEdits || false || gitDiff?.hasGitChanges || false

		return {
			editState,
			gitDiff,
			hasAnyChanges,
		}
	}

	/**
	 * 清除文件的编辑状态
	 * 通常在成功发送任务数据后调用
	 */
	clearEditState(filePath: string): void {
		if (this.isTasksFile(filePath)) {
			this.editStates.delete(filePath)
			console.log(`TaskEditTracker: Cleared edit state for ${filePath}`)
		}
	}

	/**
	 * 获取所有有编辑状态的文件
	 */
	getAllEditStates(): Map<string, EditTrackingState> {
		return new Map(this.editStates)
	}

	/**
	 * 清除所有编辑状态
	 */
	clearAllEditStates(): void {
		this.editStates.clear()
		console.log("TaskEditTracker: Cleared all edit states")
	}

	/**
	 * 获取最近修改的文件列表（来自底层 FileContextTracker）
	 */
	getAndClearRecentlyModifiedFiles(): string[] {
		return this.fileContextTracker.getAndClearRecentlyModifiedFiles()
	}

	/**
	 * 标记文件为 Roo 编辑（来自底层 FileContextTracker）
	 */
	markFileAsEditedByRoo(filePath: string): void {
		this.fileContextTracker.markFileAsEditedByRoo(filePath)
	}

	/**
	 * 设置文件监听器
	 */
	async setupFileWatcher(filePath: string): Promise<void> {
		await this.fileContextTracker.setupFileWatcher(filePath)
	}

	/**
	 * 检查是否为 tasks.md 文件
	 */
	private isTasksFile(filePath: string): boolean {
		return this.TASKS_FILE_PATTERN.test(filePath.replace(/\\/g, "/"))
	}

	/**
	 * 获取编辑统计信息
	 */
	getEditStatistics(): {
		totalFiles: number
		totalEdits: number
		filesWithEdits: string[]
		lastEditTime?: number
	} {
		const filesWithEdits = Array.from(this.editStates.keys())
		const totalEdits = Array.from(this.editStates.values()).reduce((sum, state) => sum + state.editCount, 0)

		const lastEditTimes = Array.from(this.editStates.values()).map((state) => state.lastEditTime)
		const lastEditTime = lastEditTimes.length > 0 ? Math.max(...lastEditTimes) : undefined

		return {
			totalFiles: this.editStates.size,
			totalEdits,
			filesWithEdits,
			lastEditTime,
		}
	}

	/**
	 * 设置 git 工作区根目录
	 * @param workspaceRoot 工作区根目录路径
	 */
	setGitWorkspaceRoot(workspaceRoot: string): void {
		this.gitDiffTracker.setWorkspaceRoot(workspaceRoot)
	}

	/**
	 * 获取 git 工作区根目录
	 * @returns 工作区根目录路径
	 */
	getGitWorkspaceRoot(): string {
		return this.gitDiffTracker.getWorkspaceRoot()
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.editStates.clear()
		this.fileContextTracker.dispose()
	}
}
