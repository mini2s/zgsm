/**
 * Unit tests for AICompletionProvider class
 */
import {
	CancellationToken,
	ExtensionContext,
	InlineCompletionContext,
	Position,
	TextDocument,
	workspace,
	Range,
} from "vscode"
import { AICompletionProvider } from "../CompletionProvider"
import { CompletionCache } from "../completionCache"
import { CompletionClient } from "../CompletionClient"
import { CompletionPoint } from "../completionPoint"
import { CompletionStatusBar } from "../completionStatusBar"
import { CompletionTrace } from "../completionTrace"
import { ClineProvider } from "../../../webview/ClineProvider"

// Mock dependencies
jest.mock("../CompletionClient")
jest.mock("../completionCache")
jest.mock("../completionStatusBar")
jest.mock("../completionTrace")
jest.mock("../../../webview/ClineProvider")
jest.mock("vscode")

describe("AICompletionProvider", () => {
	let provider: AICompletionProvider
	let mockContext: jest.Mocked<ExtensionContext>
	let mockClineProvider: jest.Mocked<ClineProvider>
	let mockDocument: jest.Mocked<TextDocument>
	let mockToken: jest.Mocked<CancellationToken>

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks()

		// Mock ExtensionContext
		mockContext = {
			workspaceState: {
				get: jest.fn(),
				update: jest.fn(),
			},
		} as any

		// Mock ClineProvider
		mockClineProvider = {
			contextProxy: {},
			hasView: true,
			getState: jest.fn().mockResolvedValue({
				apiConfiguration: {
					zgsmApiKey: "test-key",
					zgsmBaseUrl: "https://test.com",
				},
			}),
		} as any

		// Mock TextDocument
		mockDocument = {
			uri: { fsPath: "/test/file.ts" },
			getText: jest.fn(),
			lineAt: jest.fn(),
			lineCount: 10,
		} as any

		// Mock CancellationToken
		mockToken = {
			isCancellationRequested: false,
			onCancellationRequested: jest.fn(),
		} as any

		// Mock workspace configuration
		const mockWorkspaceConfig = {
			get: jest.fn().mockReturnValue(true),
		}
		;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockWorkspaceConfig)

		// Initialize provider
		provider = new AICompletionProvider(mockContext, mockClineProvider)
	})

	afterEach(() => {
		provider.dispose()
	})

	describe("constructor", () => {
		it("should initialize provider with context and ClineProvider", () => {
			expect(provider).toBeInstanceOf(AICompletionProvider)
			expect(CompletionClient.setProvider).toHaveBeenCalledWith(mockClineProvider)
			expect(CompletionTrace.init).toHaveBeenCalledWith(mockContext)
		})
	})

	describe("provideInlineCompletionItems", () => {
		const mockPosition = new Position(5, 10)
		const mockInlineContext: InlineCompletionContext = { triggerKind: 0 } as any

		beforeEach(() => {
			// Mock document methods
			mockDocument.getText.mockImplementation((range?: Range) => {
				if (!range) return "full document text"
				return "prefix text"
			})
			mockDocument.lineAt.mockReturnValue({
				text: "const test = ",
				range: { end: new Position(5, 13) },
			} as any)

			// Mock CompletionCache
			;(CompletionCache.getLatest as jest.Mock).mockReturnValue(null)
			;(CompletionCache.cache as jest.Mock).mockImplementation((cp) => cp)
		})

		it("should return empty array when completion is disabled", async () => {
			// Mock extension context workspace state to disable completion
			;(mockContext.workspaceState.get as jest.Mock).mockReturnValue(false)

			// Mock LangSetting to disable completion
			jest.doMock("../common/lang-util", () => ({
				LangSetting: {
					completionEnabled: false,
					getCompletionDisable: jest.fn().mockReturnValue("disabled"),
				},
				getLanguageByFilePath: jest.fn().mockReturnValue("typescript"),
			}))

			const result = await provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockInlineContext,
				mockToken,
			)

			expect(result).toEqual([])
		})

		it("should return empty array when position is at start of document", async () => {
			const startPosition = new Position(0, 0)

			const result = await provider.provideInlineCompletionItems(
				mockDocument,
				startPosition,
				mockInlineContext,
				mockToken,
			)

			expect(result).toEqual([])
		})

		it("should handle manual trigger mode", async () => {
			;(mockContext.workspaceState.get as jest.Mock).mockReturnValue(true)

			// Mock successful completion
			const mockCompletionPoint = {
				id: "test-id",
				getContent: jest.fn().mockReturnValue("completion text"),
				pos: mockPosition,
			}
			;(CompletionCache.cache as jest.Mock).mockReturnValue(mockCompletionPoint)
			;(CompletionClient.callApi as jest.Mock).mockResolvedValue("completion text")

			const result = await provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockInlineContext,
				mockToken,
			)

			expect(mockContext.workspaceState.update).toHaveBeenCalledWith("shortCutKeys", false)
		})

		it("should return cached completion when available", async () => {
			const mockCachedPoint = {
				id: "cached-id",
				getContent: jest.fn().mockReturnValue("cached completion"),
				pos: mockPosition,
				isSamePosition: jest.fn().mockReturnValue(true),
			}
			;(CompletionCache.getLatest as jest.Mock).mockReturnValue(mockCachedPoint)

			// Mock the completion decision to return cached mode
			jest.spyOn(provider as any, "completionDecision").mockReturnValue({
				mode: "Cached",
			})

			const result = await provider.provideInlineCompletionItems(
				mockDocument,
				mockPosition,
				mockInlineContext,
				mockToken,
			)

			// Should return inline completion items
			expect(Array.isArray(result)).toBe(true)
		})
	})

	describe("dispose", () => {
		it("should dispose all disposables", () => {
			const mockDisposable = { dispose: jest.fn() }
			;(provider as any).disposables = [mockDisposable]

			provider.dispose()

			expect(mockDisposable.dispose).toHaveBeenCalled()
		})
	})

	describe("private methods", () => {
		describe("enableCompletion", () => {
			it("should return false when completion is globally disabled", () => {
				jest.doMock("../common/lang-util", () => ({
					LangSetting: {
						completionEnabled: false,
					},
				}))

				const result = (provider as any).enableCompletion("auto", { language: "typescript" })
				expect(result).toBe(false)
			})

			it("should return true for manual trigger even when language is disabled", () => {
				jest.doMock("../common/lang-util", () => ({
					LangSetting: {
						completionEnabled: true,
						getCompletionDisable: jest.fn().mockReturnValue("Disabled"),
					},
				}))

				const result = (provider as any).enableCompletion("manual", { language: "typescript" })
				expect(result).toBe(true)
			})
		})

		describe("needCompletion", () => {
			it("should return false for position at start of document", () => {
				const result = (provider as any).needCompletion(new Position(0, 0))
				expect(result).toBe(false)
			})

			it("should return true for valid positions", () => {
				const result = (provider as any).needCompletion(new Position(1, 5))
				expect(result).toBe(true)
			})
		})

		describe("getPrompt", () => {
			it("should extract correct prompt information from document", () => {
				const position = new Position(2, 5)
				mockDocument.getText.mockImplementation((range?: Range) => {
					if (range && range.start.line === 0 && range.start.character === 0) {
						return "line1\nline2\nline3"
					}
					return "remaining text"
				})
				mockDocument.lineAt.mockReturnValue({
					text: "const test = value",
				} as any)

				const result = (provider as any).getPrompt(mockDocument, position)

				expect(result).toHaveProperty("prefix")
				expect(result).toHaveProperty("suffix")
				expect(result).toHaveProperty("cursor_line_prefix")
				expect(result).toHaveProperty("cursor_line_suffix")
			})
		})
	})
})
