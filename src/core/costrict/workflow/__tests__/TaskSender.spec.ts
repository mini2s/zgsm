import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import { TaskSender } from "../TaskSender"
import { TaskRunData, TaskSenderConfig } from "../types"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn(),
}))

// Mock fetch
global.fetch = vi.fn()

// Import mocked safeWriteJson
const { safeWriteJson } = (await vi.importMock("../../../utils/safeWriteJson")) as { safeWriteJson: any }

describe("TaskSender", () => {
	let sender: TaskSender
	let mockConfig: TaskSenderConfig
	let mockTaskData: TaskRunData
	const mockFs = vi.mocked(fs)
	const mockFetch = vi.mocked(fetch)
	const mockSafeWriteJson = vi.mocked(safeWriteJson)

	beforeEach(() => {
		mockConfig = {
			type: "http",
			endpoint: "http://localhost:3000/api/task-run",
			headers: { Authorization: "Bearer test-token" },
			timeout: 5000,
			retryEnabled: true,
		}

		mockTaskData = {
			filePath: ".cospec/tasks.md",
			timestamp: Date.now(),
			taskLine: 5,
			taskContent: "测试任务",
			taskStatus: "pending",
			fullFileContent: "# 任务列表\n- [ ] 测试任务",
			hasUserEdits: true,
			lastEditTime: Date.now() - 1000,
			workspacePath: "/test/workspace",
			taskId: "task-1",
			userId: "user-1",
		}

		sender = new TaskSender(mockConfig)

		// 重置所有模拟
		vi.clearAllMocks()

		// 确保 safeWriteJson 模拟正确设置
		mockSafeWriteJson.mockResolvedValue(undefined)
	})

	afterEach(() => {
		sender.clearRetryState()
	})

	describe("HTTP 发送", () => {
		beforeEach(() => {
			mockConfig.type = "http"
			sender.configure(mockConfig)
		})

		it("应该成功发送 HTTP 请求", async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				statusText: "OK",
				json: vi.fn().mockResolvedValue({ success: true, id: "response-1" }),
			}
			mockFetch.mockResolvedValue(mockResponse as any)

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(true)
			expect(result.responseData).toEqual({ success: true, id: "response-1" })
			expect(mockFetch).toHaveBeenCalledWith(
				mockConfig.endpoint,
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...mockConfig.headers,
					},
					body: JSON.stringify(mockTaskData),
				}),
			)
		})

		it("HTTP 错误应该返回失败结果", async () => {
			const mockResponse = {
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: vi.fn().mockResolvedValue({ error: "Server error" }),
			}
			mockFetch.mockResolvedValue(mockResponse as any)

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(false)
			expect(result.error).toBe("HTTP 500: Internal Server Error")
		})

		it("网络错误应该触发重试", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({ success: true }),
			} as any)

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(true)
			expect(mockFetch).toHaveBeenCalledTimes(2)
		})

		it("请求超时应该被处理", async () => {
			mockConfig.timeout = 100
			sender.configure(mockConfig)

			// 模拟超时
			mockFetch.mockImplementation(
				() =>
					new Promise((_, reject) => {
						setTimeout(() => reject(new Error("AbortError")), 200)
					}),
			)

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(false)
			expect(result.error).toContain("请求超时")
		})
	})

	describe("文件发送", () => {
		beforeEach(() => {
			mockConfig.type = "file"
			mockConfig.endpoint = "/test/output.json"
			sender.configure(mockConfig)

			// 重置模拟
			vi.clearAllMocks()
			mockSafeWriteJson.mockResolvedValue(undefined)
		})

		it("应该成功保存到文件", async () => {
			// 模拟文件不存在
			const enoentError = new Error("ENOENT") as any
			enoentError.code = "ENOENT"
			mockFs.readFile.mockRejectedValue(enoentError)
			mockSafeWriteJson.mockResolvedValue(undefined)

			const result = await sender.send(mockTaskData)

			// 添加调试信息
			if (!result.success) {
				console.log("Test failed with error:", result.error)
			}

			expect(result.success).toBe(true)
			expect(result.responseData).toEqual({
				filePath: "/test/output.json",
				recordCount: 1,
			})
			expect(mockSafeWriteJson).toHaveBeenCalledWith(
				"/test/output.json",
				expect.arrayContaining([
					expect.objectContaining({
						data: mockTaskData,
					}),
				]),
			)
		})

		it("应该追加到现有文件", async () => {
			const existingData = [{ timestamp: "2023-01-01", data: { test: "old" } }]
			mockFs.readFile.mockResolvedValue(JSON.stringify(existingData))
			mockSafeWriteJson.mockResolvedValue(undefined)

			const result = await sender.send(mockTaskData)

			// 添加调试信息
			if (!result.success) {
				console.log("Test failed with error:", result.error)
			}

			expect(result.success).toBe(true)
			expect(result.responseData?.recordCount).toBe(2)
			expect(mockSafeWriteJson).toHaveBeenCalledWith(
				"/test/output.json",
				expect.arrayContaining([
					...existingData,
					expect.objectContaining({
						data: mockTaskData,
					}),
				]),
			)
		})

		it("文件写入失败应该返回错误", async () => {
			mockFs.readFile.mockRejectedValue(new Error("ENOENT"))
			mockSafeWriteJson.mockRejectedValue(new Error("Permission denied"))

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(false)
			expect(result.error).toContain("文件写入失败")
		})
	})

	describe("重试机制", () => {
		beforeEach(() => {
			mockConfig.retryEnabled = true
			sender.configure(mockConfig)
		})

		it("应该在网络错误时重试", async () => {
			mockFetch
				.mockRejectedValueOnce(new Error("Network error"))
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: vi.fn().mockResolvedValue({ success: true }),
				} as any)

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(true)
			expect(mockFetch).toHaveBeenCalledTimes(3)
		})

		it("达到最大重试次数后应该失败", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"))

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(false)
			expect(mockFetch).toHaveBeenCalledTimes(4) // 1 + 3 重试
		})

		it("不应该重试客户端错误", async () => {
			const mockResponse = {
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: vi.fn().mockResolvedValue({ error: "Invalid request" }),
			}
			mockFetch.mockResolvedValue(mockResponse as any)

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(false)
			expect(mockFetch).toHaveBeenCalledTimes(1) // 不重试
		})

		it("禁用重试时不应该重试", async () => {
			mockConfig.retryEnabled = false
			sender.configure(mockConfig)
			mockFetch.mockRejectedValue(new Error("Network error"))

			const result = await sender.send(mockTaskData)

			expect(result.success).toBe(false)
			expect(mockFetch).toHaveBeenCalledTimes(1)
		})
	})

	describe("连接测试", () => {
		it("HTTP 连接测试应该成功", async () => {
			mockConfig.type = "http"
			sender.configure(mockConfig)

			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
			} as any)

			const result = await sender.testConnection()

			expect(result).toBe(true)
			expect(mockFetch).toHaveBeenCalledWith(
				mockConfig.endpoint,
				expect.objectContaining({
					method: "HEAD",
				}),
			)
		})

		it("HTTP 连接测试失败应该返回 false", async () => {
			mockConfig.type = "http"
			sender.configure(mockConfig)

			mockFetch.mockRejectedValue(new Error("Connection failed"))

			const result = await sender.testConnection()

			expect(result).toBe(false)
		})

		it("文件连接测试应该成功", async () => {
			mockConfig.type = "file"
			mockConfig.endpoint = "/test/output.json"
			sender.configure(mockConfig)

			// 模拟所有文件系统操作成功
			mockFs.mkdir.mockResolvedValue(undefined)
			mockSafeWriteJson.mockResolvedValue(undefined)

			// 模拟 fs.unlink 方法
			const mockUnlink = vi.fn().mockResolvedValue(undefined)
			mockFs.unlink = mockUnlink

			const result = await sender.testConnection()

			expect(result).toBe(true)
		})

		it("文件连接测试失败应该返回 false", async () => {
			mockConfig.type = "file"
			mockConfig.endpoint = "/invalid/path/output.json"
			sender.configure(mockConfig)

			mockFs.mkdir.mockRejectedValue(new Error("Permission denied"))

			const result = await sender.testConnection()

			expect(result).toBe(false)
		})
	})

	describe("配置管理", () => {
		it("应该正确更新配置", () => {
			const newConfig: TaskSenderConfig = {
				type: "file",
				endpoint: "/new/path.json",
				retryEnabled: false,
			}

			sender.configure(newConfig)
			const currentConfig = sender.getConfig()

			expect(currentConfig).toEqual(newConfig)
		})

		it("应该返回当前配置的副本", () => {
			const config = sender.getConfig()
			config.endpoint = "modified"

			const originalConfig = sender.getConfig()
			expect(originalConfig.endpoint).not.toBe("modified")
		})
	})

	describe("统计信息", () => {
		it("应该正确跟踪重试统计", async () => {
			mockFetch
				.mockRejectedValueOnce(new Error("Network error"))
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: vi.fn().mockResolvedValue({ success: true }),
				} as any)

			await sender.send(mockTaskData)

			const stats = sender.getRetryStatistics()
			expect(stats.activeRetries).toBe(0) // 成功后清除
			expect(stats.totalRetryAttempts).toBe(0)
		})

		it("应该清除重试状态", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"))

			// 触发重试
			await sender.send(mockTaskData).catch(() => {})

			let stats = sender.getRetryStatistics()
			expect(stats.activeRetries).toBeGreaterThan(0)

			sender.clearRetryState()
			stats = sender.getRetryStatistics()
			expect(stats.activeRetries).toBe(0)
		})
	})
})
