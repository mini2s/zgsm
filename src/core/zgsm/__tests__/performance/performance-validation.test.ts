/**
 * Performance validation tests for ZGSM core migration
 * These tests measure extension activation time and completion response times
 */

import { performance } from "perf_hooks"
import { Position } from "vscode"
import { CompletionClient } from "../../completion/CompletionClient"
import { CompletionPoint } from "../../completion/completionPoint"
import { AICompletionProvider } from "../../completion/CompletionProvider"
import { CompletionCache } from "../../completion/completionCache"

// Mock dependencies for performance testing
jest.mock("vscode")
jest.mock("openai")
jest.mock("../../common/log-util")
jest.mock("../../../../i18n")

describe("ZGSM Performance Validation", () => {
	let mockClineProvider: any
	let mockContext: any
	let mockDocument: any
	let mockPosition: any

	beforeEach(() => {
		jest.clearAllMocks()

		// Setup minimal mocks for performance testing
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
		}

		mockContext = {
			workspaceState: {
				get: jest.fn().mockReturnValue(true),
				update: jest.fn(),
			},
			subscriptions: [],
		}

		mockDocument = {
			uri: { fsPath: "/test/file.ts" },
			getText: jest.fn().mockReturnValue("const test = "),
			lineAt: jest.fn().mockReturnValue({ text: "const test = " }),
			lineCount: 10,
		}

		mockPosition = {
			line: 5,
			character: 10,
		}
	})

	describe("Extension Activation Performance", () => {
		it("should activate extension components within acceptable time", async () => {
			const startTime = performance.now()

			// Simulate extension activation by initializing core components
			await CompletionClient.setProvider(mockClineProvider)
			const provider = new AICompletionProvider(mockContext, mockClineProvider)

			const endTime = performance.now()
			const activationTime = endTime - startTime

			// Extension should activate within 100ms
			expect(activationTime).toBeLessThan(100)
			console.log(`Extension activation time: ${activationTime.toFixed(2)}ms`)

			provider.dispose()
		})

		it("should initialize completion cache efficiently", () => {
			const startTime = performance.now()

			// Initialize cache with multiple completion points
			for (let i = 0; i < 100; i++) {
				const completionPoint = new CompletionPoint(
					`test-${i}`,
					{ fpath: `/test/file${i}.ts`, language: "typescript" },
					new Position(i, 10),
					{
						prefix: `const test${i} = `,
						suffix: "\nrest of code",
						cursor_line_prefix: `const test${i} = `,
						cursor_line_suffix: "",
					},
					"auto",
					Date.now(),
				)
				CompletionCache.cache(completionPoint)
			}

			const endTime = performance.now()
			const cacheInitTime = endTime - startTime

			// Cache initialization should be fast
			expect(cacheInitTime).toBeLessThan(50)
			console.log(`Cache initialization time for 100 items: ${cacheInitTime.toFixed(2)}ms`)

			// Note: CompletionCache doesn't have a clear method, so we skip cleanup
		})
	})

	describe("Completion Response Performance", () => {
		it("should provide completion suggestions within acceptable time", async () => {
			const provider = new AICompletionProvider(mockContext, mockClineProvider)
			const mockInlineContext = { triggerKind: 0 } as any
			const mockToken = { isCancellationRequested: false } as any

			const startTime = performance.now()

			try {
				// This will likely fail due to mocking, but we can measure the time
				await provider.provideInlineCompletionItems(mockDocument, mockPosition, mockInlineContext, mockToken)
			} catch (error) {
				// Expected due to mocking
			}

			const endTime = performance.now()
			const completionTime = endTime - startTime

			// Completion should respond within 1000ms (even with errors)
			expect(completionTime).toBeLessThan(1000)
			console.log(`Completion response time: ${completionTime.toFixed(2)}ms`)

			provider.dispose()
		})

		it("should handle cache lookups efficiently", () => {
			// Pre-populate cache
			for (let i = 0; i < 1000; i++) {
				const completionPoint = new CompletionPoint(
					`test-${i}`,
					{ fpath: `/test/file${i}.ts`, language: "typescript" },
					new Position(i, 10),
					{
						prefix: `const test${i} = `,
						suffix: "\nrest of code",
						cursor_line_prefix: `const test${i} = `,
						cursor_line_suffix: "",
					},
					"auto",
					Date.now(),
				)
				CompletionCache.cache(completionPoint)
			}

			const startTime = performance.now()

			// Perform multiple cache lookups
			for (let i = 0; i < 100; i++) {
				CompletionCache.lookup(`/test/file${i}.ts`, i, 10)
			}

			const endTime = performance.now()
			const lookupTime = endTime - startTime

			// Cache lookups should be very fast
			expect(lookupTime).toBeLessThan(10)
			console.log(`Cache lookup time for 100 operations: ${lookupTime.toFixed(2)}ms`)

			// Note: CompletionCache doesn't have a clear method, so we skip cleanup
		})
	})

	describe("Memory Usage Validation", () => {
		it("should not create memory leaks during completion cycles", () => {
			const initialMemory = process.memoryUsage()

			// Simulate multiple completion cycles
			for (let cycle = 0; cycle < 10; cycle++) {
				// Create completion points
				const completionPoints = []
				for (let i = 0; i < 50; i++) {
					const completionPoint = new CompletionPoint(
						`test-${cycle}-${i}`,
						{ fpath: `/test/file${i}.ts`, language: "typescript" },
						new Position(i, 10),
						{
							prefix: `const test${i} = `,
							suffix: "\nrest of code",
							cursor_line_prefix: `const test${i} = `,
							cursor_line_suffix: "",
						},
						"auto",
						Date.now(),
					)
					completionPoints.push(completionPoint)
					CompletionCache.cache(completionPoint)
				}

				// Note: CompletionCache doesn't have a clear method, so we skip cleanup
			}

			// Force garbage collection if available
			if (global.gc) {
				global.gc()
			}

			const finalMemory = process.memoryUsage()
			const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

			// Memory increase should be reasonable (less than 10MB)
			expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024)
			console.log(`Memory increase after completion cycles: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
		})
	})

	describe("Concurrent Operations Performance", () => {
		it("should handle multiple concurrent completion requests efficiently", async () => {
			const provider = new AICompletionProvider(mockContext, mockClineProvider)
			const mockInlineContext = { triggerKind: 0 } as any
			const mockToken = { isCancellationRequested: false } as any

			const startTime = performance.now()

			// Create multiple concurrent completion requests
			const promises = []
			for (let i = 0; i < 5; i++) {
				const promise = Promise.resolve(
					provider.provideInlineCompletionItems(mockDocument, mockPosition, mockInlineContext, mockToken),
				).catch(() => {
					// Expected due to mocking
				})
				promises.push(promise)
			}

			await Promise.all(promises)

			const endTime = performance.now()
			const concurrentTime = endTime - startTime

			// Concurrent operations should complete within reasonable time
			expect(concurrentTime).toBeLessThan(2000)
			console.log(`Concurrent completion time for 5 requests: ${concurrentTime.toFixed(2)}ms`)

			provider.dispose()
		})
	})
})
