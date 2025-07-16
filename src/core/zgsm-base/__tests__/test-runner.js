/**
 * Simple test runner for ZGSM core tests
 * This bypasses TypeScript compilation issues for now
 */

const { execSync } = require("child_process")
const path = require("path")

// List of test files that should work
const testFiles = [
	"src/core/zgsm/completion/__tests__/completionCache.test.ts",
	"src/core/zgsm/common/__tests__/util.test.ts",
]

console.log("Running ZGSM Core Tests...\n")

let passedTests = 0
let failedTests = 0

testFiles.forEach((testFile) => {
	try {
		console.log(`Running: ${testFile}`)

		// Run jest on individual test file
		execSync(`npx jest "${testFile}" --verbose`, {
			stdio: "inherit",
			cwd: process.cwd(),
		})

		passedTests++
		console.log(`✅ PASSED: ${testFile}\n`)
	} catch (error) {
		failedTests++
		console.log(`❌ FAILED: ${testFile}`)
		console.log(`Error: ${error.message}\n`)
	}
})

console.log("\n=== Test Summary ===")
console.log(`Passed: ${passedTests}`)
console.log(`Failed: ${failedTests}`)
console.log(`Total: ${passedTests + failedTests}`)

if (failedTests === 0) {
	console.log("\n🎉 All tests passed!")
	process.exit(0)
} else {
	console.log("\n⚠️  Some tests failed")
	process.exit(1)
}
