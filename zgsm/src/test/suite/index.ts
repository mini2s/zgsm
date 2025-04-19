import * as glob from "glob"
import Mocha from "mocha"
import * as path from "path"
import { Logger } from "../../common/log-util"

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: "tdd",
		color: true,
	})

	const testsRoot = path.resolve(__dirname, "..")

	return new Promise((c, e) => {
		const files = glob.sync("**/**.test.js", { cwd: testsRoot })

		// Add files to the test suite
		files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)))

		try {
			// Run the mocha test
			mocha.run((failures: number) => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`))
				} else {
					c()
				}
			})
		} catch (err) {
			Logger.error(err)
			e(err)
		}
	})
}
