import { renderHook, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { useZgsmUserInfo, imageUrlToBase64 } from "../useZgsmUserInfo"
import type { ProviderSettings } from "@roo-code/types"
import { TelemetryEventName } from "@roo-code/types"
import { telemetryClient } from "@src/utils/TelemetryClient"
import axios from "axios"

// Mock dependencies
vi.mock("@src/utils/TelemetryClient", () => ({
	telemetryClient: {
		capture: vi.fn(),
	},
}))

vi.mock("axios", () => ({
	default: {
		get: vi.fn(),
	},
}))

const mockedAxios = axios as any

// Mock crypto.subtle for Node.js environment
Object.defineProperty(global, "crypto", {
	value: {
		subtle: {
			digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
		},
	},
})

// Mock FileReader
global.FileReader = class {
	result: string | null = null
	onloadend: (() => void) | null = null
	onerror: (() => void) | null = null

	readAsDataURL(_: Blob) {
		setTimeout(() => {
			this.result = "data:image/png;base64,mockbase64data"
			this.onloadend?.()
		}, 0)
	}
} as any

describe("useZgsmUserInfo", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("应该返回初始状态", () => {
		const { result } = renderHook(() => useZgsmUserInfo())

		expect(result.current.userInfo).toBeNull()
		expect(result.current.logoPic).toBe("")
		expect(result.current.hash).toBe("")
		expect(result.current.isAuthenticated).toBe(false)
	})

	it("应该在有token时解析用户信息", async () => {
		// 创建一个有效的JWT token (简化版)
		const mockPayload = {
			id: "user123",
			email: "test@example.com",
			phone: "1234567890",
			organizationName: "Test Org",
			organizationImageUrl: "https://example.com/org.png",
			properties: {
				oauth_GitHub_username: "testuser",
			},
			avatar: "https://example.com/avatar.png",
		}

		const mockToken = `header.${btoa(JSON.stringify(mockPayload))}.signature`

		const apiConfiguration: ProviderSettings = {
			zgsmAccessToken: mockToken,
		}

		const { result } = renderHook(() => useZgsmUserInfo(apiConfiguration))

		await waitFor(() => {
			expect(result.current.userInfo).toEqual({
				id: "user123",
				name: "testuser",
				picture: undefined,
				email: "test@example.com",
				phone: "1234567890",
				organizationName: "Test Org",
				organizationImageUrl: "https://example.com/org.png",
			})
		})

		expect(result.current.isAuthenticated).toBe(true)
	})

	it("应该在token无效时处理错误", () => {
		const apiConfiguration: ProviderSettings = {
			zgsmAccessToken: "invalid-token",
		}

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const { result } = renderHook(() => useZgsmUserInfo(apiConfiguration))

		expect(result.current.userInfo).toBeNull()
		expect(result.current.isAuthenticated).toBe(true) // token存在但无效
		expect(consoleSpy).toHaveBeenCalledWith("Failed to parse JWT token:", expect.any(Error))

		consoleSpy.mockRestore()
	})

	it("应该在登出时发送遥测事件", async () => {
		// 创建一个有效的JWT token，确保能够正确解析
		const mockPayload = {
			id: "user123",
			email: "test@example.com",
		}
		const validToken = `header.${btoa(JSON.stringify(mockPayload))}.signature`

		const apiConfiguration: ProviderSettings = {
			zgsmAccessToken: validToken,
		}

		const { rerender, result } = renderHook(({ config }) => useZgsmUserInfo(config), {
			initialProps: { config: apiConfiguration },
		})

		// 等待初始认证状态设置完成
		await waitFor(() => {
			expect(result.current.isAuthenticated).toBe(true)
		})

		// 模拟登出 - 移除token
		rerender({ config: {} as ProviderSettings })

		expect(telemetryClient.capture).toHaveBeenCalledWith(TelemetryEventName.ACCOUNT_LOGOUT_SUCCESS)
	})
})

describe("imageUrlToBase64", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("应该成功将图片URL转换为base64", async () => {
		const mockBlob = new Blob(["mock image data"], { type: "image/png" })
		vi.mocked(mockedAxios.get).mockResolvedValue({ data: mockBlob })

		const result = await imageUrlToBase64("https://example.com/image.png")

		expect(result).toBe("data:image/png;base64,mockbase64data")
		expect(mockedAxios.get).toHaveBeenCalledWith("https://example.com/image.png", {
			responseType: "blob",
		})
	})

	it("应该在请求失败时返回null", async () => {
		vi.mocked(mockedAxios.get).mockRejectedValue(new Error("Network error"))
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const result = await imageUrlToBase64("https://example.com/image.png")

		expect(result).toBeNull()
		expect(consoleSpy).toHaveBeenCalledWith("Failed to convert image to base64", expect.any(Error))

		consoleSpy.mockRestore()
	})
})
