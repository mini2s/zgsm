import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { TaskEditTracker } from "../TaskEditTracker"
import { TaskContentProvider } from "../TaskContentProvider"

// Mock dependencies
const mockClineProvider = {
	getWebviewPanel: vi.fn(),
	postMessageToWebview: vi.fn(),
	dispose: vi.fn(),
}

vi.mock("fs/promises", () => ({
	readFile: vi.fn().mockResolvedValue("# Test Content\n- [ ] Task 1\n- [x] Task 2"),
	writeFile: vi.fn(),
	access: vi.fn(),
	mkdir: vi.fn(),
}))

describe("性能和稳定性测试", () => {
	let editTracker: TaskEditTracker
	let contentProvider: TaskContentProvider

	beforeEach(() => {
		editTracker = new TaskEditTracker(mockClineProvider as any, "test-task-id")
		contentProvider = new TaskContentProvider()
		vi.clearAllMocks()
	})

	describe("性能测试", () => {
		it("应该快速处理大量编辑事件", async () => {
			const testFilePath = "/test/.cospec/tasks.md"
			const editCount = 1000

			const startTime = performance.now()

			// 模拟大量编辑事件
			for (let i = 0; i < editCount; i++) {
				editTracker.onFileEdited(testFilePath, "user_edited")
			}

			const endTime = performance.now()
			const duration = endTime - startTime

			// 验证性能
			expect(duration).toBeLessThan(100) // 应该在100ms内完成

			// 验证结果正确性
			const state = editTracker.getEditState(testFilePath)
			expect(state?.editCount).toBe(editCount)
			expect(state?.hasUserEdits).toBe(true)
		})

		it("应该高效处理内容缓存", async () => {
			const testFilePath = "/test/.cospec/tasks.md"
			const readCount = 100

			const startTime = performance.now()

			// 多次读取同一文件（应该使用缓存）
			for (let i = 0; i < readCount; i++) {
				await contentProvider.getFileContent(testFilePath)
			}

			const endTime = performance.now()
			const duration = endTime - startTime

			// 验证性能（缓存应该显著提升性能）
			expect(duration).toBeLessThan(50) // 应该在50ms内完成

			// 验证只读取了一次文件
			const { readFile } = await import("fs/promises")
			expect(vi.mocked(readFile)).toHaveBeenCalledTimes(1)
		})

		it("应该快速解析大量任务项", async () => {
			// 创建包含大量任务的内容
			const taskCount = 500
			let largeContent = "# 大量任务测试\n\n"

			for (let i = 1; i <= taskCount; i++) {
				const status = i % 3 === 0 ? "x" : i % 3 === 1 ? "-" : " "
				largeContent += `- [${status}] 任务 ${i}\n`
			}

			// Mock 返回大内容
			const { readFile } = await import("fs/promises")
			vi.mocked(readFile).mockResolvedValueOnce(largeContent)

			const startTime = performance.now()

			// 解析所有任务
			const content = await contentProvider.getFileContent("/test/large-tasks.md")
			const tasks = contentProvider.extractAllTasks(content)

			const endTime = performance.now()
			const duration = endTime - startTime

			// 验证性能
			expect(duration).toBeLessThan(200) // 应该在200ms内完成

			// 验证结果正确性
			expect(tasks).toHaveLength(taskCount)
		})
	})

	describe("内存使用测试", () => {
		it("应该正确管理编辑状态内存", async () => {
			const fileCount = 100
			const editsPerFile = 50

			// 模拟多个文件的编辑
			for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
				const filePath = `/test/.cospec/tasks-${fileIndex}.md`

				for (let editIndex = 0; editIndex < editsPerFile; editIndex++) {
					editTracker.onFileEdited(filePath, "user_edited")
				}
			}

			// 验证状态管理
			const allStates = editTracker.getAllEditStates()
			expect(allStates.size).toBe(fileCount)

			// 清理部分状态
			for (let i = 0; i < fileCount / 2; i++) {
				const filePath = `/test/.cospec/tasks-${i}.md`
				editTracker.clearEditState(filePath)
			}

			// 验证清理效果
			const remainingStates = editTracker.getAllEditStates()
			expect(remainingStates.size).toBe(fileCount / 2)
		})

		it("应该正确管理内容缓存内存", async () => {
			const fileCount = 50

			// 读取多个文件
			for (let i = 0; i < fileCount; i++) {
				const filePath = `/test/file-${i}.md`
				await contentProvider.getFileContent(filePath)
			}

			// 验证缓存状态
			const cacheStats = contentProvider.getCacheStats()
			expect(cacheStats.size).toBe(fileCount)
			expect(cacheStats.files).toHaveLength(fileCount)

			// 清理缓存
			contentProvider.clearCache()

			// 验证清理效果
			const clearedStats = contentProvider.getCacheStats()
			expect(clearedStats.size).toBe(0)
			expect(clearedStats.files).toHaveLength(0)
		})
	})

	describe("并发处理测试", () => {
		it("应该正确处理并发编辑事件", async () => {
			const testFilePath = "/test/.cospec/tasks.md"
			const concurrentEdits = 100

			// 创建并发编辑 Promise
			const editPromises = Array.from({ length: concurrentEdits }, (_, i) =>
				Promise.resolve().then(() => {
					editTracker.onFileEdited(testFilePath, "user_edited")
					return i
				}),
			)

			// 等待所有编辑完成
			const results = await Promise.all(editPromises)

			// 验证结果
			expect(results).toHaveLength(concurrentEdits)

			const state = editTracker.getEditState(testFilePath)
			expect(state?.editCount).toBe(concurrentEdits)
			expect(state?.hasUserEdits).toBe(true)
		})

		it("应该正确处理并发文件读取", async () => {
			const fileCount = 20
			const testFilePath = "/test/.cospec/tasks.md"

			// 创建并发读取 Promise
			const readPromises = Array.from({ length: fileCount }, () => contentProvider.getFileContent(testFilePath))

			const startTime = performance.now()

			// 等待所有读取完成
			const results = await Promise.all(readPromises)

			const endTime = performance.now()
			const duration = endTime - startTime

			// 验证结果一致性
			const firstResult = results[0]
			results.forEach((result) => {
				expect(result).toBe(firstResult)
			})

			// 验证性能（缓存应该提升并发性能）
			expect(duration).toBeLessThan(100)

			// 验证只读取了一次文件
			const { readFile } = await import("fs/promises")
			expect(vi.mocked(readFile)).toHaveBeenCalledTimes(1)
		})
	})

	describe("稳定性测试", () => {
		it("应该处理异常的文件路径", async () => {
			const invalidPaths = [
				"",
				null as any,
				undefined as any,
				"/invalid/path/tasks.md",
				"not-a-tasks-file.txt",
				"/test/.cospec/not-tasks.md",
			]

			for (const path of invalidPaths) {
				// 编辑跟踪应该安全处理无效路径
				expect(() => {
					editTracker.onFileEdited(path, "user_edited")
				}).not.toThrow()

				// 对于非 tasks.md 文件，不应该有编辑状态
				if (path && typeof path === "string" && !path.includes("tasks.md")) {
					expect(editTracker.hasRecentEdits(path)).toBe(false)
					expect(editTracker.getEditState(path)).toBeNull()
				}
			}
		})

		it("应该处理文件读取错误", async () => {
			const { readFile } = await import("fs/promises")

			// Mock 文件读取错误
			vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: file not found"))

			// 应该抛出有意义的错误
			await expect(contentProvider.getFileContent("/nonexistent/file.md")).rejects.toThrow("无法读取文件")
		})

		it("应该处理大文件内容", async () => {
			// 创建大文件内容（10MB）
			const largeContent = "x".repeat(10 * 1024 * 1024)

			const { readFile } = await import("fs/promises")
			vi.mocked(readFile).mockResolvedValueOnce(largeContent)

			const startTime = performance.now()

			// 应该能够处理大文件
			const content = await contentProvider.getFileContent("/test/large-file.md")

			const endTime = performance.now()
			const duration = endTime - startTime

			expect(content).toBe(largeContent)
			expect(duration).toBeLessThan(1000) // 应该在1秒内完成
		})

		it("应该处理极端编辑频率", async () => {
			const testFilePath = "/test/.cospec/tasks.md"
			const rapidEdits = 10000

			const startTime = performance.now()

			// 极快速的编辑
			for (let i = 0; i < rapidEdits; i++) {
				editTracker.onFileEdited(testFilePath, "user_edited")
			}

			const endTime = performance.now()
			const duration = endTime - startTime

			// 应该能够处理极端频率
			expect(duration).toBeLessThan(500) // 应该在500ms内完成

			const state = editTracker.getEditState(testFilePath)
			expect(state?.editCount).toBe(rapidEdits)
		})
	})

	describe("资源清理测试", () => {
		it("应该正确清理所有资源", async () => {
			const testFilePath = "/test/.cospec/tasks.md"

			// 创建一些状态和缓存
			editTracker.onFileEdited(testFilePath, "user_edited")
			await contentProvider.getFileContent(testFilePath)

			// 验证资源存在
			expect(editTracker.getEditState(testFilePath)).toBeDefined()
			expect(contentProvider.getCacheStats().size).toBeGreaterThan(0)

			// 清理资源
			editTracker.clearAllEditStates()
			contentProvider.clearCache()

			// 验证清理效果
			expect(editTracker.getAllEditStates().size).toBe(0)
			expect(contentProvider.getCacheStats().size).toBe(0)
		})
	})
})
