/**
 * Unit tests for CompletionClient class
 */
import { CompletionClient } from "../CompletionClient"
import { CompletionPoint } from "../completionPoint"
import { CompletionTrace } from "../completionTrace"
import { ClineProvider } from "../../../webview/ClineProvider"
import { workspace } from "vscode"
import OpenAI from "openai"

// Mock dependencies
jest.mock("openai")
jest.mock("../completionTrace")
jest.mock("../../../webview/ClineProvider")
jest.mock("vscode")
jest.mock("../../../zgsmAuth/config", () => ({
	defaultZgsmAuthConfig: {
		baseUrl: "https://default.com",
		completionUrl: "/completion",
	},
}))

describe("CompletionClient", () => {
	let mockClineProvider: jest.Mocked<ClineProvider>
	let mockCompletionPoint: jest.Mocked<CompletionPoint>
	let mockOpenAI: jest.Mocked<OpenAI>
	let mockCreateCompletion: jest.Mock

	beforeEach(() => {
		jest.clearAllMocks()

		// Mock ClineProvider
		mockClineProvider = {
			contextProxy: {
				getOriginSecrets: jest.fn().mockResolvedValue("test-api-key"),
				getGlobalState: jest.fn().mockResolvedValue("https://test.com"),
			},
			hasView: true,
			getState: jest.fn().mockResolvedValue({
				apiConfiguration: {
					zgsmApiKey: "test-key",
					zgsmBaseUrl: "https://test.com",
					zgsmCompletionUrl: "/completion",
				},
			}),
			setValue: jest.fn(),
			postMessageToWebview: jest.fn(),
			getStateToPostToWebview: jest.fn().mockResolvedValue({}),
		} as any

		// Mock CompletionPoint
		mockCompletionPoint = {
			id: "test-completion-id",
			doc: { language: "typescript" },
			pos: { line: 5, character: 10 },
			getPrompt: jest.fn().mockReturnValue({
				prefix: "const test = ",
				suffix: "\nrest of code",
				cursor_line_prefix: "const test = ",
				cursor_line_suffix: "",
			}),
			getContent: jest.fn().mockReturnValue(""),
			fetched: jest.fn(),
			cancel: jest.fn(),
			parentId: undefined,
		} as any

		// Mock OpenAI
		mockCreateCompletion = jest.fn()
		mockOpenAI = {
			completions: {
				create: mockCreateCompletion,
			},
		} as any
		;(OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI)

		// Mock workspace
		const mockWorkspaceConfig = {
			get: jest.fn().mockReturnValue(["\n", "\r"]),
		}
		;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockWorkspaceConfig)
		;(workspace as any).name = "test-workspace"
		;(workspace as any).workspaceFolders = [
			{
				uri: { fsPath: "/test/workspace" },
			},
		]
	})

	describe("setProvider", () => {
		it("should set provider and update API key validity", async () => {
			await CompletionClient.setProvider(mockClineProvider)

			expect(mockClineProvider.setValue).toHaveBeenCalledWith("isZgsmApiKeyValid", true)
			expect(mockClineProvider.postMessageToWebview).toHaveBeenCalled()
		})
	})

	describe("getProvider", () => {
		it("should return the current provider", async () => {
			await CompletionClient.setProvider(mockClineProvider)
			const provider = CompletionClient.getProvider()

			expect(provider).toBe(mockClineProvider)
		})
	})

	describe("callApi", () => {
		beforeEach(async () => {
			await CompletionClient.setProvider(mockClineProvider)
		})

		it("should successfully call API and return completion text", async () => {
			const mockResponse = {
				id: "completion-response-id",
				choices: [
					{
						text: "  completion text  ",
					},
				],
			}
			mockCreateCompletion.mockResolvedValue(mockResponse)

			const result = await CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)

			expect(mockOpenAI.completions.create).toHaveBeenCalled()
			expect(mockCompletionPoint.fetched).toHaveBeenCalledWith("completion text")
			expect(CompletionTrace.reportApiOk).toHaveBeenCalled()
			expect(result).toBe("")
		})

		it("should handle API errors and update key validity", async () => {
			const mockError = {
				response: { status: 401 },
				status: 401,
			}
			mockCreateCompletion.mockRejectedValue(mockError)

			await expect(CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)).rejects.toThrow()

			expect(mockClineProvider.setValue).toHaveBeenCalledWith("isZgsmApiKeyValid", false)
			expect(CompletionTrace.reportApiError).toHaveBeenCalledWith("401")
		})

		it("should handle cancellation errors", async () => {
			const mockError = new Error("Request cancelled")
			mockError.name = "AbortError"
			mockCreateCompletion.mockRejectedValue(mockError)

			await expect(CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)).rejects.toThrow()

			expect(mockCompletionPoint.cancel).toHaveBeenCalled()
			expect(CompletionTrace.reportApiCancel).toHaveBeenCalled()
		})

		it("should throw error when client is not initialized", async () => {
			// Mock provider without API key
			const mockProviderWithoutKey = {
				...mockClineProvider,
				getState: jest.fn().mockResolvedValue({
					apiConfiguration: {},
				}),
			} as any
			await CompletionClient.setProvider(mockProviderWithoutKey)

			await expect(CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)).rejects.toThrow()
		})

		it("should handle empty response", async () => {
			const mockResponse = {
				id: "completion-response-id",
				choices: [],
			}
			mockCreateCompletion.mockResolvedValue(mockResponse)

			const result = await CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)

			expect(mockCompletionPoint.fetched).toHaveBeenCalledWith("")
		})

		it("should clean up garbled characters in response", async () => {
			const mockResponse = {
				id: "completion-response-id",
				choices: [
					{
						text: "completion text with � garbled characters �",
					},
				],
			}
			mockCreateCompletion.mockResolvedValue(mockResponse)

			await CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)

			expect(mockCompletionPoint.fetched).toHaveBeenCalledWith("completion text with  garbled characters")
		})
	})

	describe("cancelApi", () => {
		it("should cancel ongoing request", async () => {
			await CompletionClient.setProvider(mockClineProvider)

			// Mock an ongoing request
			const mockAbortController = {
				abort: jest.fn(),
				signal: {},
			}
			global.AbortController = jest.fn(() => mockAbortController) as any

			// Start a request to set up the internal request tracking
			const apiPromise = CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)

			// Cancel the request
			await CompletionClient.cancelApi(mockCompletionPoint)

			// The request should be cancelled
			expect(mockAbortController.abort).toHaveBeenCalled()
		})
	})

	describe("API configuration handling", () => {
		it("should use context configuration when hasView is false", async () => {
			const mockProviderNoView = {
				...mockClineProvider,
				hasView: false,
			} as any
			await CompletionClient.setProvider(mockProviderNoView)

			const mockResponse = {
				id: "test-id",
				choices: [{ text: "test completion" }],
			}
			mockCreateCompletion.mockResolvedValue(mockResponse)

			await CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)

			expect(mockClineProvider.contextProxy.getOriginSecrets).toHaveBeenCalled()
			expect(mockClineProvider.contextProxy.getGlobalState).toHaveBeenCalled()
		})

		it("should use default configuration when context values are not available", async () => {
			const mockProviderNoView = {
				...mockClineProvider,
				hasView: false,
				contextProxy: {
					getOriginSecrets: jest.fn().mockResolvedValue(null),
					getGlobalState: jest.fn().mockResolvedValue(null),
				},
			} as any
			await CompletionClient.setProvider(mockProviderNoView)

			const mockResponse = {
				id: "test-id",
				choices: [{ text: "test completion" }],
			}
			mockCreateCompletion.mockResolvedValue(mockResponse)

			await CompletionClient.callApi(mockCompletionPoint, {} as any, undefined)

			expect(mockOpenAI.baseURL).toContain("https://default.com")
		})
	})
})
