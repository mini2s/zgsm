import { describe, it, expect, vi, beforeEach } from "vitest"
import { TaskEditTracker } from "../TaskEditTracker"

// Mock ClineProvider
const mockClineProvider = {
	getWebviewPanel: vi.fn(),
	postMessageToWebview: vi.fn(),
	dispose: vi.fn(),
}

describe("Commands 单元测试", () => {
	let taskEditTracker: TaskEditTracker

	beforeEach(() => {
		taskEditTracker = new TaskEditTracker(mockClineProvider as any, "test-task-id")
	})

	describe("TaskEditTracker 集成测试", () => {
		it("应该正确检测用户编辑状态", () => {
			const testFilePath = "/test/workspace/.cospec/tasks.md"

			// 初始状态：没有编辑
			expect(taskEditTracker.hasRecentEdits(testFilePath)).toBe(false)
			expect(taskEditTracker.getEditState(testFilePath)).toBeNull()

			// 模拟用户编辑
			taskEditTracker.onFileEdited(testFilePath, "user_edited")

			// 验证编辑状态
			expect(taskEditTracker.hasRecentEdits(testFilePath)).toBe(true)
			const editState = taskEditTracker.getEditState(testFilePath)
			expect(editState).not.toBeNull()
			expect(editState?.hasUserEdits).toBe(true)
			expect(editState?.filePath).toBe(testFilePath)
			expect(editState?.editCount).toBe(1)

			// 清除编辑状态
			taskEditTracker.clearEditState(testFilePath)
			expect(taskEditTracker.hasRecentEdits(testFilePath)).toBe(false)
			expect(taskEditTracker.getEditState(testFilePath)).toBeNull()
		})

		it("应该只跟踪 tasks.md 文件", () => {
			const tasksFilePath = "/test/workspace/.cospec/tasks.md"
			const otherFilePath = "/test/workspace/src/app.ts"

			// 编辑 tasks.md 文件
			taskEditTracker.onFileEdited(tasksFilePath, "user_edited")
			expect(taskEditTracker.hasRecentEdits(tasksFilePath)).toBe(true)

			// 编辑其他文件
			taskEditTracker.onFileEdited(otherFilePath, "user_edited")
			expect(taskEditTracker.hasRecentEdits(otherFilePath)).toBe(false)
			expect(taskEditTracker.getEditState(otherFilePath)).toBeNull()
		})

		it("应该正确处理多次编辑", () => {
			const testFilePath = "/test/workspace/.cospec/tasks.md"

			// 第一次编辑
			taskEditTracker.onFileEdited(testFilePath, "user_edited")
			let editState = taskEditTracker.getEditState(testFilePath)
			expect(editState?.editCount).toBe(1)

			// 第二次编辑
			taskEditTracker.onFileEdited(testFilePath, "user_edited")
			editState = taskEditTracker.getEditState(testFilePath)
			expect(editState?.editCount).toBe(2)

			// 验证统计信息
			const stats = taskEditTracker.getEditStatistics()
			expect(stats.totalFiles).toBe(1)
			expect(stats.totalEdits).toBe(2)
			expect(stats.filesWithEdits).toContain(testFilePath)
		})
	})
})
