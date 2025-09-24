import * as fs from "fs/promises"
import * as path from "path"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import { ITaskSender, TaskRunData, TaskSenderConfig, SendResult } from "./types"

/**
 * 任务发送器
 * 实现数据发送到服务器的功能
 * 支持多种发送方式（HTTP API、本地文件等）
 * 集成重试机制
 */
export class TaskSender implements ITaskSender {
	private config: TaskSenderConfig
	private retryAttempts = new Map<string, number>()
	private readonly MAX_RETRY_ATTEMPTS = 3
	private readonly RETRY_DELAY_BASE = 1000 // 1秒基础延迟

	constructor(config: TaskSenderConfig) {
		this.config = config
	}

	/**
	 * 发送任务数据
	 * 根据配置的类型选择相应的发送方式
	 */
	async send(data: TaskRunData): Promise<SendResult> {
		const startTime = Date.now()

		try {
			let result: SendResult

			switch (this.config.type) {
				case "http":
					result = await this.sendToHttp(data)
					break
				case "file":
					result = await this.saveToFile(data)
					break
				case "api":
					result = await this.sendToApi(data)
					break
				default:
					throw new Error(`不支持的发送类型: ${this.config.type}`)
			}

			// 发送成功，清除重试计数
			if (result.success) {
				this.retryAttempts.delete(this.getDataKey(data))
			}

			return result
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			console.error(`TaskSender: 发送失败 (${this.config.type}):`, errorMessage)

			// 如果启用重试且未达到最大重试次数，则进行重试
			if (this.config.retryEnabled && this.shouldRetry(data, error)) {
				return await this.retryWithBackoff(data)
			}

			return {
				success: false,
				error: errorMessage,
				timestamp: Date.now(),
			}
		}
	}

	/**
	 * 配置发送器
	 */
	configure(config: TaskSenderConfig): void {
		this.config = { ...config }
		console.log(`TaskSender: 配置已更新为 ${config.type} 类型`)
	}

	/**
	 * 测试连接
	 */
	async testConnection(): Promise<boolean> {
		try {
			switch (this.config.type) {
				case "http":
				case "api":
					return await this.testHttpConnection()
				case "file":
					return await this.testFileAccess()
				default:
					return false
			}
		} catch (error) {
			console.error("TaskSender: 连接测试失败:", error)
			return false
		}
	}

