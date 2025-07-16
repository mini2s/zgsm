/**
 * Unit tests for CompletionCache class
 */
import { CompletionCache } from "../completionCache"
import { CompletionPoint } from "../completionPoint"
import { Position } from "vscode"

// Mock dependencies
jest.mock("../completionPoint")
jest.mock("vscode")

describe("CompletionCache", () => {
	let mockCompletionPoint: jest.Mocked<CompletionPoint>

	beforeEach(() => {
		jest.clearAllMocks()

		// Reset cache state
		;(CompletionCache as any).points = []
		;(CompletionCache as any).keys = new Map()
		;(CompletionCache as any).ids = new Map()
		;(CompletionCache as any).latest = undefined
		;(CompletionCache as any).latestId = 0

		// Mock CompletionPoint
		mockCompletionPoint = {
			id: "original-id",
			doc: {
				fpath: "/test/file.ts",
				language: "typescript",
			},
			pos: new Position(5, 10),
			getPrompt: jest.fn().mockReturnValue({
				prefix: "const test = ",
				suffix: "\nrest of code",
			}),
			triggerMode: "auto",
			createTime: Date.now(),
			getAcception: jest.fn().mockReturnValue("None"),
			getKey: jest.fn().mockReturnValue("/test/file.ts:5:10"),
			parentId: undefined,
		} as any

		// Mock CompletionPoint constructor
		;(CompletionPoint as jest.MockedClass<typeof CompletionPoint>).mockImplementation(
			(id, doc, pos, prompt, triggerMode, createTime, acception) =>
				({
					id,
					doc,
					pos,
					getPrompt: () => prompt,
					triggerMode,
					createTime,
					getAcception: () => acception || "None",
					getKey: () => `${doc.fpath}:${pos.line}:${pos.character}`,
					parentId: undefined,
				}) as any,
		)
	})

	describe("cache", () => {
		it("should cache a completion point and return a copy with new ID", () => {
			const cachedPoint = CompletionCache.cache(mockCompletionPoint)

			expect(cachedPoint).not.toBe(mockCompletionPoint)
			expect(cachedPoint.id).not.toBe("original-id")
			expect(cachedPoint.id).toMatch(/^0-/)
			expect(cachedPoint.doc).toBe(mockCompletionPoint.doc)
			expect(cachedPoint.pos).toBe(mockCompletionPoint.pos)
		})

		it("should update latest completion point", () => {
			const cachedPoint = CompletionCache.cache(mockCompletionPoint)
			const latest = CompletionCache.getLatest()

			expect(latest).toBe(cachedPoint)
		})

		it("should increment ID counter for subsequent caches", () => {
			const first = CompletionCache.cache(mockCompletionPoint)
			const second = CompletionCache.cache(mockCompletionPoint)

			expect(first.id).toMatch(/^0-/)
			expect(second.id).toMatch(/^1-/)
		})

		it("should add point to all tracking collections", () => {
			const cachedPoint = CompletionCache.cache(mockCompletionPoint)
			const allPoints = CompletionCache.all()

			expect(allPoints).toContain(cachedPoint)
			expect(allPoints.length).toBe(1)
		})
	})

	describe("lookup", () => {
		it("should find completion point by file path and position", () => {
			const cachedPoint = CompletionCache.cache(mockCompletionPoint)
			const found = CompletionCache.lookup("/test/file.ts", 5, 10)

			expect(found).toBe(cachedPoint)
		})

		it("should return undefined for non-existent position", () => {
			CompletionCache.cache(mockCompletionPoint)
			const found = CompletionCache.lookup("/test/file.ts", 10, 20)

			expect(found).toBeUndefined()
		})

		it("should return undefined for different file", () => {
			CompletionCache.cache(mockCompletionPoint)
			const found = CompletionCache.lookup("/other/file.ts", 5, 10)

			expect(found).toBeUndefined()
		})
	})

	describe("getLatest", () => {
		it("should return undefined when no points are cached", () => {
			const latest = CompletionCache.getLatest()
			expect(latest).toBeUndefined()
		})

		it("should return the most recently cached point", () => {
			const first = CompletionCache.cache(mockCompletionPoint)

			const secondMockPoint = {
				...mockCompletionPoint,
				pos: new Position(6, 15),
				getKey: jest.fn().mockReturnValue("/test/file.ts:6:15"),
			}
			const second = CompletionCache.cache(secondMockPoint as any)

			const latest = CompletionCache.getLatest()
			expect(latest).toBe(second)
			expect(latest).not.toBe(first)
		})
	})

	describe("all", () => {
		it("should return empty array when no points are cached", () => {
			const allPoints = CompletionCache.all()
			expect(allPoints).toEqual([])
		})

		it("should return all cached points in order", () => {
			const first = CompletionCache.cache(mockCompletionPoint)

			const secondMockPoint = {
				...mockCompletionPoint,
				pos: new Position(6, 15),
				getKey: jest.fn().mockReturnValue("/test/file.ts:6:15"),
			}
			const second = CompletionCache.cache(secondMockPoint as any)

			const allPoints = CompletionCache.all()
			expect(allPoints).toEqual([first, second])
		})
	})

	describe("erase", () => {
		beforeEach(() => {
			// Cache multiple points
			CompletionCache.cache(mockCompletionPoint)

			const secondMockPoint = {
				...mockCompletionPoint,
				pos: new Position(6, 15),
				getKey: jest.fn().mockReturnValue("/test/file.ts:6:15"),
			}
			CompletionCache.cache(secondMockPoint as any)

			const thirdMockPoint = {
				...mockCompletionPoint,
				pos: new Position(7, 20),
				getKey: jest.fn().mockReturnValue("/test/file.ts:7:20"),
			}
			CompletionCache.cache(thirdMockPoint as any)
		})

		it("should remove specified number of points from beginning", () => {
			const allBefore = CompletionCache.all()
			expect(allBefore.length).toBe(3)

			CompletionCache.erase(1)

			const allAfter = CompletionCache.all()
			expect(allAfter.length).toBe(2)
			expect(allAfter[0]).toBe(allBefore[1])
			expect(allAfter[1]).toBe(allBefore[2])
		})

		it("should throw error when trying to erase all points", () => {
			expect(() => {
				CompletionCache.erase(3)
			}).toThrow("The last completion point cannot be deleted")
		})

		it("should throw error when trying to erase more points than available", () => {
			expect(() => {
				CompletionCache.erase(5)
			}).toThrow("The last completion point cannot be deleted")
		})

		it("should clean up internal maps when erasing points", () => {
			const allBefore = CompletionCache.all()
			const firstPoint = allBefore[0]

			CompletionCache.erase(1)

			// The erased point should no longer be findable by lookup
			const found = CompletionCache.lookup("/test/file.ts", 5, 10)
			expect(found).not.toBe(firstPoint)
		})
	})

	describe("nextId generation", () => {
		it("should generate unique IDs with incremental counter", () => {
			const first = CompletionCache.cache(mockCompletionPoint)
			const second = CompletionCache.cache(mockCompletionPoint)
			const third = CompletionCache.cache(mockCompletionPoint)

			expect(first.id).toMatch(/^0-[a-zA-Z0-9]{16}$/)
			expect(second.id).toMatch(/^1-[a-zA-Z0-9]{16}$/)
			expect(third.id).toMatch(/^2-[a-zA-Z0-9]{16}$/)

			// IDs should be unique
			expect(first.id).not.toBe(second.id)
			expect(second.id).not.toBe(third.id)
			expect(first.id).not.toBe(third.id)
		})
	})
})
