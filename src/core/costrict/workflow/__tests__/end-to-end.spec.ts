import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { TaskEditTracker } from "../TaskEditTracker"
import { TaskContentProvider } from "../TaskContentProvider"
import { TaskSender } from "../TaskSender"

// Mock dependencies
const mockClineProvider = {
	getWebviewPanel: vi.fn(),
	postMessageToWebview: vi.fn(),
	dispose: vi.fn(),
}

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	access: vi.fn(),
	mkdir: vi.fn(),
	unlink: vi.fn(),
	rename: vi.fn(),
}))

vi.mock("fs", () => ({
	createWriteStream: vi.fn(() => ({
		write: vi.fn(),
		end: vi.fn(),
		on: vi.fn(),
		destroy: vi.fn(),
		destroyed: false,
	})),
}))

vi.mock("proper-lockfile", () => ({
	lock: vi.fn().mockResolvedValue(() => Promise.resolve()),
	unlock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("stream-json/Disassembler", () => ({
	disassembler: vi.fn(() => ({
		write: vi.fn(),
		end: vi.fn(),
		pipe: vi.fn().mockReturnThis(),
		on: vi.fn(),
	})),
}))

vi.mock("stream-json/Stringer", () => ({
	stringer: vi.fn(() => ({
		pipe: vi.fn().mockReturnThis(),
		on: vi.fn(),
	})),
}))

const mockSafeWriteJson = vi.fn().mockResolvedValue(undefined)
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: mockSafeWriteJson,
}))

