import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { TaskEditTracker } from "../TaskEditTracker"
import { TaskContentProvider } from "../TaskContentProvider"

// Mock ClineProvider
const mockClineProvider = {
	getWebviewPanel: vi.fn(),
	postMessageToWebview: vi.fn(),
	dispose: vi.fn(),
}

describe("文件监听系统和编辑检测集成测试", () => {
	let editTracker: TaskEditTracker
	let contentProvider: TaskContentProvider
	let testFilePath: string
	let originalContent: string

	beforeEach(async () => {
		editTracker = new TaskEditTracker(mockClineProvider as any, "test-task-id")
		contentProvider = new TaskContentProvider()
		testFilePath = path.join(__dirname, ".cospec", "tasks.md")

		// 确保测试文件存在
		try {
			originalContent = await fs.readFile(testFilePath, "utf-8")
		} catch (error) {
			// 如果文件不存在，创建一个默认内容
			originalContent = `# 测试任务文件

## 任务组 1
- [ ] 测试任务 1
- [x] 已完成任务
- [-] 进行中任务

## 任务组 2
- [ ] 另一个测试任务
`
			await fs.mkdir(path.dirname(testFilePath), { recursive: true })
			await fs.writeFile(testFilePath, originalContent)
		}
	})

	afterEach(async () => {
		// 恢复原始文件内容
		try {
			await fs.writeFile(testFilePath, originalContent)
		} catch (error) {
			console.warn("恢复文件内容失败:", error)
		}
	})

	describe("编辑检测功能", () => {
		it("应该正确检测用户编辑", async () => {
			// 记录初始编辑
			editTracker.onFileEdited(testFilePath, "user_edited")

			// 验证初始状态
			expect(editTracker.hasRecentEdits(testFilePath)).toBe(true)
			const state = editTracker.getEditState(testFilePath)
			expect(state?.editCount).toBe(1)

			// 模拟更多编辑
			editTracker.onFileEdited(testFilePath, "user_edited")
			editTracker.onFileEdited(testFilePath, "user_edited")

			// 验证编辑计数
			const finalState = editTracker.getEditState(testFilePath)
			expect(finalState?.editCount).toBe(3)
		})

		it("应该区分用户编辑和系统编辑", async () => {
			// 记录系统编辑
			editTracker.onFileEdited(testFilePath, "roo_edited")
			expect(editTracker.hasRecentEdits(testFilePath)).toBe(false)

			// 记录用户编辑
			editTracker.onFileEdited(testFilePath, "user_edited")
			expect(editTracker.hasRecentEdits(testFilePath)).toBe(true)
		})

		it("应该正确管理编辑状态", async () => {
			// 记录多次编辑
			editTracker.onFileEdited(testFilePath, "user_edited")
			editTracker.onFileEdited(testFilePath, "user_edited")

			const state = editTracker.getEditState(testFilePath)
			expect(state).toBeDefined()
			expect(state?.hasUserEdits).toBe(true)
			expect(state?.editCount).toBe(2)
		})

		it("应该能够清理编辑状态", async () => {
			// 记录编辑
			editTracker.onFileEdited(testFilePath, "user_edited")
			const state = editTracker.getEditState(testFilePath)
			expect(state?.editCount).toBe(1)

			// 清理状态
			editTracker.clearEditState(testFilePath)
			expect(editTracker.getEditState(testFilePath)).toBeNull()
			expect(editTracker.hasRecentEdits(testFilePath)).toBe(false)
		})
	})

	describe("内容提取功能", () => {
		it("应该正确读取任务文件内容", async () => {
			const content = await contentProvider.getFileContent(testFilePath)

			expect(content).toBeDefined()
			expect(content.length).toBeGreaterThan(0)
			expect(content).toContain("# 测试任务文件")
			expect(content).toContain("- [")
		})

		it("应该处理文件不存在的情况", async () => {
			const nonExistentPath = path.join(__dirname, "non-existent.md")

			await expect(contentProvider.getFileContent(nonExistentPath)).rejects.toThrow()
		})

		it("应该正确解析任务项", async () => {
			const content = await contentProvider.getFileContent(testFilePath)

			// 验证包含不同状态的任务项
			expect(content).toMatch(/- \[ \]/) // 待完成任务
			expect(content).toMatch(/- \[x\]/) // 已完成任务
			expect(content).toMatch(/- \[-\]/) // 进行中任务
		})
	})

	describe("文件修改模拟测试", () => {
		it("应该模拟完整的编辑-检测-提取流程", async () => {
			// 1. 记录编辑开始
			editTracker.onFileEdited(testFilePath, "user_edited")

			// 2. 模拟文件修改
			const modifiedContent = originalContent + "\n- [ ] 新增的测试任务"
			await fs.writeFile(testFilePath, modifiedContent)

			// 3. 记录编辑完成
			editTracker.onFileEdited(testFilePath, "user_edited")

			// 4. 验证编辑状态
			expect(editTracker.hasRecentEdits(testFilePath)).toBe(true)
			const state = editTracker.getEditState(testFilePath)
			expect(state?.editCount).toBe(2)

			// 5. 提取修改后的内容
			const extractedContent = await contentProvider.getFileContent(testFilePath)
			expect(extractedContent).toContain("新增的测试任务")

			// 6. 验证内容完整性
			expect(extractedContent.length).toBeGreaterThan(originalContent.length)
		})

		it("应该处理多次快速编辑", async () => {
			let currentContent = originalContent

			// 模拟快速连续编辑
			for (let i = 1; i <= 5; i++) {
				editTracker.onFileEdited(testFilePath, "user_edited")
				currentContent += `\n- [ ] 快速编辑任务 ${i}`
				await fs.writeFile(testFilePath, currentContent)

				// 短暂延迟
				await new Promise((resolve) => setTimeout(resolve, 10))
			}

			// 验证编辑计数
			const finalState = editTracker.getEditState(testFilePath)
			expect(finalState?.editCount).toBe(5)

			// 验证最终内容
			const finalContent = await contentProvider.getFileContent(testFilePath)
			expect(finalContent).toContain("快速编辑任务 1")
			expect(finalContent).toContain("快速编辑任务 5")
		})
	})

	describe("状态管理测试", () => {
		it("应该正确管理编辑状态", async () => {
			// 记录不同类型的编辑
			editTracker.onFileEdited(testFilePath, "user_edited")
			editTracker.onFileEdited(testFilePath, "user_edited")
			editTracker.onFileEdited(testFilePath, "roo_edited")
			editTracker.onFileEdited(testFilePath, "user_edited")

			const state = editTracker.getEditState(testFilePath)

			expect(state?.editCount).toBe(3) // 只计算用户编辑
			expect(state?.hasUserEdits).toBe(true)
			expect(state?.lastEditTime).toBeDefined()
		})

		it("应该跟踪最后编辑时间", async () => {
			const beforeEdit = Date.now()
			editTracker.onFileEdited(testFilePath, "user_edited")
			const afterEdit = Date.now()

			const state = editTracker.getEditState(testFilePath)
			expect(state?.lastEditTime).toBeGreaterThanOrEqual(beforeEdit)
			expect(state?.lastEditTime).toBeLessThanOrEqual(afterEdit)
		})

		it("应该正确管理所有编辑状态", async () => {
			// 编辑多个文件
			const testFile2 = testFilePath.replace("tasks.md", "tasks2.md")

			editTracker.onFileEdited(testFilePath, "user_edited")
			editTracker.onFileEdited(testFile2, "user_edited")

			const allStates = editTracker.getAllEditStates()
			expect(allStates.size).toBeGreaterThanOrEqual(1)

			// 清理所有状态
			editTracker.clearAllEditStates()
			const clearedStates = editTracker.getAllEditStates()
			expect(clearedStates.size).toBe(0)
		})
	})
})
