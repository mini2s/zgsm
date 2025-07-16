/**
 * Unit tests for CompletionStatusBar class
 */
import { CompletionStatusBar } from "../completionStatusBar"
import { StatusBarItem, window } from "vscode"

// Mock vscode
jest.mock("vscode", () => ({
	window: {
		createStatusBarItem: jest.fn(),
	},
	StatusBarAlignment: {
		Right: 2,
	},
}))

describe("CompletionStatusBar", () => {
	let mockStatusBarItem: jest.Mocked<StatusBarItem>

	beforeEach(() => {
		jest.clearAllMocks()

		// Mock StatusBarItem
		mockStatusBarItem = {
			text: "",
			tooltip: "",
			color: undefined,
			show: jest.fn(),
			hide: jest.fn(),
			dispose: jest.fn(),
		} as any

		// Mock window.createStatusBarItem
		;(window.createStatusBarItem as jest.Mock).mockReturnValue(mockStatusBarItem)

		// Reset static state
		;(CompletionStatusBar as any).statusBarItem = undefined
	})

	describe("initialization", () => {
		it("should create status bar item when first accessed", () => {
			CompletionStatusBar.loading()

			expect(window.createStatusBarItem).toHaveBeenCalled()
			expect(mockStatusBarItem.show).toHaveBeenCalled()
		})

		it("should reuse existing status bar item", () => {
			CompletionStatusBar.loading()
			CompletionStatusBar.complete()

			expect(window.createStatusBarItem).toHaveBeenCalledTimes(1)
		})
	})

	describe("loading", () => {
		it("should show loading status", () => {
			CompletionStatusBar.loading()

			expect(mockStatusBarItem.text).toContain("loading")
			expect(mockStatusBarItem.show).toHaveBeenCalled()
		})

		it("should set appropriate tooltip for loading", () => {
			CompletionStatusBar.loading()

			expect(mockStatusBarItem.tooltip).toBeDefined()
			expect(typeof mockStatusBarItem.tooltip).toBe("string")
		})
	})

	describe("complete", () => {
		it("should show completion success status", () => {
			CompletionStatusBar.complete()

			expect(mockStatusBarItem.text).toBeDefined()
			expect(mockStatusBarItem.show).toHaveBeenCalled()
		})

		it("should set appropriate color for success", () => {
			CompletionStatusBar.complete()

			// Color should be set to indicate success (typically green or default)
			expect(mockStatusBarItem.color).toBeDefined()
		})
	})

	describe("noSuggest", () => {
		it("should show no suggestion status", () => {
			CompletionStatusBar.noSuggest()

			expect(mockStatusBarItem.text).toBeDefined()
			expect(mockStatusBarItem.show).toHaveBeenCalled()
		})

		it("should set appropriate tooltip for no suggestions", () => {
			CompletionStatusBar.noSuggest()

			expect(mockStatusBarItem.tooltip).toBeDefined()
		})
	})

	describe("fail", () => {
		it("should show failure status with error message", () => {
			const error = new Error("API request failed")
			CompletionStatusBar.fail(error)

			expect(mockStatusBarItem.text).toBeDefined()
			expect(mockStatusBarItem.show).toHaveBeenCalled()
		})

		it("should set error color for failure", () => {
			const error = new Error("API request failed")
			CompletionStatusBar.fail(error)

			// Color should indicate error (typically red)
			expect(mockStatusBarItem.color).toBeDefined()
		})

		it("should handle error object in tooltip", () => {
			const error = new Error("API request failed")
			CompletionStatusBar.fail(error)

			expect(mockStatusBarItem.tooltip).toBeDefined()
			expect(mockStatusBarItem.tooltip).toContain("API request failed")
		})

		it("should handle string error", () => {
			CompletionStatusBar.fail({ message: "String error message" })

			expect(mockStatusBarItem.tooltip).toContain("String error message")
		})

		it("should handle undefined error", () => {
			CompletionStatusBar.fail({ message: undefined })

			expect(mockStatusBarItem.tooltip).toBeDefined()
		})
	})

	describe("status transitions", () => {
		it("should transition from loading to complete", () => {
			CompletionStatusBar.loading()
			const loadingText = mockStatusBarItem.text

			CompletionStatusBar.complete()
			const completeText = mockStatusBarItem.text

			expect(loadingText).not.toBe(completeText)
			expect(mockStatusBarItem.show).toHaveBeenCalledTimes(2)
		})

		it("should transition from loading to failure", () => {
			CompletionStatusBar.loading()
			const loadingText = mockStatusBarItem.text

			CompletionStatusBar.fail(new Error("Test error"))
			const failText = mockStatusBarItem.text

			expect(loadingText).not.toBe(failText)
		})

		it("should transition from complete to loading", () => {
			CompletionStatusBar.complete()
			const completeText = mockStatusBarItem.text

			CompletionStatusBar.loading()
			const loadingText = mockStatusBarItem.text

			expect(completeText).not.toBe(loadingText)
		})
	})

	describe("login", () => {
		it("should set login status", () => {
			// Create a mock context
			const mockContext = {
				subscriptions: [],
			} as any

			CompletionStatusBar.create(mockContext)
			CompletionStatusBar.login()

			expect(mockStatusBarItem.text).toContain("Login")
			expect(mockStatusBarItem.tooltip).toBe("")
			expect(mockStatusBarItem.command).toBeUndefined()
		})
	})

	describe("resetCommand", () => {
		it("should reset command after login", () => {
			// Create a mock context
			const mockContext = {
				subscriptions: [],
			} as any

			CompletionStatusBar.create(mockContext)
			CompletionStatusBar.login()
			CompletionStatusBar.resetCommand()

			expect(mockStatusBarItem.command).toBeDefined()
		})
	})
})
