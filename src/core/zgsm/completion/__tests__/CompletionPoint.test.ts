/**
 * Unit tests for CompletionPoint class
 */
import { CompletionPoint, calcKey } from "../completionPoint"
import { Position, TextDocument } from "vscode"
import { CompletionAcception, CompletionDocumentInformation, CompletionPrompt } from "../completionDataInterface"

// Mock vscode
jest.mock("vscode")

describe("CompletionPoint", () => {
	let mockDoc: CompletionDocumentInformation
	let mockPosition: Position
	let mockPrompt: CompletionPrompt
	let completionPoint: CompletionPoint

	beforeEach(() => {
		mockDoc = {
			fpath: "/test/file.ts",
			language: "typescript",
		}

		mockPosition = new Position(5, 10)

		mockPrompt = {
			prefix: "const test = ",
			suffix: "\nrest of code",
			cursor_line_prefix: "const test = ",
			cursor_line_suffix: "",
		}

		completionPoint = new CompletionPoint("test-id", mockDoc, mockPosition, mockPrompt, "auto", Date.now())
	})

	describe("constructor", () => {
		it("should initialize with provided parameters", () => {
			expect(completionPoint.id).toBe("test-id")
			expect(completionPoint.doc).toBe(mockDoc)
			expect(completionPoint.pos).toBe(mockPosition)
			expect(completionPoint.triggerMode).toBe("auto")
			expect(completionPoint.getPrompt()).toBe(mockPrompt)
		})

		it("should initialize with default acception when not provided", () => {
			expect(completionPoint.getAcception()).toBe(CompletionAcception.None)
		})

		it("should initialize with provided acception", () => {
			const pointWithAcception = new CompletionPoint(
				"test-id",
				mockDoc,
				mockPosition,
				mockPrompt,
				"auto",
				Date.now(),
				CompletionAcception.Accepted,
			)

			expect(pointWithAcception.getAcception()).toBe(CompletionAcception.Accepted)
		})
	})

	describe("getKey", () => {
		it("should return formatted key with file path and position", () => {
			const key = completionPoint.getKey()
			expect(key).toBe("/test/file.ts:5:10")
		})
	})

	describe("linePrefix", () => {
		it("should return cursor line prefix from prompt", () => {
			expect(completionPoint.linePrefix).toBe("const test = ")
		})
	})

	describe("content management", () => {
		it("should start with empty content", () => {
			expect(completionPoint.getContent()).toBe("")
		})

		it("should update content when fetched", () => {
			completionPoint.fetched("new completion content")
			expect(completionPoint.getContent()).toBe("new completion content")
		})

		it("should preserve content after multiple fetches", () => {
			completionPoint.fetched("first content")
			completionPoint.fetched("second content")
			expect(completionPoint.getContent()).toBe("second content")
		})
	})

	describe("acception management", () => {
		it("should start with None acception", () => {
			expect(completionPoint.getAcception()).toBe(CompletionAcception.None)
		})

		it("should update acception when accepted", () => {
			completionPoint.accept()
			expect(completionPoint.getAcception()).toBe(CompletionAcception.Accepted)
		})

		it("should update acception when rejected", () => {
			completionPoint.reject()
			expect(completionPoint.getAcception()).toBe(CompletionAcception.Rejected)
		})

		it("should update acception when cancelled", () => {
			completionPoint.cancel()
			expect(completionPoint.getAcception()).toBe(CompletionAcception.Canceled)
		})

		it("should update acception when submitted", () => {
			completionPoint.submit()
			expect(completionPoint.getAcception()).toBe(CompletionAcception.Accepted)
		})
	})

	describe("position comparison", () => {
		it("should identify same position correctly", () => {
			const otherPoint = new CompletionPoint(
				"other-id",
				mockDoc,
				new Position(5, 10),
				mockPrompt,
				"auto",
				Date.now(),
			)

			expect(completionPoint.isSamePosition(otherPoint)).toBe(true)
		})

		it("should identify different positions correctly", () => {
			const otherPoint = new CompletionPoint(
				"other-id",
				mockDoc,
				new Position(6, 15),
				mockPrompt,
				"auto",
				Date.now(),
			)

			expect(completionPoint.isSamePosition(otherPoint)).toBe(false)
		})

		it("should identify strict same position correctly", () => {
			const otherPoint = new CompletionPoint(
				"other-id",
				mockDoc,
				new Position(5, 10),
				mockPrompt,
				"auto",
				Date.now(),
			)

			expect(completionPoint.isStrictSamePosition(otherPoint)).toBe(true)
		})

		it("should identify same line correctly", () => {
			const sameLinePoint = new CompletionPoint(
				"other-id",
				mockDoc,
				new Position(5, 20),
				mockPrompt,
				"auto",
				Date.now(),
			)

			const differentLinePoint = new CompletionPoint(
				"other-id",
				mockDoc,
				new Position(6, 10),
				mockPrompt,
				"auto",
				Date.now(),
			)

			expect(completionPoint.isSameLine(sameLinePoint)).toBe(true)
			expect(completionPoint.isSameLine(differentLinePoint)).toBe(false)
		})
	})

	describe("document comparison", () => {
		it("should identify same document and position correctly", () => {
			const mockDocument = {
				uri: { fsPath: "/test/file.ts" },
			} as TextDocument

			expect(completionPoint.isSameAsDoc(mockDocument, mockPosition)).toBe(true)
		})

		it("should identify different document correctly", () => {
			const mockDocument = {
				uri: { fsPath: "/other/file.ts" },
			} as TextDocument

			expect(completionPoint.isSameAsDoc(mockDocument, mockPosition)).toBe(false)
		})

		it("should identify different position correctly", () => {
			const mockDocument = {
				uri: { fsPath: "/test/file.ts" },
			} as TextDocument
			const differentPosition = new Position(6, 15)

			expect(completionPoint.isSameAsDoc(mockDocument, differentPosition)).toBe(false)
		})
	})

	describe("change tracking", () => {
		it("should track when content is changed", () => {
			completionPoint.changed("user typed content")
			// This method should update internal state for tracking user changes
			// The exact behavior depends on implementation details
		})

		it("should track when content is unchanged", () => {
			completionPoint.unchanged()
			// This method should update internal state for tracking no changes
			// The exact behavior depends on implementation details
		})
	})

	describe("calcKey utility function", () => {
		it("should generate correct key format", () => {
			const key = calcKey("/test/file.ts", 5, 10)
			expect(key).toBe("/test/file.ts:5:10")
		})

		it("should handle different file paths", () => {
			const key = calcKey("/path/to/another/file.js", 15, 25)
			expect(key).toBe("/path/to/another/file.js:15:25")
		})

		it("should handle zero positions", () => {
			const key = calcKey("/test/file.ts", 0, 0)
			expect(key).toBe("/test/file.ts:0:0")
		})
	})

	describe("parentId", () => {
		it("should allow setting and getting parentId", () => {
			expect(completionPoint.parentId).toBeUndefined()

			completionPoint.parentId = "parent-completion-id"
			expect(completionPoint.parentId).toBe("parent-completion-id")
		})
	})

	describe("createTime", () => {
		it("should store creation timestamp", () => {
			const now = Date.now()
			const point = new CompletionPoint("test-id", mockDoc, mockPosition, mockPrompt, "auto", now)

			expect(point.createTime).toBe(now)
		})
	})
})
