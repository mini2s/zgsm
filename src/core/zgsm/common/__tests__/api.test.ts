/**
 * Unit tests for API utilities
 */
import { createAuthenticatedHeaders, getLanguageExtensions, getExtensionsLatestVersion } from "../api"
import axios from "axios"
import { envSetting, envClient } from "../env"

// Mock dependencies
jest.mock("axios")
jest.mock("../env", () => ({
	envSetting: {
		baseUrl: "https://test-api.com",
	},
	envClient: {
		ide: "vscode",
		extVersion: "1.0.0",
		ideVersion: "1.70.0",
		hostIp: "192.168.1.100",
		apiKey: "test-api-key",
	},
}))

describe("API Utilities", () => {
	const mockAxios = axios as jest.Mocked<typeof axios>

	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe("createAuthenticatedHeaders", () => {
		it("should create headers with client information", () => {
			const headers = createAuthenticatedHeaders()

			expect(headers).toEqual({
				ide: "vscode",
				"ide-version": "1.0.0",
				"ide-real-version": "1.70.0",
				"host-ip": "192.168.1.100",
				"api-key": "test-api-key",
			})
		})

		it("should merge additional headers", () => {
			const additionalHeaders = {
				"Content-Type": "application/json",
				"Custom-Header": "custom-value",
			}

			const headers = createAuthenticatedHeaders(additionalHeaders)

			expect(headers).toEqual({
				ide: "vscode",
				"ide-version": "1.0.0",
				"ide-real-version": "1.70.0",
				"host-ip": "192.168.1.100",
				"api-key": "test-api-key",
				"Content-Type": "application/json",
				"Custom-Header": "custom-value",
			})
		})

		it("should allow overriding default headers", () => {
			const overrideHeaders = {
				ide: "custom-ide",
				"api-key": "custom-key",
			}

			const headers = createAuthenticatedHeaders(overrideHeaders)

			expect(headers.ide).toBe("custom-ide")
			expect(headers["api-key"]).toBe("custom-key")
		})
	})

	describe("getLanguageExtensions", () => {
		const expectedUrl = "https://test-api.com/api/configuration?belong_type=language&attribute_key=language_map"

		it("should fetch language extensions successfully", async () => {
			const mockResponse = {
				status: 200,
				data: {
					data: [
						{ language: "javascript", extensions: [".js", ".jsx"] },
						{ language: "typescript", extensions: [".ts", ".tsx"] },
					],
				},
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getLanguageExtensions()

			expect(mockAxios.get).toHaveBeenCalledWith(expectedUrl, {
				headers: expect.objectContaining({
					"Content-Type": "application/json",
					ide: "vscode",
					"api-key": "test-api-key",
				}),
			})
			expect(result).toEqual(mockResponse.data)
		})

		it("should return undefined for non-200 status", async () => {
			const mockResponse = {
				status: 404,
				data: { error: "Not found" },
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getLanguageExtensions()

			expect(result).toBeUndefined()
		})

		it("should return undefined when data is not an array", async () => {
			const mockResponse = {
				status: 200,
				data: {
					data: "not an array",
				},
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getLanguageExtensions()

			expect(result).toBeUndefined()
		})

		it("should handle network errors", async () => {
			const mockError = new Error("Network error")
			mockAxios.get.mockRejectedValue(mockError)

			const result = await getLanguageExtensions()

			expect(result).toBeUndefined()
		})

		it("should handle missing data property", async () => {
			const mockResponse = {
				status: 200,
				data: {},
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getLanguageExtensions()

			expect(result).toBeUndefined()
		})
	})

	describe("getExtensionsLatestVersion", () => {
		const expectedUrl = "https://test-api.com/vscode/ex-server-api/zgsm-ai/zgsm/latest"

		it("should fetch latest version successfully", async () => {
			const mockResponse = {
				status: 200,
				data: {
					version: "1.2.0",
					releaseDate: "2023-07-04",
					changelog: "Bug fixes and improvements",
				},
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getExtensionsLatestVersion()

			expect(mockAxios.get).toHaveBeenCalledWith(expectedUrl, {
				headers: expect.objectContaining({
					"Content-Type": "application/json",
					ide: "vscode",
					"api-key": "test-api-key",
				}),
			})
			expect(result).toEqual(mockResponse.data)
		})

		it("should return undefined for non-200 status", async () => {
			const mockResponse = {
				status: 500,
				data: { error: "Internal server error" },
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getExtensionsLatestVersion()

			expect(result).toBeUndefined()
		})

		it("should return undefined when version is missing", async () => {
			const mockResponse = {
				status: 200,
				data: {
					releaseDate: "2023-07-04",
				},
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getExtensionsLatestVersion()

			expect(result).toBeUndefined()
		})

		it("should handle network errors", async () => {
			const mockError = new Error("Connection timeout")
			mockAxios.get.mockRejectedValue(mockError)

			const result = await getExtensionsLatestVersion()

			expect(result).toBeUndefined()
		})

		it("should handle empty version string", async () => {
			const mockResponse = {
				status: 200,
				data: {
					version: "",
				},
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getExtensionsLatestVersion()

			expect(result).toBeUndefined()
		})

		it("should handle null version", async () => {
			const mockResponse = {
				status: 200,
				data: {
					version: null,
				},
			}
			mockAxios.get.mockResolvedValue(mockResponse)

			const result = await getExtensionsLatestVersion()

			expect(result).toBeUndefined()
		})
	})

	describe("error handling", () => {
		it("should handle axios request errors gracefully", async () => {
			const mockError = {
				response: {
					status: 401,
					data: { message: "Unauthorized" },
				},
				message: "Request failed with status code 401",
			}
			mockAxios.get.mockRejectedValue(mockError)

			const result1 = await getLanguageExtensions()
			const result2 = await getExtensionsLatestVersion()

			expect(result1).toBeUndefined()
			expect(result2).toBeUndefined()
		})

		it("should handle network timeout errors", async () => {
			const mockError = {
				code: "ECONNABORTED",
				message: "timeout of 5000ms exceeded",
			}
			mockAxios.get.mockRejectedValue(mockError)

			const result1 = await getLanguageExtensions()
			const result2 = await getExtensionsLatestVersion()

			expect(result1).toBeUndefined()
			expect(result2).toBeUndefined()
		})
	})

	describe("request configuration", () => {
		it("should use correct URL for language extensions", async () => {
			mockAxios.get.mockResolvedValue({ status: 200, data: { data: [] } })

			await getLanguageExtensions()

			expect(mockAxios.get).toHaveBeenCalledWith(
				"https://test-api.com/api/configuration?belong_type=language&attribute_key=language_map",
				expect.any(Object),
			)
		})

		it("should use correct URL for latest version", async () => {
			mockAxios.get.mockResolvedValue({ status: 200, data: { version: "1.0.0" } })

			await getExtensionsLatestVersion()

			expect(mockAxios.get).toHaveBeenCalledWith(
				"https://test-api.com/vscode/ex-server-api/zgsm-ai/zgsm/latest",
				expect.any(Object),
			)
		})

		it("should include authentication headers in all requests", async () => {
			mockAxios.get.mockResolvedValue({ status: 200, data: { data: [], version: "1.0.0" } })

			await getLanguageExtensions()
			await getExtensionsLatestVersion()

			expect(mockAxios.get).toHaveBeenCalledTimes(2)
			mockAxios.get.mock.calls.forEach((call) => {
				expect(call[1]?.headers).toMatchObject({
					"Content-Type": "application/json",
					ide: "vscode",
					"ide-version": "1.0.0",
					"ide-real-version": "1.70.0",
					"host-ip": "192.168.1.100",
					"api-key": "test-api-key",
				})
			})
		})
	})
})
