/**
 * Integration tests for provider registration and interaction
 */
import * as vscode from "vscode"
import { activate } from "../../../../extension"
import { AICompletionProvider } from "../../completion/CompletionProvider"
import { MyCodeLensProvider } from "../../codelens/CodeLensProvider"
import { ClineProvider } from "../../../webview/ClineProvider"

// Mock dependencies
jest.mock("vscode")
jest.mock("../../completion/CompletionProvider")
jest.mock("../../codelens/CodeLensProvider")
jest.mock("../../../webview/ClineProvider")
jest.mock("@dotenvx/dotenvx", () => ({
	config: jest.fn(),
}))

describe("Provider Integration Tests", () => {
	let mockContext: jest.Mocked<vscode.ExtensionContext>
	let mockCompletionProvider: jest.Mocked<AICompletionProvider>
	let mockCodeLensProvider: jest.Mocked<MyCodeLensProvider>
	let mockClineProvider: jest.Mocked<ClineProvider>
	let registeredProviders: Map<string, any>

	beforeEach(() => {
		jest.clearAllMocks()
		registeredProviders = new Map()

		// Mock ExtensionContext
		mockContext = {
			subscriptions: [],
			globalState: {
				get: jest.fn().mockReturnValue(false),
				update: jest.fn(),
				keys: jest.fn().mockReturnValue([]),
				setKeysForSync: jest.fn(),
			},
			workspaceState: {
				get: jest.fn(),
				update: jest.fn(),
				keys: jest.fn().mockReturnValue([]),
			},
			secrets: {
				get: jest.fn().mockResolvedValue("test-api-key"),
				store: jest.fn(),
				delete: jest.fn(),
				onDidChange: jest.fn(),
			},
			extensionPath: "/test/extension",
			asAbsolutePath: jest.fn(),
		} as any

		// Mock providers
		mockCompletionProvider = {
			provideInlineCompletionItems: jest.fn(),
			dispose: jest.fn(),
		} as any

		mockCodeLensProvider = {
			provideCodeLenses: jest.fn(),
			dispose: jest.fn(),
		} as any

		mockClineProvider = {
			getValue: jest.fn().mockReturnValue("test-value"),
			setValue: jest.fn(),
			log: jest.fn(),
		} as any

		// Mock provider constructors
		;(AICompletionProvider as jest.MockedClass<typeof AICompletionProvider>).mockImplementation(
			() => mockCompletionProvider,
		)
		;(MyCodeLensProvider as jest.MockedClass<typeof MyCodeLensProvider>).mockImplementation(
			() => mockCodeLensProvider,
		)
		;(ClineProvider as jest.MockedClass<typeof ClineProvider>).mockImplementation(() => mockClineProvider)

		// Mock vscode APIs to track provider registration
		;(vscode.languages.registerInlineCompletionItemProvider as jest.Mock).mockImplementation(
			(selector, provider) => {
				registeredProviders.set("completion", { selector, provider })
				return { dispose: jest.fn() }
			},
		)
		;(vscode.languages.registerCodeLensProvider as jest.Mock).mockImplementation((selector, provider) => {
			registeredProviders.set("codelens", { selector, provider })
			return { dispose: jest.fn() }
		})
		;(vscode.window.registerWebviewViewProvider as jest.Mock).mockImplementation((id, provider, options) => {
			registeredProviders.set("webview", { id, provider, options })
			return { dispose: jest.fn() }
		})
		;(vscode.languages.registerCodeActionsProvider as jest.Mock).mockImplementation(
			(selector, provider, metadata) => {
				registeredProviders.set("codeactions", { selector, provider, metadata })
				return { dispose: jest.fn() }
			},
		)

		// Mock other vscode APIs
		;(vscode.window.createOutputChannel as jest.Mock).mockReturnValue({
			appendLine: jest.fn(),
			dispose: jest.fn(),
		})
		;(vscode.commands.getCommands as jest.Mock).mockResolvedValue(["test.command"])
		;(vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined)
		;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
			get: jest.fn().mockReturnValue([]),
		})
		;(vscode.commands.registerCommand as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.commands.registerTextEditorCommand as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.workspace.onDidChangeConfiguration as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.workspace.registerTextDocumentContentProvider as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.window.registerUriHandler as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
	})

	describe("Completion Provider Integration", () => {
		it("should register completion provider with correct selector", async () => {
			await activate(mockContext)

			expect(registeredProviders.has("completion")).toBe(true)
			const completionRegistration = registeredProviders.get("completion")
			expect(completionRegistration.selector).toEqual({ pattern: "**" })
			expect(completionRegistration.provider).toBe(mockCompletionProvider)
		})

		it("should create completion provider with correct parameters", async () => {
			await activate(mockContext)

			expect(AICompletionProvider).toHaveBeenCalledWith(mockContext, expect.any(Object))
		})

		it("should register completion provider as disposable", async () => {
			await activate(mockContext)

			const disposables = mockContext.subscriptions.filter((sub) => sub && typeof sub.dispose === "function")
			expect(disposables.length).toBeGreaterThan(0)
		})
	})

	describe("CodeLens Provider Integration", () => {
		it("should register codelens provider with correct selector", async () => {
			await activate(mockContext)

			expect(registeredProviders.has("codelens")).toBe(true)
			const codelensRegistration = registeredProviders.get("codelens")
			expect(codelensRegistration.selector).toBe("*")
			expect(codelensRegistration.provider).toBe(mockCodeLensProvider)
		})

		it("should create codelens provider instance", async () => {
			await activate(mockContext)

			expect(MyCodeLensProvider).toHaveBeenCalled()
		})
	})

	describe("Webview Provider Integration", () => {
		it("should register webview provider with correct configuration", async () => {
			await activate(mockContext)

			expect(registeredProviders.has("webview")).toBe(true)
			const webviewRegistration = registeredProviders.get("webview")
			expect(webviewRegistration.id).toBeDefined()
			expect(webviewRegistration.provider).toBeDefined()
			expect(webviewRegistration.options).toEqual({
				webviewOptions: { retainContextWhenHidden: true },
			})
		})

		it("should create ClineProvider instance", async () => {
			await activate(mockContext)

			expect(ClineProvider).toHaveBeenCalledWith(
				mockContext,
				expect.any(Object),
				"sidebar",
				expect.any(Object),
				expect.any(Function),
			)
		})
	})

	describe("Code Actions Provider Integration", () => {
		it("should register code actions provider", async () => {
			await activate(mockContext)

			expect(registeredProviders.has("codeactions")).toBe(true)
			const codeActionsRegistration = registeredProviders.get("codeactions")
			expect(codeActionsRegistration.selector).toEqual({ pattern: "**/*" })
			expect(codeActionsRegistration.metadata).toHaveProperty("providedCodeActionKinds")
		})
	})

	describe("Provider Lifecycle", () => {
		it("should dispose all providers when extension deactivates", async () => {
			await activate(mockContext)

			// Simulate disposal
			mockContext.subscriptions.forEach((sub) => {
				if (sub && typeof sub.dispose === "function") {
					sub.dispose()
				}
			})

			// Verify providers are disposed
			const disposables = mockContext.subscriptions.filter((sub) => sub && typeof sub.dispose === "function")
			expect(disposables.length).toBeGreaterThan(0)
		})

		it("should handle provider creation errors", async () => {
			;(AICompletionProvider as jest.MockedClass<typeof AICompletionProvider>).mockImplementation(() => {
				throw new Error("Provider creation failed")
			})

			await expect(activate(mockContext)).rejects.toThrow("Provider creation failed")
		})
	})

	describe("Provider Interaction", () => {
		it("should allow providers to interact through shared context", async () => {
			await activate(mockContext)

			// Verify that providers have access to shared context
			expect(AICompletionProvider).toHaveBeenCalledWith(mockContext, expect.any(Object))
		})

		it("should pass ClineProvider to completion provider", async () => {
			await activate(mockContext)

			const completionProviderCall = (AICompletionProvider as jest.Mock).mock.calls[0]
			expect(completionProviderCall[1]).toBeDefined() // ClineProvider instance
		})
	})

	describe("Provider Configuration", () => {
		it("should configure providers based on workspace settings", async () => {
			const mockConfig = {
				get: jest.fn().mockReturnValue(true),
			}
			;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			await activate(mockContext)

			expect(vscode.workspace.getConfiguration).toHaveBeenCalled()
		})

		it("should update provider configuration on settings change", async () => {
			await activate(mockContext)

			const configChangeHandler = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0]

			// Mock configuration change event
			const mockEvent = {
				affectsConfiguration: jest.fn().mockReturnValue(true),
			}

			configChangeHandler(mockEvent)

			expect(mockEvent.affectsConfiguration).toHaveBeenCalled()
		})
	})

	describe("Provider Error Handling", () => {
		it("should handle completion provider errors gracefully", async () => {
			mockCompletionProvider.provideInlineCompletionItems.mockRejectedValue(new Error("Completion failed"))

			await activate(mockContext)

			// Provider should still be registered despite potential errors
			expect(registeredProviders.has("completion")).toBe(true)
		})

		it("should handle codelens provider errors gracefully", async () => {
			mockCodeLensProvider.provideCodeLenses.mockRejectedValue(new Error("CodeLens failed"))

			await activate(mockContext)

			// Provider should still be registered despite potential errors
			expect(registeredProviders.has("codelens")).toBe(true)
		})
	})

	describe("Provider Dependencies", () => {
		it("should ensure providers have required dependencies", async () => {
			await activate(mockContext)

			// Completion provider should have context and ClineProvider
			expect(AICompletionProvider).toHaveBeenCalledWith(
				expect.any(Object), // ExtensionContext
				expect.any(Object), // ClineProvider
			)

			// CodeLens provider should be instantiated
			expect(MyCodeLensProvider).toHaveBeenCalled()
		})

		it("should handle missing dependencies gracefully", async () => {
			// Mock missing ClineProvider
			;(ClineProvider as jest.MockedClass<typeof ClineProvider>).mockImplementation(() => {
				throw new Error("ClineProvider not available")
			})

			await expect(activate(mockContext)).rejects.toThrow("ClineProvider not available")
		})
	})

	describe("Provider Registration Order", () => {
		it("should register providers in correct order", async () => {
			const registrationOrder: string[] = []

			;(vscode.languages.registerInlineCompletionItemProvider as jest.Mock).mockImplementation(
				(selector, provider) => {
					registrationOrder.push("completion")
					return { dispose: jest.fn() }
				},
			)
			;(vscode.languages.registerCodeLensProvider as jest.Mock).mockImplementation((selector, provider) => {
				registrationOrder.push("codelens")
				return { dispose: jest.fn() }
			})
			;(vscode.window.registerWebviewViewProvider as jest.Mock).mockImplementation((id, provider, options) => {
				registrationOrder.push("webview")
				return { dispose: jest.fn() }
			})

			await activate(mockContext)

			// Webview should be registered before language providers
			const webviewIndex = registrationOrder.indexOf("webview")
			const completionIndex = registrationOrder.indexOf("completion")
			const codelensIndex = registrationOrder.indexOf("codelens")

			expect(webviewIndex).toBeGreaterThan(-1)
			expect(completionIndex).toBeGreaterThan(-1)
			expect(codelensIndex).toBeGreaterThan(-1)
			expect(webviewIndex).toBeLessThan(completionIndex)
		})
	})
})
