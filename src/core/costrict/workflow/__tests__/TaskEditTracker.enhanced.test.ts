import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { TaskEditTracker } from "../TaskEditTracker"
import { GitDiffTracker, GitDiffResult } from "../GitDiffTracker"
import { ClineProvider } from "../../../webview/ClineProvider"
import { RecordSource } from "../../../context-tracking/FileContextTrackerTypes"

// Mock dependencies
vi.mock("../GitDiffTracker")
vi.mock("../../../webview/ClineProvider")
vi.mock("../../../context-tracking/FileContextTracker")

describe("TaskEditTracker - Git Diff Integration", () => {
	let taskEditTracker: TaskEditTracker
	let mockClineProvider: ClineProvider
	let mockGitDiffTracker: GitDiffTracker
	const taskId = "test-task-id"
	const tasksFilePath = "/workspace/.cospec/tasks.md"

	beforeEach(() => {
		mockClineProvider = {} as ClineProvider
		taskEditTracker = new TaskEditTracker(mockClineProvider, taskId)

		// Get the mocked GitDiffTracker instance
		mockGitDiffTracker = (taskEditTracker as any).gitDiffTracker
		vi.clearAllMocks()
	})

	afterEach(() => {
		taskEditTracker.dispose()
		vi.resetAllMocks()
	})

	describe("getGitDiff", () => {
		it("应该返回 tasks.md 文件的 git diff 结果", async () => {
			const mockDiffResult: GitDiffResult = {
				hasGitChanges: true,
				diffContent: "@@ -1,1 +1,2 @@\n # Tasks\n+- [ ] New task",
				changedLines: [
					{
						type: "added",
						line: 2,
						content: "- [ ] New task",
					},
				],
				fileStatus: "modified",
			}

			vi.mocked(mockGitDiffTracker.getFileDiff).mockResolvedValue(mockDiffResult)

			const result = await taskEditTracker.getGitDiff(tasksFilePath)

			expect(result).toEqual(mockDiffResult)
			expect(mockGitDiffTracker.getFileDiff).toHaveBeenCalledWith(tasksFilePath)
		})

		it("应该返回 null 对于非 tasks.md 文件", async () => {
			const result = await taskEditTracker.getGitDiff("/workspace/other.md")

			expect(result).toBeNull()
			expect(mockGitDiffTracker.getFileDiff).not.toHaveBeenCalled()
		})

		it("应该处理 git diff 获取错误", async () => {
			vi.mocked(mockGitDiffTracker.getFileDiff).mockRejectedValue(new Error("Git error"))

			const result = await taskEditTracker.getGitDiff(tasksFilePath)

			expect(result).toBeNull()
		})
	})

	describe("hasGitChanges", () => {
		it("应该返回 true 当文件有 git 变更时", async () => {
			const mockDiffResult: GitDiffResult = {
				hasGitChanges: true,
				diffContent: "@@ -1,1 +1,2 @@\n # Tasks\n+- [ ] New task",
				changedLines: [],
				fileStatus: "modified",
			}

			vi.mocked(mockGitDiffTracker.getFileDiff).mockResolvedValue(mockDiffResult)

			const hasChanges = await taskEditTracker.hasGitChanges(tasksFilePath)

			expect(hasChanges).toBe(true)
		})

		it("应该返回 false 当文件无 git 变更时", async () => {
			const mockDiffResult: GitDiffResult = {
				hasGitChanges: false,
				diffContent: "",
				changedLines: [],
				fileStatus: "unchanged",
			}

			vi.mocked(mockGitDiffTracker.getFileDiff).mockResolvedValue(mockDiffResult)

			const hasChanges = await taskEditTracker.hasGitChanges(tasksFilePath)

			expect(hasChanges).toBe(false)
		})
	})

	describe("getChangeStats", () => {
		it("应该返回变更统计信息", async () => {
			const mockStats = {
				addedLines: 2,
				removedLines: 1,
				modifiedLines: 1,
				totalChanges: 4,
			}

			vi.mocked(mockGitDiffTracker.getChangeStats).mockResolvedValue(mockStats)

			const stats = await taskEditTracker.getChangeStats(tasksFilePath)

			expect(stats).toEqual(mockStats)
			expect(mockGitDiffTracker.getChangeStats).toHaveBeenCalledWith(tasksFilePath)
		})

		it("应该返回 null 对于非 tasks.md 文件", async () => {
			const stats = await taskEditTracker.getChangeStats("/workspace/other.md")

			expect(stats).toBeNull()
			expect(mockGitDiffTracker.getChangeStats).not.toHaveBeenCalled()
		})

		it("应该处理统计获取错误", async () => {
			vi.mocked(mockGitDiffTracker.getChangeStats).mockRejectedValue(new Error("Stats error"))

			const stats = await taskEditTracker.getChangeStats(tasksFilePath)

			expect(stats).toBeNull()
		})
	})

	describe("getEnhancedEditState", () => {
		it("应该返回包含编辑状态和 git diff 的增强状态", async () => {
			// 先触发一个编辑事件
			taskEditTracker.onFileEdited(tasksFilePath, "user_edited")

			const mockDiffResult: GitDiffResult = {
				hasGitChanges: true,
				diffContent: "@@ -1,1 +1,2 @@\n # Tasks\n+- [ ] New task",
				changedLines: [
					{
						type: "added",
						line: 2,
						content: "- [ ] New task",
					},
				],
				fileStatus: "modified",
			}

			vi.mocked(mockGitDiffTracker.getFileDiff).mockResolvedValue(mockDiffResult)

			const enhancedState = await taskEditTracker.getEnhancedEditState(tasksFilePath)

			expect(enhancedState.editState).toBeDefined()
			expect(enhancedState.editState?.hasUserEdits).toBe(true)
			expect(enhancedState.gitDiff).toEqual(mockDiffResult)
			expect(enhancedState.hasAnyChanges).toBe(true)
		})

		it("应该正确检测只有 git 变更的情况", async () => {
			const mockDiffResult: GitDiffResult = {
				hasGitChanges: true,
				diffContent: "@@ -1,1 +1,2 @@\n # Tasks\n+- [ ] New task",
				changedLines: [],
				fileStatus: "modified",
			}

			vi.mocked(mockGitDiffTracker.getFileDiff).mockResolvedValue(mockDiffResult)

			const enhancedState = await taskEditTracker.getEnhancedEditState(tasksFilePath)

			expect(enhancedState.editState).toBeNull()
			expect(enhancedState.gitDiff).toEqual(mockDiffResult)
			expect(enhancedState.hasAnyChanges).toBe(true)
		})

		it("应该正确检测只有用户编辑的情况", async () => {
			// 触发用户编辑
			taskEditTracker.onFileEdited(tasksFilePath, "user_edited")

			const mockDiffResult: GitDiffResult = {
				hasGitChanges: false,
				diffContent: "",
				changedLines: [],
				fileStatus: "unchanged",
			}

			vi.mocked(mockGitDiffTracker.getFileDiff).mockResolvedValue(mockDiffResult)

			const enhancedState = await taskEditTracker.getEnhancedEditState(tasksFilePath)

			expect(enhancedState.editState?.hasUserEdits).toBe(true)
			expect(enhancedState.gitDiff).toEqual(mockDiffResult)
			expect(enhancedState.hasAnyChanges).toBe(true)
		})

		it("应该正确检测无任何变更的情况", async () => {
			const mockDiffResult: GitDiffResult = {
				hasGitChanges: false,
				diffContent: "",
				changedLines: [],
				fileStatus: "unchanged",
			}

			vi.mocked(mockGitDiffTracker.getFileDiff).mockResolvedValue(mockDiffResult)

			const enhancedState = await taskEditTracker.getEnhancedEditState(tasksFilePath)

			expect(enhancedState.editState).toBeNull()
			expect(enhancedState.gitDiff).toEqual(mockDiffResult)
			expect(enhancedState.hasAnyChanges).toBe(false)
		})
	})

	describe("git workspace management", () => {
		it("应该设置 git 工作区根目录", () => {
			const newRoot = "/new/workspace"
			taskEditTracker.setGitWorkspaceRoot(newRoot)

			expect(mockGitDiffTracker.setWorkspaceRoot).toHaveBeenCalledWith(newRoot)
		})

		it("应该获取 git 工作区根目录", () => {
			const mockRoot = "/current/workspace"
			vi.mocked(mockGitDiffTracker.getWorkspaceRoot).mockReturnValue(mockRoot)

			const root = taskEditTracker.getGitWorkspaceRoot()

			expect(root).toBe(mockRoot)
			expect(mockGitDiffTracker.getWorkspaceRoot).toHaveBeenCalled()
		})
	})

	describe("integration with existing functionality", () => {
		it("应该保持原有的编辑跟踪功能", () => {
			taskEditTracker.onFileEdited(tasksFilePath, "user_edited")

			const editState = taskEditTracker.getEditState(tasksFilePath)
			expect(editState).toBeDefined()
			expect(editState?.hasUserEdits).toBe(true)
			expect(editState?.editCount).toBe(1)
		})

		it("应该正确处理多次编辑", () => {
			taskEditTracker.onFileEdited(tasksFilePath, "user_edited")
			taskEditTracker.onFileEdited(tasksFilePath, "user_edited")
			taskEditTracker.onFileEdited(tasksFilePath, "user_edited")

			const editState = taskEditTracker.getEditState(tasksFilePath)
			expect(editState?.editCount).toBe(3)
		})

		it("应该忽略非用户编辑", () => {
			taskEditTracker.onFileEdited(tasksFilePath, "roo_edited")

			const editState = taskEditTracker.getEditState(tasksFilePath)
			expect(editState).toBeNull()
		})

		it("应该正确清除编辑状态", () => {
			taskEditTracker.onFileEdited(tasksFilePath, "user_edited")
			taskEditTracker.clearEditState(tasksFilePath)

			const editState = taskEditTracker.getEditState(tasksFilePath)
			expect(editState).toBeNull()
		})
	})
})
