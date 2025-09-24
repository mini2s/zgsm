import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { GitDiffTracker, GitDiffResult, GitChangedLine } from "../GitDiffTracker"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

// Mock child_process
vi.mock("child_process", () => ({
	execSync: vi.fn(),
}))

// Mock fs
vi.mock("fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}))

describe("GitDiffTracker", () => {
	let gitDiffTracker: GitDiffTracker
	const mockWorkspaceRoot = "/test/workspace"
	const mockExecSync = vi.mocked(execSync)

	beforeEach(() => {
		gitDiffTracker = new GitDiffTracker(mockWorkspaceRoot)
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.resetAllMocks()
	})

	describe("constructor", () => {
		it("应该使用提供的工作区根目录", () => {
			const tracker = new GitDiffTracker("/custom/path")
			expect(tracker.getWorkspaceRoot()).toBe("/custom/path")
		})

		it("应该使用默认工作区根目录", () => {
			const tracker = new GitDiffTracker()
			expect(tracker.getWorkspaceRoot()).toBeDefined()
		})
	})

	describe("getFileDiff", () => {
		it("应该返回未跟踪文件的结果", async () => {
			// Mock git repository check
			mockExecSync.mockImplementationOnce(() => "")
			// Mock file status check
			mockExecSync.mockImplementationOnce(() => "?? test.md")

			const result = await gitDiffTracker.getFileDiff("test.md")

			expect(result).toEqual({
				hasGitChanges: false,
				diffContent: "",
				changedLines: [],
				fileStatus: "untracked",
			})
		})

		it("应该返回修改文件的 diff 结果", async () => {
			const mockDiffOutput = `diff --git a/test.md b/test.md
index 1234567..abcdefg 100644
--- a/test.md
+++ b/test.md
@@ -1,3 +1,4 @@
 # Test File
-Old line
+New line
+Added line`

			// Mock git repository check
			mockExecSync.mockImplementationOnce(() => "")
			// Mock file status check
			mockExecSync.mockImplementationOnce(() => " M test.md")
			// Mock git diff
			mockExecSync.mockImplementationOnce(() => mockDiffOutput)

			const result = await gitDiffTracker.getFileDiff("test.md")

			expect(result.hasGitChanges).toBe(true)
			expect(result.fileStatus).toBe("modified")
			expect(result.diffContent).toBe(mockDiffOutput)
			expect(result.changedLines).toHaveLength(2)
			expect(result.changedLines[0]).toEqual({
				type: "modified",
				line: 2,
				content: "New line",
				originalLine: 2,
			})
			expect(result.changedLines[1]).toEqual({
				type: "added",
				line: 3,
				content: "Added line",
			})
		})

		it("应该处理新增文件", async () => {
			// Mock git repository check
			mockExecSync.mockImplementationOnce(() => "")
			// Mock file status check
			mockExecSync.mockImplementationOnce(() => "A  test.md")
			// Mock git diff (empty for added file without diff)
			mockExecSync.mockImplementationOnce(() => "")

			const result = await gitDiffTracker.getFileDiff("test.md")

			expect(result.fileStatus).toBe("added")
		})

		it("应该处理删除文件", async () => {
			// Mock git repository check
			mockExecSync.mockImplementationOnce(() => "")
			// Mock file status check
			mockExecSync.mockImplementationOnce(() => " D test.md")
			// Mock git diff (empty for deleted file)
			mockExecSync.mockImplementationOnce(() => "")

			const result = await gitDiffTracker.getFileDiff("test.md")

			expect(result.fileStatus).toBe("deleted")
		})

		it("应该处理非 git 仓库", async () => {
			// Mock git repository check failure
			mockExecSync.mockImplementationOnce(() => {
				throw new Error("Not a git repository")
			})

			const result = await gitDiffTracker.getFileDiff("test.md")

			expect(result).toEqual({
				hasGitChanges: false,
				diffContent: "",
				changedLines: [],
				fileStatus: "untracked",
				error: "Not a git repository",
			})
		})

		it("应该处理 git 命令执行错误", async () => {
			// Mock git repository check
			mockExecSync.mockImplementationOnce(() => "")
			// Mock file status check
			mockExecSync.mockImplementationOnce(() => " M test.md")
			// Mock git diff failure
			mockExecSync.mockImplementationOnce(() => {
				throw new Error("Git command failed")
			})

			const result = await gitDiffTracker.getFileDiff("test.md")

			expect(result.hasGitChanges).toBe(false)
			expect(result.error).toBeDefined()
		})
	})

	describe("parseDiffContent", () => {
		it("应该正确解析简单的 diff", async () => {
			const diffContent = `@@ -1,2 +1,3 @@
 # Title
-Old line
+New line
+Added line`

			// Mock git repository and status
			mockExecSync.mockImplementationOnce(() => "")
			mockExecSync.mockImplementationOnce(() => " M test.md")
			mockExecSync.mockImplementationOnce(() => diffContent)

			const result = await gitDiffTracker.getFileDiff("test.md")

			expect(result.changedLines).toHaveLength(2)
			expect(result.changedLines[0]).toEqual({
				type: "modified",
				line: 2,
				content: "New line",
				originalLine: 2,
			})
			expect(result.changedLines[1]).toEqual({
				type: "added",
				line: 3,
				content: "Added line",
			})
		})

		it("应该正确解析多个 hunk 的 diff", async () => {
			const diffContent = `@@ -1,2 +1,2 @@
 # Title
-Old line 1
+New line 1
@@ -10,2 +10,3 @@
 # Section
-Old line 2
+New line 2
+Added line`

			// Mock git repository and status
			mockExecSync.mockImplementationOnce(() => "")
			mockExecSync.mockImplementationOnce(() => " M test.md")
			mockExecSync.mockImplementationOnce(() => diffContent)

			const result = await gitDiffTracker.getFileDiff("test.md")

			expect(result.changedLines).toHaveLength(3)
			expect(result.changedLines[0]).toEqual({
				type: "modified",
				line: 2,
				content: "New line 1",
				originalLine: 2,
			})
			expect(result.changedLines[1]).toEqual({
				type: "modified",
				line: 11,
				content: "New line 2",
				originalLine: 11,
			})
			expect(result.changedLines[2]).toEqual({
				type: "added",
				line: 12,
				content: "Added line",
			})
		})
	})

	describe("hasUncommittedChanges", () => {
		it("应该返回 true 当文件有变更时", async () => {
			// Mock git repository check
			mockExecSync.mockImplementationOnce(() => "")
			// Mock file status check
			mockExecSync.mockImplementationOnce(() => " M test.md")
			// Mock git diff
			mockExecSync.mockImplementationOnce(() => "@@ -1,1 +1,1 @@\n-old\n+new")

			const hasChanges = await gitDiffTracker.hasUncommittedChanges("test.md")

			expect(hasChanges).toBe(true)
		})

		it("应该返回 false 当文件无变更时", async () => {
			// Mock git repository check
			mockExecSync.mockImplementationOnce(() => "")
			// Mock file status check
			mockExecSync.mockImplementationOnce(() => "")

			const hasChanges = await gitDiffTracker.hasUncommittedChanges("test.md")

			expect(hasChanges).toBe(false)
		})
	})

	describe("getChangeStats", () => {
		it("应该返回正确的变更统计", async () => {
			const diffContent = `@@ -1,3 +1,4 @@
	# Title
-Old line 1
-Old line 2
+New line 1
+New line 2
+Added line`

			// Mock git repository and status
			mockExecSync.mockImplementationOnce(() => "")
			mockExecSync.mockImplementationOnce(() => " M test.md")
			mockExecSync.mockImplementationOnce(() => diffContent)

			const stats = await gitDiffTracker.getChangeStats("test.md")

			expect(stats).toEqual({
				addedLines: 3,
				removedLines: 2,
				modifiedLines: 0,
				totalChanges: 5,
			})
		})

		it("应该处理只有新增行的情况", async () => {
			const diffContent = `@@ -1,1 +1,3 @@
 # Title
+Added line 1
+Added line 2`

			// Mock git repository and status
			mockExecSync.mockImplementationOnce(() => "")
			mockExecSync.mockImplementationOnce(() => " M test.md")
			mockExecSync.mockImplementationOnce(() => diffContent)

			const stats = await gitDiffTracker.getChangeStats("test.md")

			expect(stats).toEqual({
				addedLines: 2,
				removedLines: 0,
				modifiedLines: 0,
				totalChanges: 2,
			})
		})
	})

	describe("setWorkspaceRoot", () => {
		it("应该更新工作区根目录", () => {
			const newRoot = "/new/workspace"
			gitDiffTracker.setWorkspaceRoot(newRoot)
			expect(gitDiffTracker.getWorkspaceRoot()).toBe(newRoot)
		})
	})
})