	/**
	 * 发送到 HTTP 服务
	 */
	private async sendToHttp(data: TaskRunData): Promise<SendResult> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 30000)

		try {
			const response = await fetch(this.config.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...this.config.headers,
				},
				body: JSON.stringify(data),
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			const responseData = await response.json().catch(() => ({}))

			return {
				success: response.ok,
				error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
				responseData,
				timestamp: Date.now(),
			}
		} catch (error) {
			clearTimeout(timeoutId)

			if (error instanceof Error && (error.name === "AbortError" || error.message === "AbortError")) {
				throw new Error("请求超时")
			}

			throw error
		}
	}

	/**
	 * 保存到本地文件
	 */
	private async saveToFile(data: TaskRunData): Promise<SendResult> {
		try {
			const filePath = this.config.endpoint
			const timestamp = new Date().toISOString()

			// 创建包含时间戳的数据记录
			const record = {
				timestamp,
				data,
			}

			// 如果文件已存在，读取现有数据并追加
			let existingData: any[] = []
			try {
				const existingContent = await fs.readFile(filePath, "utf-8")
				existingData = JSON.parse(existingContent)
				if (!Array.isArray(existingData)) {
					existingData = [existingData]
				}
			} catch (error) {
				// 文件不存在或格式错误，使用空数组
				existingData = []
			}

			// 追加新记录
			existingData.push(record)

			// 使用 safeWriteJson 安全写入文件
			await safeWriteJson(filePath, existingData)

			return {
				success: true,
				responseData: { filePath, recordCount: existingData.length },
				timestamp: Date.now(),
			}
		} catch (error) {
			return {
				success: false,
				error: `文件写入失败: ${error instanceof Error ? error.message : String(error)}`,
				timestamp: Date.now(),
			}
		}
	}

	/**
	 * 发送到 API 服务
	 * 这里可以扩展为更复杂的 API 调用逻辑
	 */
	private async sendToApi(data: TaskRunData): Promise<SendResult> {
		// 目前与 HTTP 发送方式相同，但可以扩展为更复杂的 API 逻辑
		return await this.sendToHttp(data)
	}

	/**
	 * 测试 HTTP 连接
	 */
	private async testHttpConnection(): Promise<boolean> {
		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 5000) // 5秒超时

			const response = await fetch(this.config.endpoint, {
				method: "HEAD",
				headers: this.config.headers,
				signal: controller.signal,
			})

			clearTimeout(timeoutId)
			return response.ok || response.status === 405 // 405 Method Not Allowed 也算连接成功
		} catch (error) {
			return false
		}
	}

	/**
	 * 测试文件访问
	 */
	private async testFileAccess(): Promise<boolean> {
		try {
			const filePath = this.config.endpoint
			const dirPath = path.dirname(filePath)

			// 检查目录是否存在，不存在则创建
			await fs.mkdir(dirPath, { recursive: true })

			// 尝试写入测试文件
			const testData = { test: true, timestamp: Date.now() }
			await safeWriteJson(filePath + ".test", testData)

			// 清理测试文件
			await fs.unlink(filePath + ".test").catch(() => {})

			return true
		} catch (error) {
			return false
		}
	}

	/**
	 * 判断是否应该重试
	 */
	private shouldRetry(data: TaskRunData, error: unknown): boolean {
		const dataKey = this.getDataKey(data)
		const currentAttempts = this.retryAttempts.get(dataKey) || 0

		// 检查是否达到最大重试次数
		if (currentAttempts >= this.MAX_RETRY_ATTEMPTS) {
			return false
		}

		// 检查错误类型，某些错误不应该重试
		if (error instanceof Error) {
			const errorMessage = error.message.toLowerCase()

			// 不重试的错误类型
			const nonRetryableErrors = ["unauthorized", "forbidden", "not found", "bad request", "invalid", "malformed"]

			if (nonRetryableErrors.some((err) => errorMessage.includes(err))) {
				return false
			}
		}

		return true
	}

	/**
	 * 使用指数退避进行重试
	 */
	private async retryWithBackoff(data: TaskRunData): Promise<SendResult> {
		const dataKey = this.getDataKey(data)
		const currentAttempts = this.retryAttempts.get(dataKey) || 0

		// 更新重试计数
		this.retryAttempts.set(dataKey, currentAttempts + 1)

		// 计算延迟时间（指数退避）
		const delay = this.RETRY_DELAY_BASE * Math.pow(2, currentAttempts)

		console.log(`TaskSender: 第 ${currentAttempts + 1} 次重试，延迟 ${delay}ms`)

		// 等待延迟
		await new Promise((resolve) => setTimeout(resolve, delay))

		// 递归调用发送方法
		return await this.send(data)
	}

	/**
	 * 生成数据的唯一键
	 */
	private getDataKey(data: TaskRunData): string {
		return `${data.filePath}:${data.taskLine}:${data.timestamp}`
	}

	/**
	 * 获取重试统计信息
	 */
	getRetryStatistics(): {
		activeRetries: number
		totalRetryAttempts: number
		retryDetails: Array<{ key: string; attempts: number }>
	} {
		const retryDetails = Array.from(this.retryAttempts.entries()).map(([key, attempts]) => ({
			key,
			attempts,
		}))

		return {
			activeRetries: this.retryAttempts.size,
			totalRetryAttempts: Array.from(this.retryAttempts.values()).reduce((sum, attempts) => sum + attempts, 0),
			retryDetails,
		}
	}

	/**
	 * 清除重试状态
	 */
	clearRetryState(): void {
		this.retryAttempts.clear()
		console.log("TaskSender: 重试状态已清除")
	}

	/**
	 * 获取当前配置
	 */
	getConfig(): TaskSenderConfig {
		return { ...this.config }
	}
}
