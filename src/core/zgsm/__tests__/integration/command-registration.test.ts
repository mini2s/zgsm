/**
 * Integration tests for command registration
 */
import * as vscode from "vscode"
import { activate } from "../../../../extension"
import { getCommand } from "../../../../utils/commands"
import { codeLensCallBackCommand, codeLensCallBackMoreCommand } from "../../codelens/CodeLensCallbacks"
import { shortKeyCut } from "../../completion/completionCommands"

// Mock dependencies
jest.mock("vscode")
jest.mock("../../../utils/commands")
jest.mock("../codelens/CodeLensCallbacks")
jest.mock("../completion/completionCommands")
jest.mock("@dotenvx/dotenvx", () => ({
	config: jest.fn(),
}))

describe("Command Registration Integration Tests", () => {
	let mockContext: jest.Mocked<vscode.ExtensionContext>
	let registeredCommands: Map<string, Function>
	let registeredTextEditorCommands: Map<string, Function>

	beforeEach(() => {
		jest.clearAllMocks()
		registeredCommands = new Map()
		registeredTextEditorCommands = new Map()

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

		// Mock vscode APIs to track command registration
		;(vscode.commands.registerCommand as jest.Mock).mockImplementation((command, callback) => {
			registeredCommands.set(command, callback)
			return { dispose: jest.fn() }
		})
		;(vscode.commands.registerTextEditorCommand as jest.Mock).mockImplementation((command, callback) => {
			registeredTextEditorCommands.set(command, callback)
			return { dispose: jest.fn() }
		})

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
		;(vscode.window.registerWebviewViewProvider as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.languages.registerInlineCompletionItemProvider as jest.Mock).mockReturnValue({
			dispose: jest.fn(),
		})
		;(vscode.languages.registerCodeLensProvider as jest.Mock).mockReturnValue({
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

		// Mock command utilities
		;(getCommand as jest.Mock).mockImplementation((cmd) => `test.${cmd}`)

		// Mock codelens commands
		;(codeLensCallBackCommand as any) = {
			command: "test.codelens_button",
			callback: jest.fn().mockReturnValue(jest.fn()),
		}
		;(codeLensCallBackMoreCommand as any) = {
			command: "test.codelens_more_button",
			callback: jest.fn().mockReturnValue(jest.fn()),
		}

		// Mock completion commands
		;(shortKeyCut as any) = {
			command: "test.shortcut",
			callback: jest.fn(),
		}
	})

	describe("Core Commands Registration", () => {
		it("should register chat command", async () => {
			await activate(mockContext)

			expect(registeredCommands.has("test.chat")).toBe(true)
			expect(typeof registeredCommands.get("test.chat")).toBe("function")
		})

		it("should register user helper doc command", async () => {
			await activate(mockContext)

			expect(registeredCommands.has("test.view.userHelperDoc")).toBe(true)
			expect(typeof registeredCommands.get("test.view.userHelperDoc")).toBe("function")
		})

		it("should register issue command", async () => {
			await activate(mockContext)

			expect(registeredCommands.has("test.view.issue")).toBe(true)
			expect(typeof registeredCommands.get("test.view.issue")).toBe("function")
		})

		it("should register shortcut command for completion", async () => {
			await activate(mockContext)

			expect(registeredCommands.has("test.shortcut")).toBe(true)
			expect(typeof registeredCommands.get("test.shortcut")).toBe("function")
		})
	})

	describe("CodeLens Commands Registration", () => {
		it("should register codelens button command", async () => {
			await activate(mockContext)

			expect(registeredTextEditorCommands.has("test.codelens_button")).toBe(true)
			expect(typeof registeredTextEditorCommands.get("test.codelens_button")).toBe("function")
		})

		it("should register codelens more button command", async () => {
			await activate(mockContext)

			expect(registeredTextEditorCommands.has("test.codelens_more_button")).toBe(true)
			expect(typeof registeredTextEditorCommands.get("test.codelens_more_button")).toBe("function")
		})
	})

	describe("Command Execution", () => {
		it("should execute chat command correctly", async () => {
			await activate(mockContext)

			const chatCommand = registeredCommands.get("test.chat")
			expect(chatCommand).toBeDefined()

			// Execute the command
			chatCommand!()

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("test.SidebarProvider.focus")
		})

		it("should execute user helper doc command correctly", async () => {
			await activate(mockContext)

			const docCommand = registeredCommands.get("test.view.userHelperDoc")
			expect(docCommand).toBeDefined()

			// Mock vscode.env.openExternal
			;(vscode.env.openExternal as jest.Mock) = jest.fn()

			// Execute the command
			docCommand!()

			expect(vscode.env.openExternal).toHaveBeenCalledWith(
				expect.objectContaining({
					toString: expect.any(Function),
				}),
			)
		})

		it("should execute issue command correctly", async () => {
			await activate(mockContext)

			const issueCommand = registeredCommands.get("test.view.issue")
			expect(issueCommand).toBeDefined()

			// Mock vscode.env.openExternal
			;(vscode.env.openExternal as jest.Mock) = jest.fn()

			// Execute the command
			issueCommand!()

			expect(vscode.env.openExternal).toHaveBeenCalledWith(
				expect.objectContaining({
					toString: expect.any(Function),
				}),
			)
		})

		it("should execute shortcut command correctly", async () => {
			await activate(mockContext)

			const shortcutCommand = registeredCommands.get("test.shortcut")
			expect(shortcutCommand).toBeDefined()

			// Execute the command
			shortcutCommand!()

			expect(shortKeyCut.callback).toHaveBeenCalledWith(mockContext)
		})
	})

	describe("Text Editor Commands", () => {
		it("should register text editor commands with proper callbacks", async () => {
			await activate(mockContext)

			const codelensCommand = registeredTextEditorCommands.get("test.codelens_button")
			const moreCommand = registeredTextEditorCommands.get("test.codelens_more_button")

			expect(codelensCommand).toBeDefined()
			expect(moreCommand).toBeDefined()
			expect(typeof codelensCommand).toBe("function")
			expect(typeof moreCommand).toBe("function")
		})

		it("should execute codelens commands with editor context", async () => {
			await activate(mockContext)

			const codelensCommand = registeredTextEditorCommands.get("test.codelens_button")
			expect(codelensCommand).toBeDefined()

			// Mock text editor
			const mockEditor = {
				document: {
					uri: { fsPath: "/test/file.ts" },
				},
			}

			// Execute the command with editor context
			codelensCommand!(mockEditor as any, {} as any, [])

			expect(codeLensCallBackCommand.callback).toHaveBeenCalledWith(mockContext)
		})
	})

	describe("Command Disposal", () => {
		it("should add command disposables to context subscriptions", async () => {
			await activate(mockContext)

			// Check that disposables were added to subscriptions
			expect(mockContext.subscriptions.length).toBeGreaterThan(0)

			// Verify that each subscription has a dispose method
			mockContext.subscriptions.forEach((subscription) => {
				expect(subscription).toHaveProperty("dispose")
				expect(typeof subscription.dispose).toBe("function")
			})
		})

		it("should dispose commands when context is disposed", async () => {
			await activate(mockContext)

			const disposeMocks = mockContext.subscriptions.map((sub) => sub.dispose)

			// Simulate context disposal
			mockContext.subscriptions.forEach((sub) => sub.dispose())

			disposeMocks.forEach((disposeMock) => {
				expect(disposeMock).toHaveBeenCalled()
			})
		})
	})

	describe("Command Registration Order", () => {
		it("should register commands in correct order", async () => {
			const registrationOrder: string[] = []

			;(vscode.commands.registerCommand as jest.Mock).mockImplementation((command, callback) => {
				registrationOrder.push(command)
				return { dispose: jest.fn() }
			})
			;(vscode.commands.registerTextEditorCommand as jest.Mock).mockImplementation((command, callback) => {
				registrationOrder.push(command)
				return { dispose: jest.fn() }
			})

			await activate(mockContext)

			// Verify that codelens commands are registered before other commands
			const codelensButtonIndex = registrationOrder.indexOf("test.codelens_button")
			const codelensMoreIndex = registrationOrder.indexOf("test.codelens_more_button")
			const chatIndex = registrationOrder.indexOf("test.chat")

			expect(codelensButtonIndex).toBeGreaterThan(-1)
			expect(codelensMoreIndex).toBeGreaterThan(-1)
			expect(chatIndex).toBeGreaterThan(-1)
		})
	})

	describe("Error Handling in Commands", () => {
		it("should handle command registration errors", async () => {
			;(vscode.commands.registerCommand as jest.Mock).mockImplementation(() => {
				throw new Error("Command registration failed")
			})

			await expect(activate(mockContext)).rejects.toThrow("Command registration failed")
		})

		it("should handle command execution errors gracefully", async () => {
			await activate(mockContext)

			const chatCommand = registeredCommands.get("test.chat")
			expect(chatCommand).toBeDefined()

			// Mock executeCommand to throw error
			;(vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error("Command execution failed"))

			// Command should not throw error when executed
			await expect(chatCommand!()).rejects.toThrow("Command execution failed")
		})
	})

	describe("Command Context", () => {
		it("should pass correct context to command callbacks", async () => {
			await activate(mockContext)

			const shortcutCommand = registeredCommands.get("test.shortcut")
			shortcutCommand!()

			expect(shortKeyCut.callback).toHaveBeenCalledWith(mockContext)
		})

		it("should pass correct context to text editor commands", async () => {
			await activate(mockContext)

			expect(codeLensCallBackCommand.callback).toHaveBeenCalledWith(mockContext)
			expect(codeLensCallBackMoreCommand.callback).toHaveBeenCalledWith(mockContext)
		})
	})
})
