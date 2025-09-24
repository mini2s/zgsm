import { describe, it, expect, beforeEach, vi } from "vitest"
import { TaskEditTracker } from "../TaskEditTracker"
import { ClineProvider } from "../../../webview/ClineProvider"
import { FileContextTracker } from "../../../context-tracking/FileContextTracker"

// Mock dependencies
vi.mock("../../../context-tracking/FileContextTracker")
vi.mock("../../../webview/ClineProvider")

describe("TaskEditTracker", () => {
	let tracker: TaskEditTracker
	let mockProvider: ClineProvider
	let mockFileContextTracker: FileContextTracker
	const taskId = "test-task-id"

	beforeEach(() => {
		mockProvider = {} as ClineProvider
		mockFileContextTracker = {
			trackFileContext: vi.fn(),
			getAndClearRecentlyModifiedFiles: vi.fn().mockReturnValue([]),
			markFileAsEditedByRoo: vi.fn(),
			setupFileWatcher: vi.fn(),
			dispose: vi.fn(),
		} as any

		// Mock FileContextTracker constructor
		vi.mocked(FileContextTracker).mockImplementation(() => mockFileContextTracker)

		tracker = new TaskEditTracker(mockProvider, taskId)
		vi.clearAllMocks()
	})

	describe("onFileEdited", () => {
		it("应该跟踪 tasks.md 文件的用户编辑", () => {
			const filePath = "/workspace/.cospec/tasks.md"

			tracker.onFileEdited(filePath, "user_edited")

			// 应该调用底层的文件上下文跟踪
			expect(mockFileContextTracker.trackFileContext).toHaveBeenCalledWith(filePath, "user_edited")

			// 应该记录编辑状态
			const editState = tracker.getEditState(filePath)
			expect(editState).toBeTruthy()
			expect(editState?.filePath).toBe(filePath)
			expect(editState?.hasUserEdits).toBe(true)
			expect(editState?.editCount).toBe(1)
		})

		it("应该累计编辑次数", () => {
			const filePath = "/workspace/.cospec/tasks.md"

			// 第一次编辑
			tracker.onFileEdited(filePath, "user_edited")
			let editState = tracker.getEditState(filePath)
			expect(editState?.editCount).toBe(1)

			// 第二次编辑
			tracker.onFileEdited(filePath, "user_edited")
			editState = tracker.getEditState(filePath)
			expect(editState?.editCount).toBe(2)
		})

		it("应该忽略非 tasks.md 文件", () => {
			const filePath = "/workspace/.cospec/requirements.md"

			tracker.onFileEdited(filePath, "user_edited")

			// 应该调用底层跟踪
			expect(mockFileContextTracker.trackFileContext).toHaveBeenCalledWith(filePath, "user_edited")

			// 但不应该记录编辑状态
			const editState = tracker.getEditState(filePath)
			expect(editState).toBeNull()
		})

		it("应该忽略非用户编辑", () => {
			const filePath = "/workspace/.cospec/tasks.md"

			tracker.onFileEdited(filePath, "roo_edited")

			// 应该调用底层跟踪
			expect(mockFileContextTracker.trackFileContext).toHaveBeenCalledWith(filePath, "roo_edited")

			// 但不应该记录编辑状态
			const editState = tracker.getEditState(filePath)
			expect(editState).toBeNull()
		})

		it("应该处理 Windows 路径分隔符", () => {
			const filePath = "C:\\workspace\\.cospec\\tasks.md"

			tracker.onFileEdited(filePath, "user_edited")

			const editState = tracker.getEditState(filePath)
			expect(editState).toBeTruthy()
			expect(editState?.hasUserEdits).toBe(true)
		})
	})

	describe("hasRecentEdits", () => {
		it("有编辑的 tasks.md 文件应该返回 true", () => {
			const filePath = "/workspace/.cospec/tasks.md"

			tracker.onFileEdited(filePath, "user_edited")

			expect(tracker.hasRecentEdits(filePath)).toBe(true)
		})

		it("没有编辑的文件应该返回 false", () => {
			const filePath = "/workspace/.cospec/tasks.md"

			expect(tracker.hasRecentEdits(filePath)).toBe(false)
		})

		it("非 tasks.md 文件应该返回 false", () => {
			const filePath = "/workspace/.cospec/requirements.md"

			expect(tracker.hasRecentEdits(filePath)).toBe(false)
		})
	})

	describe("getEditState", () => {
		it("应该返回正确的编辑状态", () => {
			const filePath = "/workspace/.cospec/tasks.md"
			const beforeTime = Date.now()

			tracker.onFileEdited(filePath, "user_edited")

			const editState = tracker.getEditState(filePath)
			expect(editState).toBeTruthy()
			expect(editState?.filePath).toBe(filePath)
			expect(editState?.hasUserEdits).toBe(true)
			expect(editState?.editCount).toBe(1)
			expect(editState?.lastEditTime).toBeGreaterThanOrEqual(beforeTime)
		})

		it("非 tasks.md 文件应该返回 null", () => {
			const filePath = "/workspace/.cospec/requirements.md"

			const editState = tracker.getEditState(filePath)
			expect(editState).toBeNull()
		})

		it("未编辑的文件应该返回 null", () => {
			const filePath = "/workspace/.cospec/tasks.md"

			const editState = tracker.getEditState(filePath)
			expect(editState).toBeNull()
		})
	})

	describe("clearEditState", () => {
		it("应该清除指定文件的编辑状态", () => {
			const filePath = "/workspace/.cospec/tasks.md"

			tracker.onFileEdited(filePath, "user_edited")
			expect(tracker.hasRecentEdits(filePath)).toBe(true)

			tracker.clearEditState(filePath)
			expect(tracker.hasRecentEdits(filePath)).toBe(false)
		})

		it("应该忽略非 tasks.md 文件", () => {
			const filePath = "/workspace/.cospec/requirements.md"

			// 不应该抛出错误
			tracker.clearEditState(filePath)
		})
	})

	describe("getAllEditStates", () => {
		it("应该返回所有编辑状态", () => {
			const filePath1 = "/workspace/.cospec/tasks.md"
			const filePath2 = "/workspace/project/.cospec/tasks.md"

			tracker.onFileEdited(filePath1, "user_edited")
			tracker.onFileEdited(filePath2, "user_edited")

			const allStates = tracker.getAllEditStates()
			expect(allStates.size).toBe(2)
			expect(allStates.has(filePath1)).toBe(true)
			expect(allStates.has(filePath2)).toBe(true)
		})

		it("空状态应该返回空 Map", () => {
			const allStates = tracker.getAllEditStates()
			expect(allStates.size).toBe(0)
		})
	})

	describe("clearAllEditStates", () => {
		it("应该清除所有编辑状态", () => {
			const filePath1 = "/workspace/.cospec/tasks.md"
			const filePath2 = "/workspace/project/.cospec/tasks.md"

			tracker.onFileEdited(filePath1, "user_edited")
			tracker.onFileEdited(filePath2, "user_edited")

			expect(tracker.getAllEditStates().size).toBe(2)

			tracker.clearAllEditStates()
			expect(tracker.getAllEditStates().size).toBe(0)
		})
	})

	describe("getEditStatistics", () => {
		it("应该返回正确的统计信息", () => {
			const filePath1 = "/workspace/.cospec/tasks.md"
			const filePath2 = "/workspace/project/.cospec/tasks.md"

			// 第一个文件编辑 2 次
			tracker.onFileEdited(filePath1, "user_edited")
			tracker.onFileEdited(filePath1, "user_edited")

			// 第二个文件编辑 1 次
			tracker.onFileEdited(filePath2, "user_edited")

			const stats = tracker.getEditStatistics()
			expect(stats.totalFiles).toBe(2)
			expect(stats.totalEdits).toBe(3)
			expect(stats.filesWithEdits).toEqual([filePath1, filePath2])
			expect(stats.lastEditTime).toBeDefined()
		})

		it("空状态应该返回零统计", () => {
			const stats = tracker.getEditStatistics()
			expect(stats.totalFiles).toBe(0)
			expect(stats.totalEdits).toBe(0)
			expect(stats.filesWithEdits).toEqual([])
			expect(stats.lastEditTime).toBeUndefined()
		})
	})

	describe("底层 FileContextTracker 方法", () => {
		it("应该代理 getAndClearRecentlyModifiedFiles", () => {
			const mockFiles = ["/test/file1.md", "/test/file2.md"]
			mockFileContextTracker.getAndClearRecentlyModifiedFiles = vi.fn().mockReturnValue(mockFiles)

			const result = tracker.getAndClearRecentlyModifiedFiles()

			expect(result).toEqual(mockFiles)
			expect(mockFileContextTracker.getAndClearRecentlyModifiedFiles).toHaveBeenCalled()
		})

		it("应该代理 markFileAsEditedByRoo", () => {
			const filePath = "/test/file.md"

			tracker.markFileAsEditedByRoo(filePath)

			expect(mockFileContextTracker.markFileAsEditedByRoo).toHaveBeenCalledWith(filePath)
		})

		it("应该代理 setupFileWatcher", async () => {
			const filePath = "/test/file.md"
			mockFileContextTracker.setupFileWatcher = vi.fn().mockResolvedValue(undefined)

			await tracker.setupFileWatcher(filePath)

			expect(mockFileContextTracker.setupFileWatcher).toHaveBeenCalledWith(filePath)
		})
	})

	describe("dispose", () => {
		it("应该清理资源", () => {
			const filePath = "/workspace/.cospec/tasks.md"
			tracker.onFileEdited(filePath, "user_edited")

			expect(tracker.getAllEditStates().size).toBe(1)

			tracker.dispose()

			expect(tracker.getAllEditStates().size).toBe(0)
			expect(mockFileContextTracker.dispose).toHaveBeenCalled()
		})
	})
})
