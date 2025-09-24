import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock 所有依赖
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" },
			},
		],
	},
}))

vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockResolvedValue(undefined),
}))

// 导入需要测试的模块
import { TaskEditTracker } from "../TaskEditTracker"
import { TaskContentProvider } from "../TaskContentProvider"
import { TaskSender } from "../TaskSender"

const mockClineProvider = {
	getWebviewPanel: vi.fn(),
	postMessageToWebview: vi.fn(),
	dispose: vi.fn(),
}

describe("handleTaskSync 修复验证", () => {
	let taskEditTracker: TaskEditTracker
	let taskContentProvider: TaskContentProvider
	let taskSender: TaskSender

	beforeEach(() => {
		taskEditTracker = new TaskEditTracker(mockClineProvider as any, "test-task-id")
		taskContentProvider = new TaskContentProvider()
		taskSender = new TaskSender({
			type: "file",
			endpoint: "/test/output.json",
			retryEnabled: false,
		})
	})

	it("应该正确使用 TaskEditTracker 检测编辑状态", async () => {
		const testFilePath = "/test/workspace/.cospec/tasks.md"

		// 模拟用户编辑
		taskEditTracker.onFileEdited(testFilePath, "user_edited")

		// 验证编辑状态检测
		const editState = taskEditTracker.getEditState(testFilePath)
		expect(editState).not.toBeNull()
		expect(editState?.hasUserEdits).toBe(true)
		expect(editState?.editCount).toBe(1)
		expect(typeof editState?.lastEditTime).toBe("number")

		// 验证清除编辑状态功能
		taskEditTracker.clearEditState(testFilePath)
		expect(taskEditTracker.getEditState(testFilePath)).toBeNull()
	})

	it("应该正确处理没有编辑的情况", () => {
		const testFilePath = "/test/workspace/.cospec/tasks.md"

		// 没有编辑的情况
		const editState = taskEditTracker.getEditState(testFilePath)
		expect(editState).toBeNull()

		// 验证 hasUserEdits 应该为 false
		expect(taskEditTracker.hasRecentEdits(testFilePath)).toBe(false)
	})

	it("应该正确处理非 tasks.md 文件", () => {
		const testFilePath = "/test/workspace/src/app.ts"

		// 编辑非 tasks.md 文件
		taskEditTracker.onFileEdited(testFilePath, "user_edited")

		// 应该不被跟踪
		expect(taskEditTracker.getEditState(testFilePath)).toBeNull()
		expect(taskEditTracker.hasRecentEdits(testFilePath)).toBe(false)
	})

	it("应该正确处理错误情况", () => {
		const testFilePath = "/test/workspace/.cospec/tasks.md"

		// 测试 getEditState 的错误处理
		expect(() => {
			taskEditTracker.getEditState(testFilePath)
		}).not.toThrow()

		// 测试 clearEditState 的错误处理
		expect(() => {
			taskEditTracker.clearEditState(testFilePath)
		}).not.toThrow()
	})
})
