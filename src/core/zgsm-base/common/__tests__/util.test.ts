/**
 * Unit tests for utility functions
 */
import {
	getLocalIP,
	DateFormat,
	formatTime,
	formatTimeDifference,
	getUuid,
	getRandomId,
	computeHash,
	copyFile,
	debounce,
	throttle,
	maskPhoneNumber,
} from "../util"
import * as fs from "fs"
import * as os from "os"

// Mock dependencies
jest.mock("fs")
jest.mock("os")

describe("Utility Functions", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe("getLocalIP", () => {
		it("should return first valid IPv4 address", () => {
			const mockInterfaces = {
				eth0: [
					{
						family: "IPv4",
						address: "192.168.1.100",
						internal: false,
					},
				],
				lo: [
					{
						family: "IPv4",
						address: "127.0.0.1",
						internal: true,
					},
				],
			}
			;(os.networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces)

			const result = getLocalIP()
			expect(result).toBe("192.168.1.100")
		})

		it("should skip internal interfaces", () => {
			const mockInterfaces = {
				lo: [
					{
						family: "IPv4",
						address: "127.0.0.1",
						internal: true,
					},
				],
				eth0: [
					{
						family: "IPv4",
						address: "192.168.1.100",
						internal: false,
					},
				],
			}
			;(os.networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces)

			const result = getLocalIP()
			expect(result).toBe("192.168.1.100")
		})

		it('should return "No IP found" when no valid IP exists', () => {
			const mockInterfaces = {
				lo: [
					{
						family: "IPv4",
						address: "127.0.0.1",
						internal: true,
					},
				],
			}
			;(os.networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces)

			const result = getLocalIP()
			expect(result).toBe("No IP found")
		})

		it("should handle empty network interfaces", () => {
			;(os.networkInterfaces as jest.Mock).mockReturnValue({})

			const result = getLocalIP()
			expect(result).toBe("No IP found")
		})

		it("should handle undefined interface arrays", () => {
			const mockInterfaces = {
				eth0: undefined,
			}
			;(os.networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces)

			const result = getLocalIP()
			expect(result).toBe("No IP found")
		})
	})

	describe("formatTime", () => {
		const testDate = new Date("2023-07-04T15:30:15.274Z")

		it("should format time in ISO format by default", () => {
			const result = formatTime(testDate)
			expect(result).toBe("2023-07-04T15:30:15.274Z")
		})

		it("should format time in LITE format", () => {
			const result = formatTime(testDate, DateFormat.LITE)
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
		})

		it("should format time in DETAIL format", () => {
			const result = formatTime(testDate, DateFormat.DETAIL)
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
		})

		it("should handle string date input", () => {
			const result = formatTime("2023-07-04T15:30:15.274Z" as any)
			expect(result).toBe("2023-07-04T15:30:15.274Z")
		})

		it("should return empty string for null/undefined input", () => {
			expect(formatTime(null as any)).toBe("")
			expect(formatTime(undefined as any)).toBe("")
		})
	})

	describe("formatTimeDifference", () => {
		it("should format days, hours, minutes, and seconds", () => {
			const milliseconds = (2 * 24 * 60 * 60 + 3 * 60 * 60 + 45 * 60 + 30) * 1000
			const result = formatTimeDifference(milliseconds)
			expect(result).toBe("2d3h45m30s")
		})

		it("should format only relevant units", () => {
			const milliseconds = (5 * 60 + 30) * 1000
			const result = formatTimeDifference(milliseconds)
			expect(result).toBe("5m30s")
		})

		it('should return "0s" for zero difference', () => {
			const result = formatTimeDifference(0)
			expect(result).toBe("0s")
		})

		it("should handle small differences", () => {
			const result = formatTimeDifference(500)
			expect(result).toBe("0s")
		})

		it("should handle large differences", () => {
			const milliseconds = 365 * 24 * 60 * 60 * 1000
			const result = formatTimeDifference(milliseconds)
			expect(result).toBe("365d")
		})
	})

	describe("getUuid", () => {
		it("should generate valid UUID format", () => {
			const uuid = getUuid()
			expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
		})

		it("should generate unique UUIDs", () => {
			const uuid1 = getUuid()
			const uuid2 = getUuid()
			expect(uuid1).not.toBe(uuid2)
		})
	})

	describe("getRandomId", () => {
		it("should generate random ID with default length", () => {
			const id = getRandomId()
			expect(id).toHaveLength(12)
			expect(id).toMatch(/^[0-9a-f]+$/)
		})

		it("should generate random ID with specified length", () => {
			const id = getRandomId(8)
			expect(id).toHaveLength(8)
			expect(id).toMatch(/^[0-9a-f]+$/)
		})

		it("should generate unique IDs", () => {
			const id1 = getRandomId()
			const id2 = getRandomId()
			expect(id1).not.toBe(id2)
		})
	})

	describe("computeHash", () => {
		it("should compute SHA256 hash of string", () => {
			const hash = computeHash("test content")
			expect(hash).toHaveLength(64)
			expect(hash).toMatch(/^[0-9a-f]+$/)
		})

		it("should produce consistent hashes for same input", () => {
			const hash1 = computeHash("test content")
			const hash2 = computeHash("test content")
			expect(hash1).toBe(hash2)
		})

		it("should produce different hashes for different inputs", () => {
			const hash1 = computeHash("content 1")
			const hash2 = computeHash("content 2")
			expect(hash1).not.toBe(hash2)
		})
	})

	describe("copyFile", () => {
		it("should copy file successfully", () => {
			const mockData = Buffer.from("file content")
			;(fs.readFileSync as jest.Mock).mockReturnValue(mockData)
			;(fs.writeFileSync as jest.Mock).mockImplementation(() => {})

			copyFile("/source/file.txt", "/target/file.txt")

			expect(fs.readFileSync).toHaveBeenCalledWith("/source/file.txt")
			expect(fs.writeFileSync).toHaveBeenCalledWith("/target/file.txt", mockData)
		})

		it("should handle file copy errors gracefully", () => {
			;(fs.readFileSync as jest.Mock).mockImplementation(() => {
				throw new Error("File not found")
			})

			expect(() => copyFile("/source/file.txt", "/target/file.txt")).not.toThrow()
		})
	})

	describe("debounce", () => {
		beforeEach(() => {
			jest.useFakeTimers()
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it("should delay function execution", () => {
			const mockFn = jest.fn()
			const debouncedFn = debounce(mockFn, 1000)

			debouncedFn()
			expect(mockFn).not.toHaveBeenCalled()

			jest.advanceTimersByTime(1000)
			expect(mockFn).toHaveBeenCalledTimes(1)
		})

		it("should cancel previous calls when called multiple times", () => {
			const mockFn = jest.fn()
			const debouncedFn = debounce(mockFn, 1000)

			debouncedFn()
			debouncedFn()
			debouncedFn()

			jest.advanceTimersByTime(1000)
			expect(mockFn).toHaveBeenCalledTimes(1)
		})

		it("should pass arguments correctly", () => {
			const mockFn = jest.fn()
			const debouncedFn = debounce(mockFn, 1000)

			debouncedFn("arg1", "arg2")
			jest.advanceTimersByTime(1000)

			expect(mockFn).toHaveBeenCalledWith("arg1", "arg2")
		})
	})

	describe("throttle", () => {
		beforeEach(() => {
			jest.useFakeTimers()
		})

		afterEach(() => {
			jest.useRealTimers()
		})

		it("should execute function immediately on first call", () => {
			const mockFn = jest.fn()
			const throttledFn = throttle(mockFn, 1000)

			throttledFn()
			expect(mockFn).toHaveBeenCalledTimes(1)
		})

		it("should ignore subsequent calls within delay period", () => {
			const mockFn = jest.fn()
			const throttledFn = throttle(mockFn, 1000)

			throttledFn()
			throttledFn()
			throttledFn()

			expect(mockFn).toHaveBeenCalledTimes(1)
		})

		it("should allow execution after delay period", () => {
			const mockFn = jest.fn()
			const throttledFn = throttle(mockFn, 1000)

			throttledFn()
			expect(mockFn).toHaveBeenCalledTimes(1)

			jest.advanceTimersByTime(1000)
			throttledFn()
			expect(mockFn).toHaveBeenCalledTimes(2)
		})

		it("should pass arguments correctly", () => {
			const mockFn = jest.fn()
			const throttledFn = throttle(mockFn, 1000)

			throttledFn("arg1", "arg2")
			expect(mockFn).toHaveBeenCalledWith("arg1", "arg2")
		})
	})

	describe("maskPhoneNumber", () => {
		it("should mask middle four digits of phone number", () => {
			const result = maskPhoneNumber("+8613812345678")
			expect(result).toBe("138****5678")
		})

		it("should handle different phone number formats", () => {
			const result = maskPhoneNumber("+8615987654321")
			expect(result).toBe("159****4321")
		})

		it("should return original string if pattern does not match", () => {
			const result = maskPhoneNumber("1234567890")
			expect(result).toBe("1234567890")
		})
	})
})