describe("端到端功能测试", () => {
	let editTracker: TaskEditTracker
	let contentProvider: TaskContentProvider
	let taskSender: TaskSender
	let testFilePath: string
	let testContent: string

	beforeEach(() => {
		editTracker = new TaskEditTracker(mockClineProvider as any, "test-task-id")
		contentProvider = new TaskContentProvider()
		taskSender = new TaskSender({
			type: "file",
			endpoint: "/test/output.json",
			retryEnabled: true,
		})

		testFilePath = "/test/workspace/.cospec/tasks.md"
		testContent = `# 测试任务文件

## 功能开发
- [ ] 实现用户登录
- [x] 完成界面设计
- [-] 编写API接口

## 测试工作
- [ ] 单元测试
- [ ] 集成测试
`

		// 设置 mock 返回值
		vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
			if (filePath.toString().endsWith("output.json")) {
				// 模拟文件不存在的情况，让 TaskSender 创建新文件
				throw { code: "ENOENT" }
			}
			return testContent
		})
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(fs.access).mockResolvedValue(undefined)
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.unlink).mockResolvedValue(undefined)
		vi.mocked(fs.rename).mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("完整工作流程测试", () => {
		it("应该完成用户编辑到数据发送的完整流程", async () => {
			// 1. 模拟用户开始编辑
			editTracker.onFileEdited(testFilePath, "user_edited")

			// 验证编辑被记录
			expect(editTracker.hasRecentEdits(testFilePath)).toBe(true)
			const initialState = editTracker.getEditState(testFilePath)
			expect(initialState?.editCount).toBe(1)
			expect(initialState?.hasUserEdits).toBe(true)

			// 2. 模拟多次编辑
			editTracker.onFileEdited(testFilePath, "user_edited")
			editTracker.onFileEdited(testFilePath, "user_edited")

			const editState = editTracker.getEditState(testFilePath)
			expect(editState?.editCount).toBe(3)

			// 3. 获取文件内容
			const content = await contentProvider.getFileContent(testFilePath)
			expect(content).toBe(testContent)
			expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(testFilePath, "utf-8")

			// 4. 准备发送数据
			const taskData = {
				filePath: testFilePath,
				timestamp: Date.now(),
				taskLine: 1,
				taskContent: content,
				taskStatus: "pending" as const,
				fullFileContent: content,
				hasUserEdits: editState?.hasUserEdits || false,
				workspacePath: "/test/workspace",
			}

			// 5. 发送数据
			const sendResult = await taskSender.send(taskData)
			console.log("Send result:", sendResult)
			if (!sendResult.success) {
				console.error("Send failed with error:", sendResult.error)
			}
			expect(sendResult.success).toBe(true)

			// 6. 验证发送后清理编辑状态
			editTracker.clearEditState(testFilePath)
			expect(editTracker.hasRecentEdits(testFilePath)).toBe(false)
			expect(editTracker.getEditState(testFilePath)).toBeNull()
		})

		it("应该正确处理任务内容解析", async () => {
			// 获取内容
			const content = await contentProvider.getFileContent(testFilePath)

			// 使用 extractAllTasks 方法来获取所有任务
			const tasks = contentProvider.extractAllTasks(content)

			let completedCount = 0
			let inProgressCount = 0
			let pendingCount = 0

			tasks.forEach((task) => {
				switch (task.status) {
					case "completed":
						completedCount++
						break
					case "in-progress":
						inProgressCount++
						break
					case "pending":
						pendingCount++
						break
				}
			})

			expect(tasks.length).toBe(5) // 总共5个任务项
			expect(completedCount).toBe(1) // 1个已完成
			expect(inProgressCount).toBe(1) // 1个进行中
			expect(pendingCount).toBe(3) // 3个待完成
		})

		it("应该处理文件不存在的情况", async () => {
			const nonExistentPath = "/test/non-existent.md"

			// Mock 文件不存在
			vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT: no such file or directory"))

			await expect(contentProvider.getFileContent(nonExistentPath)).rejects.toThrow("无法读取文件")
		})

		it("应该正确处理发送失败的情况", async () => {
			// Mock safeWriteJson 失败
			mockSafeWriteJson.mockRejectedValueOnce(new Error("写入失败"))

			const testData = {
				filePath: testFilePath,
				timestamp: Date.now(),
				taskLine: 1,
				taskContent: testContent,
				taskStatus: "pending" as const,
				fullFileContent: testContent,
				hasUserEdits: false,
				workspacePath: "/test/workspace",
			}

			const result = await taskSender.send(testData)
			expect(result.success).toBe(false)
			expect(result.error).toContain("写入失败")
		})
	})

	describe("缓存机制测试", () => {
		it("应该正确使用内容缓存", async () => {
			// 第一次读取
			const content1 = await contentProvider.getFileContent(testFilePath)
			expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(1)

			// 第二次读取（应该使用缓存）
			const content2 = await contentProvider.getFileContent(testFilePath)
			expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(1) // 仍然是1次
			expect(content1).toBe(content2)

			// 等待缓存过期（模拟）
			await new Promise((resolve) => setTimeout(resolve, 10))

			// 清除缓存并重新读取
			contentProvider.clearCache()
			const content3 = await contentProvider.getFileContent(testFilePath)
			expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(2) // 现在是2次
		})
	})

	describe("错误处理测试", () => {
		it("应该正确处理编辑跟踪错误", async () => {
			// 测试非 tasks.md 文件
			const nonTaskFile = "/test/other.md"

			editTracker.onFileEdited(nonTaskFile, "user_edited")
			expect(editTracker.hasRecentEdits(nonTaskFile)).toBe(false)
			expect(editTracker.getEditState(nonTaskFile)).toBeNull()
		})

		it("应该正确处理任务发送重试", async () => {
			// 配置重试发送器
			const retrySender = new TaskSender({
				type: "file",
				endpoint: "/test/retry-output.json",
				retryEnabled: true,
			})

			// Mock 前两次失败，第三次成功
			mockSafeWriteJson
				.mockRejectedValueOnce(new Error("第一次失败"))
				.mockRejectedValueOnce(new Error("第二次失败"))
				.mockResolvedValueOnce(undefined)

			const testData = {
				filePath: testFilePath,
				timestamp: Date.now(),
				taskLine: 1,
				taskContent: testContent,
				taskStatus: "pending" as const,
				fullFileContent: testContent,
				hasUserEdits: false,
				workspacePath: "/test/workspace",
			}

			const result = await retrySender.send(testData)
			expect(result.success).toBe(true)
			expect(mockSafeWriteJson).toHaveBeenCalledTimes(3)
		})
	})

	describe("性能测试", () => {
		it("应该在合理时间内完成操作", async () => {
			const startTime = Date.now()

			// 执行完整流程
			editTracker.onFileEdited(testFilePath, "user_edited")
			const content = await contentProvider.getFileContent(testFilePath)
			const result = await taskSender.send({
				filePath: testFilePath,
				timestamp: Date.now(),
				taskLine: 1,
				taskContent: content,
				taskStatus: "pending" as const,
				fullFileContent: content,
				hasUserEdits: false,
				workspacePath: "/test/workspace",
			})

			const endTime = Date.now()
			const duration = endTime - startTime

			expect(result.success).toBe(true)
			expect(duration).toBeLessThan(1000) // 应该在1秒内完成
		})

		it("应该正确处理大量编辑事件", async () => {
			const editCount = 100

			const startTime = Date.now()

			// 模拟大量编辑
			for (let i = 0; i < editCount; i++) {
				editTracker.onFileEdited(testFilePath, "user_edited")
			}

			const endTime = Date.now()
			const duration = endTime - startTime

			const finalState = editTracker.getEditState(testFilePath)
			expect(finalState?.editCount).toBe(editCount)
			expect(duration).toBeLessThan(100) // 应该在100ms内完成
		})
	})
})
