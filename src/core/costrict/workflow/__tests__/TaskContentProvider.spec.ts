import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import { TaskContentProvider } from "../TaskContentProvider"

// Mock fs module
vi.mock("fs/promises")

describe("TaskContentProvider", () => {
	let provider: TaskContentProvider
	const mockFs = vi.mocked(fs)

	beforeEach(() => {
		provider = new TaskContentProvider()
		vi.clearAllMocks()
	})

	afterEach(() => {
		provider.clearCache()
	})

	describe("getFileContent", () => {
		it("应该成功读取文件内容", async () => {
			const mockContent = "# 测试任务\n- [ ] 未完成任务\n- [x] 已完成任务"
			mockFs.readFile.mockResolvedValue(mockContent)

			const result = await provider.getFileContent("/test/tasks.md")

			expect(result).toBe(mockContent)
			expect(mockFs.readFile).toHaveBeenCalledWith("/test/tasks.md", "utf-8")
		})

		it("应该使用缓存避免重复读取", async () => {
			const mockContent = "# 测试任务"
			mockFs.readFile.mockResolvedValue(mockContent)

			// 第一次调用
			await provider.getFileContent("/test/tasks.md")
			// 第二次调用
			await provider.getFileContent("/test/tasks.md")

			// 只应该调用一次 readFile
			expect(mockFs.readFile).toHaveBeenCalledTimes(1)
		})

		it("文件读取失败时应该抛出错误", async () => {
			mockFs.readFile.mockRejectedValue(new Error("文件不存在"))

			await expect(provider.getFileContent("/nonexistent/tasks.md")).rejects.toThrow("无法读取文件")
		})
	})

	describe("parseTaskAtLine", () => {
		const sampleContent = `# 任务列表
- [ ] 未开始的任务
- [-] 进行中的任务
- [x] 已完成的任务
- 普通文本行
- [ ] 1.1 带编号的任务`

		it("应该正确解析未开始的任务", () => {
			const result = provider.parseTaskAtLine(sampleContent, 1)

			expect(result).toEqual({
				line: 1,
				content: "未开始的任务",
				status: "pending",
				taskId: undefined,
			})
		})

		it("应该正确解析进行中的任务", () => {
			const result = provider.parseTaskAtLine(sampleContent, 2)

			expect(result).toEqual({
				line: 2,
				content: "进行中的任务",
				status: "in-progress",
				taskId: undefined,
			})
		})

		it("应该正确解析已完成的任务", () => {
			const result = provider.parseTaskAtLine(sampleContent, 3)

			expect(result).toEqual({
				line: 3,
				content: "已完成的任务",
				status: "completed",
				taskId: undefined,
			})
		})

		it("应该正确解析带编号的任务", () => {
			const result = provider.parseTaskAtLine(sampleContent, 5)

			expect(result).toEqual({
				line: 5,
				content: "带编号的任务",
				status: "pending",
				taskId: "1.1",
			})
		})

		it("非任务行应该返回 null", () => {
			const result = provider.parseTaskAtLine(sampleContent, 4)
			expect(result).toBeNull()
		})

		it("无效行号应该返回 null", () => {
			const result = provider.parseTaskAtLine(sampleContent, 999)
			expect(result).toBeNull()
		})
	})

	describe("extractAllTasks", () => {
		const sampleContent = `# 任务列表
- [ ] 第一个任务
- [x] 第二个任务
普通文本
- [-] 第三个任务
## 子章节
- [ ] 2.1 子任务`

		it("应该提取所有任务", () => {
			const tasks = provider.extractAllTasks(sampleContent)

			expect(tasks).toHaveLength(4)
			expect(tasks[0]).toEqual({
				line: 1,
				content: "第一个任务",
				status: "pending",
				taskId: undefined,
			})
			expect(tasks[1]).toEqual({
				line: 2,
				content: "第二个任务",
				status: "completed",
				taskId: undefined,
			})
			expect(tasks[2]).toEqual({
				line: 4,
				content: "第三个任务",
				status: "in-progress",
				taskId: undefined,
			})
			expect(tasks[3]).toEqual({
				line: 6,
				content: "子任务",
				status: "pending",
				taskId: "2.1",
			})
		})

		it("空内容应该返回空数组", () => {
			const tasks = provider.extractAllTasks("")
			expect(tasks).toEqual([])
		})
	})

	describe("getTaskWithContext", () => {
		const sampleContent = `- [ ] 主任务
  - 子内容1
  - 子内容2
    - 更深层内容
- [ ] 另一个任务`

		it("应该获取任务及其子内容", () => {
			const result = provider.getTaskWithContext(sampleContent, 0)

			expect(result).toBe(`- [ ] 主任务
  - 子内容1
  - 子内容2
    - 更深层内容`)
		})

		it("无效行号应该返回空字符串", () => {
			const result = provider.getTaskWithContext(sampleContent, 999)
			expect(result).toBe("")
		})
	})

	describe("validateTasksFile", () => {
		it("有效的 tasks.md 文件应该返回 true", async () => {
			const mockContent = "- [ ] 测试任务"
			mockFs.readFile.mockResolvedValue(mockContent)

			const result = await provider.validateTasksFile("/test/tasks.md")
			expect(result).toBe(true)
		})

		it("无任务格式的文件应该返回 false", async () => {
			const mockContent = "# 普通文档\n没有任务格式"
			mockFs.readFile.mockResolvedValue(mockContent)

			const result = await provider.validateTasksFile("/test/tasks.md")
			expect(result).toBe(false)
		})

		it("非 tasks.md 文件应该返回 false", async () => {
			const mockContent = "- [ ] 测试任务"
			mockFs.readFile.mockResolvedValue(mockContent)

			const result = await provider.validateTasksFile("/test/other.md")
			expect(result).toBe(false)
		})

		it("文件读取失败应该返回 false", async () => {
			mockFs.readFile.mockRejectedValue(new Error("文件不存在"))

			const result = await provider.validateTasksFile("/test/tasks.md")
			expect(result).toBe(false)
		})
	})

	describe("getTaskStatistics", () => {
		it("应该正确统计任务状态", async () => {
			const mockContent = `- [ ] 未开始1
- [ ] 未开始2
- [-] 进行中1
- [x] 已完成1
- [x] 已完成2
- [x] 已完成3`
			mockFs.readFile.mockResolvedValue(mockContent)

			const stats = await provider.getTaskStatistics("/test/tasks.md")

			expect(stats).toEqual({
				total: 6,
				pending: 2,
				inProgress: 1,
				completed: 3,
			})
		})

		it("空文件应该返回零统计", async () => {
			mockFs.readFile.mockResolvedValue("")

			const stats = await provider.getTaskStatistics("/test/tasks.md")

			expect(stats).toEqual({
				total: 0,
				pending: 0,
				inProgress: 0,
				completed: 0,
			})
		})

		it("文件读取失败应该返回零统计", async () => {
			mockFs.readFile.mockRejectedValue(new Error("文件不存在"))

			const stats = await provider.getTaskStatistics("/test/tasks.md")

			expect(stats).toEqual({
				total: 0,
				pending: 0,
				inProgress: 0,
				completed: 0,
			})
		})
	})

	describe("缓存管理", () => {
		it("应该正确管理缓存", async () => {
			const mockContent = "测试内容"
			mockFs.readFile.mockResolvedValue(mockContent)

			// 添加到缓存
			await provider.getFileContent("/test/tasks.md")

			let stats = provider.getCacheStats()
			expect(stats.size).toBe(1)
			expect(stats.files).toContain("/test/tasks.md")

			// 清除缓存
			provider.clearCache()

			stats = provider.getCacheStats()
			expect(stats.size).toBe(0)
			expect(stats.files).toEqual([])
		})
	})
})
