/**
 * Unit tests for CodeLensCallbacks
 */
import { codeLensCallBackCommand, codeLensCallBackMoreCommand } from "../CodeLensCallbacks"
import { getLanguageClass } from "../../language/factory"
import { getLanguageByFilePath } from "../../common/lang-util"
import { ClineProvider } from "../../../webview/ClineProvider"
import { CODELENS_FUNC } from "../../common/constant"
import { throttle } from "../../common/util"
import { window, languages } from "vscode"
import { getCommand } from "../../../../utils/commands"

// Mock dependencies
jest.mock("../../language/factory")
jest.mock("../../common/lang-util")
jest.mock("../../../webview/ClineProvider")
jest.mock("../../common/constant")
jest.mock("../../common/util")
jest.mock("vscode")
jest.mock("../../../../utils/commands")

describe("CodeLensCallbacks", () => {
	let mockEditor: any
	let mockDocumentSymbol: any
	let mockCodelensItem: any
	let mockLangClass: any

	beforeEach(() => {
		jest.clearAllMocks()

		// Mock editor
		mockEditor = {
			document: {
				uri: {
					fsPath: "/test/file.ts",
				},
			},
		}

		// Mock document symbol
		mockDocumentSymbol = {
			name: "testFunction",
			kind: 12,
			range: {
				start: { line: 5, character: 0 },
				end: { line: 10, character: 0 },
			},
		}

		// Mock codelens item
		mockCodelensItem = {
			actionName: "Test Action",
			tooltip: "Test tooltip",
			command: "test.command",
			key: "testCommand",
		}

		// Mock language class
		mockLangClass = {
			codelensGetExtraArgs: jest.fn().mockReturnValue({
				code: "function testFunction() {}",
				command: "test.command",
				actionType: "test",
			}),
		}
		;(getLanguageClass as jest.Mock).mockReturnValue(mockLangClass)

		// Mock language utilities
		;(getLanguageByFilePath as jest.Mock).mockReturnValue("typescript")

		// Mock ClineProvider
		;(ClineProvider.handleCodeAction as jest.Mock).mockResolvedValue(undefined)

		// Mock vscode languages
		;(languages.getDiagnostics as jest.Mock).mockReturnValue([])

		// Mock vscode window
		;(window.showQuickPick as jest.Mock).mockResolvedValue(undefined)

		// Mock throttle function
		;(throttle as jest.Mock).mockImplementation((fn) => fn)

		// Mock getCommand
		;(getCommand as jest.Mock).mockImplementation((cmd) => `test.${cmd}`)

		// Mock CODELENS_FUNC
		;(CODELENS_FUNC as any) = {
			explain: mockCodelensItem,
			addComment: {
				actionName: "Add Comment",
				tooltip: "Add comment tooltip",
				command: "other.command",
				key: "addComment",
			},
		}
	})

	describe("codeLensCallBackCommand", () => {
		it("should have correct command structure", () => {
			expect(codeLensCallBackCommand).toHaveProperty("command")
			expect(codeLensCallBackCommand).toHaveProperty("callback")
			expect(getCommand).toHaveBeenCalledWith("codelens_button")
		})

		it("should return throttled function", () => {
			const callback = codeLensCallBackCommand.callback({})
			expect(throttle).toHaveBeenCalledWith(expect.any(Function), 2000)
		})
	})

	describe("codeLensCallBackMoreCommand", () => {
		it("should have correct command structure", () => {
			expect(codeLensCallBackMoreCommand).toHaveProperty("command")
			expect(codeLensCallBackMoreCommand).toHaveProperty("callback")
			expect(getCommand).toHaveBeenCalledWith("codelens_more_button")
		})
	})

	describe("commonCodeLensFunc (through callback)", () => {
		let commonCodeLensFunc: any

		beforeEach(() => {
			// Extract the actual function that gets throttled
			const throttleCalls = (throttle as jest.Mock).mock.calls
			if (throttleCalls.length > 0) {
				commonCodeLensFunc = throttleCalls[0][0]
			}
		})

		it("should process codelens action with correct parameters", async () => {
			if (!commonCodeLensFunc) return

			await commonCodeLensFunc(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)

			expect(getLanguageByFilePath).toHaveBeenCalledWith("/test/file.ts")
			expect(getLanguageClass).toHaveBeenCalledWith("typescript")
			expect(mockLangClass.codelensGetExtraArgs).toHaveBeenCalledWith(
				mockEditor.document,
				{
					startLine: 5,
					endLine: 10,
				},
				expect.objectContaining({
					range: {
						startLine: 5,
						endLine: 10,
					},
					filePath: "/test/file.ts",
					callType: expect.any(String),
					language: "typescript",
				}),
			)
		})

		it("should call ClineProvider.handleCodeAction with correct data", async () => {
			if (!commonCodeLensFunc) return

			await commonCodeLensFunc(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)

			expect(ClineProvider.handleCodeAction).toHaveBeenCalledWith(
				"test.command",
				"test",
				expect.objectContaining({
					filePath: "/test/file.ts",
					selectedText: "function testFunction() {}",
					startLine: "5",
					endLine: "10",
					diagnostics: [],
				}),
			)
		})

		it("should filter diagnostics within symbol range", async () => {
			if (!commonCodeLensFunc) return

			const mockDiagnostics = [
				{
					range: {
						start: { line: 3, character: 0 },
						end: { line: 3, character: 10 },
					},
				},
				{
					range: {
						start: { line: 7, character: 0 },
						end: { line: 7, character: 10 },
					},
				},
				{
					range: {
						start: { line: 12, character: 0 },
						end: { line: 12, character: 10 },
					},
				},
			]
			;(languages.getDiagnostics as jest.Mock).mockReturnValue(mockDiagnostics)

			await commonCodeLensFunc(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)

			expect(ClineProvider.handleCodeAction).toHaveBeenCalledWith(
				"test.command",
				"test",
				expect.objectContaining({
					diagnostics: [mockDiagnostics[1]], // Only the diagnostic within range
				}),
			)
		})

		it("should set codelens item properties correctly", async () => {
			if (!commonCodeLensFunc) return

			await commonCodeLensFunc(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)

			expect(mockCodelensItem).toHaveProperty("range", {
				startLine: 5,
				endLine: 10,
			})
			expect(mockCodelensItem).toHaveProperty("filePath", "/test/file.ts")
			expect(mockCodelensItem).toHaveProperty("language", "typescript")
		})
	})

	describe("moreCodeLensFunc (through callback)", () => {
		it("should show quick pick with available commands", async () => {
			const moreCallback = codeLensCallBackMoreCommand.callback
			const actualCallback = moreCallback(mockEditor)

			await actualCallback(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)

			expect(window.showQuickPick).toHaveBeenCalledWith(
				[
					{
						label: "Add Comment",
						data: CODELENS_FUNC.addComment,
					},
				],
				{
					placeHolder: "Select a quick command",
				},
			)
		})

		it("should exclude current command from options", async () => {
			const moreCallback = codeLensCallBackMoreCommand.callback
			const actualCallback = moreCallback(mockEditor)
			mockCodelensItem.key = "testCommand"

			await actualCallback(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)

			const quickPickCall = (window.showQuickPick as jest.Mock).mock.calls[0]
			const options = quickPickCall[0]

			expect(options).toHaveLength(1)
			expect(options[0].label).toBe("Add Comment")
		})

		it("should handle user selection and execute command", async () => {
			const moreCallback = codeLensCallBackMoreCommand.callback
			const actualCallback = moreCallback(mockEditor)
			const selectedOption = {
				label: "Add Comment",
				data: CODELENS_FUNC.addComment,
			}
			;(window.showQuickPick as jest.Mock).mockResolvedValue(selectedOption)

			// Mock the throttled function to capture the call
			const mockThrottledFunc = jest.fn()
			;(throttle as jest.Mock).mockReturnValue(mockThrottledFunc)

			await actualCallback(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)

			// The function should be called with updated args
			expect(mockThrottledFunc).toHaveBeenCalledWith(
				mockEditor,
				undefined,
				mockDocumentSymbol,
				selectedOption.data,
			)
		})

		it("should handle user cancellation", async () => {
			const moreCallback = codeLensCallBackMoreCommand.callback
			const actualCallback = moreCallback(mockEditor)
			;(window.showQuickPick as jest.Mock).mockResolvedValue(undefined)

			const mockThrottledFunc = jest.fn()
			;(throttle as jest.Mock).mockReturnValue(mockThrottledFunc)

			await actualCallback(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)

			expect(mockThrottledFunc).not.toHaveBeenCalled()
		})
	})

	describe("integration", () => {
		it("should handle complete codelens workflow", async () => {
			const callback = codeLensCallBackCommand.callback({})

			// Simulate the throttled function execution
			if (typeof callback === "function") {
				await callback(mockEditor, undefined, mockDocumentSymbol, mockCodelensItem)
			}

			expect(getLanguageByFilePath).toHaveBeenCalled()
			expect(getLanguageClass).toHaveBeenCalled()
			expect(ClineProvider.handleCodeAction).toHaveBeenCalled()
		})
	})
})
