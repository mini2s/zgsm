/**
 * Unit tests for MyCodeLensProvider class
 */
import { MyCodeLensProvider } from "../CodeLensProvider"
import { TextDocument, CancellationToken, window, workspace, commands, CodeLens, Range, Position } from "vscode"
import { getLanguageClass } from "../../language/factory"
import { LangSetting, LangSwitch, getLanguageByFilePath } from "../../common/lang-util"
import { CODELENS_FUNC } from "../../common/constant"

// Mock dependencies
jest.mock("vscode")
jest.mock("../../language/factory")
jest.mock("../../common/lang-util")
jest.mock("../../common/constant")

describe("MyCodeLensProvider", () => {
	let provider: MyCodeLensProvider
	let mockDocument: jest.Mocked<TextDocument>
	let mockToken: jest.Mocked<CancellationToken>
	let mockEditor: any
	let mockLangClass: any

	beforeEach(() => {
		jest.clearAllMocks()

		provider = new MyCodeLensProvider()

		// Mock TextDocument
		mockDocument = {
			uri: { fsPath: "/test/file.ts" },
			fileName: "/test/file.ts",
			languageId: "typescript",
		} as any

		// Mock CancellationToken
		mockToken = {
			isCancellationRequested: false,
			onCancellationRequested: jest.fn(),
		}

		// Mock active editor
		mockEditor = {
			document: mockDocument,
		}
		;(window.activeTextEditor as any) = mockEditor

		// Mock language class
		mockLangClass = {
			checkCodelensEnabled: jest.fn().mockReturnValue(true),
			getShowableSymbols: jest.fn().mockReturnValue([]),
			checkItemShowable: jest.fn().mockReturnValue(true),
		}
		;(getLanguageClass as jest.Mock).mockReturnValue(mockLangClass)

		// Mock language utilities
		;(getLanguageByFilePath as jest.Mock).mockReturnValue("typescript")
		;(LangSetting as any) = {
			codelensEnabled: true,
			getCodelensDisable: jest.fn().mockReturnValue(LangSwitch.Enabled),
		}

		// Mock workspace configuration
		const mockConfig = {
			get: jest.fn().mockReturnValue(true),
		}
		;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

		// Mock CODELENS_FUNC
		;(CODELENS_FUNC as any) = {
			testCommand: {
				actionName: "Test Action",
				tooltip: "Test tooltip",
				command: "test.command",
			},
		}

		// Mock vscode commands
		;(commands.executeCommand as jest.Mock).mockResolvedValue([])
	})

	describe("provideCodeLenses", () => {
		it("should return empty array when no active editor", async () => {
			;(window.activeTextEditor as any) = undefined

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array when codelens is globally disabled", async () => {
			;(LangSetting as any).codelensEnabled = false

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array when language codelens is disabled", async () => {
			;(LangSetting.getCodelensDisable as jest.Mock).mockReturnValue(LangSwitch.Disabled)

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array when language is unsupported", async () => {
			;(LangSetting.getCodelensDisable as jest.Mock).mockReturnValue(LangSwitch.Unsupported)

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array when language class disables codelens", async () => {
			mockLangClass.checkCodelensEnabled.mockReturnValue(false)

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array when no quick commands are configured", async () => {
			const mockConfig = {
				get: jest.fn().mockReturnValue(false),
			}
			;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array when no document symbols found", async () => {
			;(commands.executeCommand as jest.Mock).mockResolvedValue(null)

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toEqual([])
		})

		it("should return empty array when document symbols array is empty", async () => {
			;(commands.executeCommand as jest.Mock).mockResolvedValue([])

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toEqual([])
		})

		it("should create code lenses for showable symbols", async () => {
			const mockSymbol = {
				name: "testFunction",
				kind: 12, // Function
				range: {
					start: { line: 5, character: 0 },
					end: { line: 10, character: 0 },
				},
			}

			;(commands.executeCommand as jest.Mock).mockResolvedValue([mockSymbol])
			mockLangClass.getShowableSymbols.mockReturnValue([mockSymbol])

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toHaveLength(1)
			expect(result[0]).toBeInstanceOf(CodeLens)
			expect(result[0].range).toEqual(new Range(5, 0, 5, 0))
			expect(result[0].command).toEqual({
				title: "Test Action",
				tooltip: "Test tooltip",
				command: "test.command",
				arguments: [mockSymbol, CODELENS_FUNC.explain],
			})
		})

		it("should filter out non-showable items", async () => {
			const mockSymbol = {
				name: "testFunction",
				kind: 12,
				range: {
					start: { line: 5, character: 0 },
					end: { line: 10, character: 0 },
				},
			}

			;(commands.executeCommand as jest.Mock).mockResolvedValue([mockSymbol])
			mockLangClass.getShowableSymbols.mockReturnValue([mockSymbol])
			mockLangClass.checkItemShowable.mockReturnValue(false)

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toHaveLength(0)
		})

		it("should create multiple code lenses for multiple commands", async () => {
			const mockSymbol = {
				name: "testFunction",
				kind: 12,
				range: {
					start: { line: 5, character: 0 },
					end: { line: 10, character: 0 },
				},
			}

			// Mock multiple codelens functions
			;(CODELENS_FUNC as any) = {
				command1: {
					actionName: "Action 1",
					tooltip: "Tooltip 1",
					command: "test.command1",
				},
				command2: {
					actionName: "Action 2",
					tooltip: "Tooltip 2",
					command: "test.command2",
				},
			}
			;(commands.executeCommand as jest.Mock).mockResolvedValue([mockSymbol])
			mockLangClass.getShowableSymbols.mockReturnValue([mockSymbol])

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toHaveLength(2)
			expect(result[0].command?.title).toBe("Action 1")
			expect(result[1].command?.title).toBe("Action 2")
		})

		it("should handle multiple symbols", async () => {
			const mockSymbol1 = {
				name: "function1",
				kind: 12,
				range: {
					start: { line: 5, character: 0 },
					end: { line: 10, character: 0 },
				},
			}

			const mockSymbol2 = {
				name: "function2",
				kind: 12,
				range: {
					start: { line: 15, character: 0 },
					end: { line: 20, character: 0 },
				},
			}

			;(commands.executeCommand as jest.Mock).mockResolvedValue([mockSymbol1, mockSymbol2])
			mockLangClass.getShowableSymbols.mockReturnValue([mockSymbol1, mockSymbol2])

			const result = await provider.provideCodeLenses(mockDocument, mockToken)

			expect(result).toHaveLength(2)
			expect(result[0].range.start.line).toBe(5)
			expect(result[1].range.start.line).toBe(15)
		})

		it("should call language detection with correct file path", async () => {
			await provider.provideCodeLenses(mockDocument, mockToken)

			expect(getLanguageByFilePath).toHaveBeenCalledWith("/test/file.ts")
		})

		it("should call language class methods with correct parameters", async () => {
			const mockSymbol = {
				name: "testFunction",
				kind: 12,
				range: {
					start: { line: 5, character: 0 },
					end: { line: 10, character: 0 },
				},
			}

			;(commands.executeCommand as jest.Mock).mockResolvedValue([mockSymbol])
			mockLangClass.getShowableSymbols.mockReturnValue([mockSymbol])

			await provider.provideCodeLenses(mockDocument, mockToken)

			expect(getLanguageClass).toHaveBeenCalledWith("typescript")
			expect(mockLangClass.checkCodelensEnabled).toHaveBeenCalled()
			expect(mockLangClass.getShowableSymbols).toHaveBeenCalledWith([mockSymbol])
			expect(mockLangClass.checkItemShowable).toHaveBeenCalledWith(CODELENS_FUNC.explain, mockSymbol)
		})

		it("should execute document symbol provider command", async () => {
			await provider.provideCodeLenses(mockDocument, mockToken)

			expect(commands.executeCommand).toHaveBeenCalledWith(
				"vscode.executeDocumentSymbolProvider",
				mockDocument.uri,
			)
		})
	})
})
