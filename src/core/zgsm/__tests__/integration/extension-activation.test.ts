/**
 * Integration tests for ZGSM extension activation
 */
import * as vscode from "vscode"
import { activate, deactivate } from "../../../../extension"
import { ClineProvider } from "../../../webview/ClineProvider"
import { AICompletionProvider } from "../../completion/CompletionProvider"
import { MyCodeLensProvider } from "../../codelens/CodeLensProvider"
import { CompletionStatusBar } from "../../completion/completionStatusBar"

// Mock vscode and dependencies
jest.mock("vscode")
jest.mock("../../webview/ClineProvider")
jest.mock("../completion/CompletionProvider")
jest.mock("../codelens/CodeLensProvider")
jest.mock("../completion/completionStatusBar")
jest.mock("@dotenvx/dotenvx", () => ({
	config: jest.fn(),
}))

describe("Extension Activation Integration Tests", () => {
	let mockContext: jest.Mocked<vscode.ExtensionContext>
	let mockOutputChannel: jest.Mocked<vscode.OutputChannel>
	let mockProvider: jest.Mocked<ClineProvider>

	beforeEach(() => {
		jest.clearAllMocks()

		// Mock ExtensionContext
		mockContext = {
			subscriptions: [],
			globalState: {
				get: jest.fn().mockReturnValue(false) as any,
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
				get: jest.fn().mockResolvedValue("test-api-key") as any,
				store: jest.fn(),
				delete: jest.fn(),
				onDidChange: jest.fn(),
			},
			extensionUri: { scheme: "file", path: "/test/extension" } as any,
			extensionPath: "/test/extension",
			environmentVariableCollection: {} as any,
			asAbsolutePath: jest.fn(),
			storageUri: undefined,
			storagePath: undefined,
			globalStorageUri: { scheme: "file", path: "/test/global" } as any,
			globalStoragePath: "/test/global",
			logUri: { scheme: "file", path: "/test/logs" } as any,
			logPath: "/test/logs",
			extensionMode: 1,
			extension: {} as any,
		} as any

		// Mock OutputChannel
		mockOutputChannel = {
			appendLine: jest.fn(),
			append: jest.fn(),
			replace: jest.fn(),
			clear: jest.fn(),
			dispose: jest.fn(),
			hide: jest.fn(),
			show: jest.fn(),
			name: "Test Channel",
		}

		// Mock ClineProvider
		mockProvider = {
			getValue: jest.fn().mockReturnValue("test-value"),
			setValue: jest.fn(),
			log: jest.fn(),
		} as any

		// Mock vscode APIs
		;(vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel)
		;(vscode.commands.getCommands as jest.Mock).mockResolvedValue(["test.command"])
		;(vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined)
		;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
			get: jest.fn().mockReturnValue([]),
		})
		;(vscode.window.registerWebviewViewProvider as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.languages.registerInlineCompletionItemProvider as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.languages.registerCodeLensProvider as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
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
		;(vscode.languages.registerCodeActionsProvider as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.workspace.createFileSystemWatcher as jest.Mock).mockReturnValue({
			onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
			dispose: jest.fn(),
		})

		// Mock CompletionStatusBar
		;(CompletionStatusBar.create as jest.Mock).mockImplementation(() => {})
		;(CompletionStatusBar.initByConfig as jest.Mock).mockImplementation(() => {})
		;(CompletionStatusBar.fail as jest.Mock).mockImplementation(() => {})
	})

	describe("Extension Activation", () => {
		it("should activate extension successfully", async () => {
			const api = await activate(mockContext)

			expect(api).toBeDefined()
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("extension activated"))
		})

		it("should handle reload on upgrade", async () => {
			;(mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
				if (key === "hasReloadedOnUpgrade") return false
				return undefined
			})
			;(vscode.commands.getCommands as jest.Mock).mockResolvedValue([])

			await activate(mockContext)

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow")
			expect(mockContext.globalState.update).toHaveBeenCalledWith("hasReloadedOnUpgrade", true)
		})

		it("should skip reload when already reloaded", async () => {
			;(mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
				if (key === "hasReloadedOnUpgrade") return true
				return undefined
			})
			;(vscode.commands.getCommands as jest.Mock).mockResolvedValue([])

			await activate(mockContext)

			expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith("workbench.action.reloadWindow")
		})

		it("should create output channel", async () => {
			await activate(mockContext)

			expect(vscode.window.createOutputChannel).toHaveBeenCalled()
			expect(mockContext.subscriptions).toContain(mockOutputChannel)
		})

		it("should initialize terminal registry", async () => {
			await activate(mockContext)

			// Terminal registry should be initialized
			expect(mockContext.subscriptions.length).toBeGreaterThan(0)
		})

		it("should register webview provider", async () => {
			await activate(mockContext)

			expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(Object),
				expect.objectContaining({
					webviewOptions: { retainContextWhenHidden: true },
				}),
			)
		})

		it("should register completion provider", async () => {
			await activate(mockContext)

			expect(vscode.languages.registerInlineCompletionItemProvider).toHaveBeenCalledWith(
				{ pattern: "**" },
				expect.any(AICompletionProvider),
			)
		})

		it("should register codelens provider", async () => {
			await activate(mockContext)

			expect(vscode.languages.registerCodeLensProvider).toHaveBeenCalledWith("*", expect.any(MyCodeLensProvider))
		})

		it("should register commands", async () => {
			await activate(mockContext)

			expect(vscode.commands.registerCommand).toHaveBeenCalled()
			expect(vscode.commands.registerTextEditorCommand).toHaveBeenCalled()
		})

		it("should register configuration change listener", async () => {
			await activate(mockContext)

			expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled()
		})

		it("should register diff content provider", async () => {
			await activate(mockContext)

			expect(vscode.workspace.registerTextDocumentContentProvider).toHaveBeenCalled()
		})

		it("should register URI handler", async () => {
			await activate(mockContext)

			expect(vscode.window.registerUriHandler).toHaveBeenCalled()
		})

		it("should register code actions provider", async () => {
			await activate(mockContext)

			expect(vscode.languages.registerCodeActionsProvider).toHaveBeenCalledWith(
				{ pattern: "**/*" },
				expect.any(Object),
				expect.objectContaining({
					providedCodeActionKinds: expect.any(Array),
				}),
			)
		})

		it("should execute activation completed command", async () => {
			await activate(mockContext)

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(expect.stringContaining("activationCompleted"))
		})

		it("should handle development mode file watching", async () => {
			process.env.NODE_ENV = "development"

			await activate(mockContext)

			expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled()

			delete process.env.NODE_ENV
		})

		it("should initialize completion status bar", async () => {
			await activate(mockContext)

			expect(CompletionStatusBar.create).toHaveBeenCalledWith(mockContext)
		})

		it("should handle missing API key", async () => {
			;(mockContext.secrets.get as jest.Mock).mockResolvedValue(null)

			await activate(mockContext)

			expect(CompletionStatusBar.fail).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.any(String),
				}),
			)
		})

		it("should handle valid API key", async () => {
			;(mockContext.secrets.get as jest.Mock).mockResolvedValue("valid-api-key")

			await activate(mockContext)

			expect(CompletionStatusBar.initByConfig).toHaveBeenCalled()
		})
	})

	describe("Extension Deactivation", () => {
		it("should deactivate extension successfully", async () => {
			await deactivate()

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("extension deactivated"))
		})

		it("should cleanup resources on deactivation", async () => {
			// First activate to set up resources
			await activate(mockContext)

			// Then deactivate
			await deactivate()

			// Should perform cleanup
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining("deactivated"))
		})
	})

	describe("Command Registration", () => {
		it("should register all required commands", async () => {
			await activate(mockContext)

			const commandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls
			const textEditorCommandCalls = (vscode.commands.registerTextEditorCommand as jest.Mock).mock.calls

			// Should register multiple commands
			expect(commandCalls.length + textEditorCommandCalls.length).toBeGreaterThan(0)

			// Check for specific command patterns
			const allCommands = [
				...commandCalls.map((call) => call[0]),
				...textEditorCommandCalls.map((call) => call[0]),
			]

			expect(allCommands.some((cmd) => cmd.includes("chat"))).toBe(true)
			expect(allCommands.some((cmd) => cmd.includes("codelens"))).toBe(true)
		})

		it("should register commands with proper callbacks", async () => {
			await activate(mockContext)

			const commandCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls

			commandCalls.forEach((call) => {
				expect(call[0]).toBeTruthy() // Command name
				expect(typeof call[1]).toBe("function") // Callback function
			})
		})
	})

	describe("Provider Registration", () => {
		it("should register all language providers", async () => {
			await activate(mockContext)

			expect(vscode.languages.registerInlineCompletionItemProvider).toHaveBeenCalled()
			expect(vscode.languages.registerCodeLensProvider).toHaveBeenCalled()
			expect(vscode.languages.registerCodeActionsProvider).toHaveBeenCalled()
		})

		it("should register providers with correct selectors", async () => {
			await activate(mockContext)

			const completionCall = (vscode.languages.registerInlineCompletionItemProvider as jest.Mock).mock.calls[0]
			const codelensCall = (vscode.languages.registerCodeLensProvider as jest.Mock).mock.calls[0]
			const codeActionsCall = (vscode.languages.registerCodeActionsProvider as jest.Mock).mock.calls[0]

			expect(completionCall[0]).toEqual({ pattern: "**" })
			expect(codelensCall[0]).toBe("*")
			expect(codeActionsCall[0]).toEqual({ pattern: "**/*" })
		})
	})

	describe("Configuration Handling", () => {
		it("should handle configuration changes", async () => {
			await activate(mockContext)

			const configChangeHandler = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0]

			// Mock configuration change event
			const mockEvent = {
				affectsConfiguration: jest.fn().mockReturnValue(true),
			}

			configChangeHandler(mockEvent)

			expect(mockEvent.affectsConfiguration).toHaveBeenCalled()
		})

		it("should initialize default configuration", async () => {
			const mockConfig = {
				get: jest.fn().mockReturnValue(["default-command"]),
			}
			;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			await activate(mockContext)

			expect(mockContext.globalState.update).toHaveBeenCalledWith("allowedCommands", ["default-command"])
		})
	})

	describe("Error Handling", () => {
		it("should handle activation errors gracefully", async () => {
			// Mock an error during provider creation
			;(vscode.window.registerWebviewViewProvider as jest.Mock).mockImplementation(() => {
				throw new Error("Provider registration failed")
			})

			await expect(activate(mockContext)).rejects.toThrow("Provider registration failed")
		})

		it("should handle missing commands gracefully", async () => {
			;(vscode.commands.getCommands as jest.Mock).mockResolvedValue([])

			await activate(mockContext)

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.reloadWindow")
		})
	})
})
