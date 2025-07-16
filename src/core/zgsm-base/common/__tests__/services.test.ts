/**
 * Unit tests for services module
 */
import {
	setupExtensionUpdater,
	doExtensionOnce,
	updateCodelensConfig,
	updateCompletionConfig,
	initLangSetting,
	handleStatusBarClick,
} from "../services"
import { ExtensionContext, window, workspace, extensions, commands } from "vscode"
import { getExtensionsLatestVersion } from "../api"
import { LangSetting, LangSwitch, getLanguageByFilePath } from "../lang-util"
import { CompletionClient } from "../../completion/CompletionClient"
import { checkExistKey } from "../../../../shared/checkExistApiConfig"

// Mock dependencies
jest.mock("vscode")
jest.mock("../api")
jest.mock("../lang-util")
jest.mock("../../completion/CompletionClient")
jest.mock("../../../../shared/checkExistApiConfig")
jest.mock("../../../../schemas", () => ({
	Package: {
		extensionId: "test.extension",
	},
}))

describe("Services", () => {
	let mockContext: jest.Mocked<ExtensionContext>
	let mockExtension: any
	let mockProvider: any

	beforeEach(() => {
		jest.clearAllMocks()
		jest.useFakeTimers()

		// Mock ExtensionContext
		mockContext = {
			globalState: {
				get: jest.fn() as any,
				update: jest.fn(),
				keys: jest.fn().mockReturnValue([]),
				setKeysForSync: jest.fn(),
			},
		} as any

		// Mock extension
		mockExtension = {
			packageJSON: {
				name: "zgsm",
				version: "1.0.0",
			},
		}
		;(extensions.getExtension as jest.Mock).mockReturnValue(mockExtension)

		// Mock provider
		mockProvider = {
			contextProxy: {
				getOriginSecrets: jest.fn().mockResolvedValue("test-key"),
				getOriginGlobalState: jest.fn().mockResolvedValue("https://test.com"),
			},
			hasView: true,
			getState: jest.fn().mockResolvedValue({
				apiConfiguration: {
					zgsmApiKey: "test-key",
					isZgsmApiKeyValid: true,
				},
			}),
		}
		;(CompletionClient.getProvider as jest.Mock).mockReturnValue(mockProvider)

		// Mock workspace configuration
		const mockConfig = {
			get: jest.fn().mockReturnValue(true),
			update: jest.fn(),
		}
		;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

		// Mock window
		;(window.activeTextEditor as any) = {
			document: {
				uri: { fsPath: "/test/file.ts" },
			},
		}
		;(window.showInformationMessage as jest.Mock).mockResolvedValue(undefined)
		;(window.showErrorMessage as jest.Mock).mockResolvedValue(undefined)

		// Mock LangSetting
		;(LangSetting as any) = {
			codelensEnabled: true,
			completionEnabled: true,
			setCodelensDisables: jest.fn(),
			setCompletionDisables: jest.fn(),
			getCodelensDisables: jest.fn().mockReturnValue({}),
			getCompletionDisables: jest.fn().mockReturnValue({}),
			getCodelensDisable: jest.fn().mockReturnValue(LangSwitch.Enabled),
			getCompletionDisable: jest.fn().mockReturnValue(LangSwitch.Enabled),
		}

		// Mock other functions
		;(getLanguageByFilePath as jest.Mock).mockReturnValue("typescript")
		;(checkExistKey as jest.Mock).mockReturnValue(true)
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	describe("setupExtensionUpdater", () => {
		it("should set up initial timer and interval", () => {
			;(getExtensionsLatestVersion as jest.Mock).mockResolvedValue({ version: "1.0.0" })

			setupExtensionUpdater(mockContext)

			expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 3000)
			expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000 * 60 * 60)
		})

		it("should check for updates when timer executes", async () => {
			;(getExtensionsLatestVersion as jest.Mock).mockResolvedValue({ version: "1.1.0" })
			;(mockContext.globalState.get as jest.Mock).mockReturnValue(null)

			setupExtensionUpdater(mockContext)

			// Fast-forward the initial timeout
			jest.advanceTimersByTime(3000)
			await Promise.resolve() // Allow async operations to complete

			expect(getExtensionsLatestVersion).toHaveBeenCalled()
		})
	})

	describe("doExtensionOnce", () => {
		it("should set up first-time configuration", () => {
			;(mockContext.globalState.get as jest.Mock).mockReturnValue(null)

			doExtensionOnce(mockContext)

			expect(mockContext.globalState.update).toHaveBeenCalledWith("isFirstTime", true)
			expect(workspace.getConfiguration).toHaveBeenCalled()
		})

		it("should show shortcut key support message once", () => {
			;(mockContext.globalState.get as jest.Mock)
				.mockReturnValueOnce(true) // isFirstTime
				.mockReturnValueOnce(null) // shortCutKeySupport

			doExtensionOnce(mockContext)

			expect(window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("ALT+A"), "Got it")
			expect(mockContext.globalState.update).toHaveBeenCalledWith("shortCutKeySupport", true)
		})

		it("should not show messages if already shown", () => {
			;(mockContext.globalState.get as jest.Mock).mockReturnValue(true)

			doExtensionOnce(mockContext)

			expect(window.showInformationMessage).not.toHaveBeenCalled()
		})
	})

	describe("updateCodelensConfig", () => {
		it("should update codelens settings from configuration", () => {
			const mockConfig = {
				get: jest
					.fn()
					.mockReturnValueOnce(true) // enabled
					.mockReturnValueOnce({ typescript: "false" }), // disableLanguages
			}
			;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			updateCodelensConfig()

			expect(LangSetting.codelensEnabled).toBe(true)
			expect(LangSetting.setCodelensDisables).toHaveBeenCalledWith({ typescript: "false" })
		})

		it("should disable codelens when configuration is disabled", () => {
			const mockConfig = {
				get: jest
					.fn()
					.mockReturnValueOnce(false) // enabled
					.mockReturnValueOnce({}), // disableLanguages
			}
			;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			updateCodelensConfig()

			expect(LangSetting.codelensEnabled).toBe(false)
		})
	})

	describe("updateCompletionConfig", () => {
		it("should update completion settings from configuration", () => {
			const mockConfig = {
				get: jest
					.fn()
					.mockReturnValueOnce(true) // enabled
					.mockReturnValueOnce({ javascript: "true" }), // disableLanguages
			}
			;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			updateCompletionConfig()

			expect(LangSetting.completionEnabled).toBe(true)
			expect(LangSetting.setCompletionDisables).toHaveBeenCalledWith({ javascript: "true" })
		})

		it("should disable completion when configuration is disabled", () => {
			const mockConfig = {
				get: jest
					.fn()
					.mockReturnValueOnce(false) // enabled
					.mockReturnValueOnce({}), // disableLanguages
			}
			;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			updateCompletionConfig()

			expect(LangSetting.completionEnabled).toBe(false)
		})
	})

	describe("initLangSetting", () => {
		it("should initialize all language settings", () => {
			const mockConfig = {
				get: jest.fn().mockReturnValue(true),
				update: jest.fn(),
			}
			;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			initLangSetting()

			expect(workspace.getConfiguration).toHaveBeenCalledWith("FunctionQuickCommands.completion")
			expect(workspace.getConfiguration).toHaveBeenCalledWith("FunctionQuickCommands.codelens")
			expect(mockConfig.update).toHaveBeenCalledWith("disableLanguages", {}, expect.any(Number))
		})
	})

	describe("handleStatusBarClick", () => {
		it("should return early if no active editor", async () => {
			;(window.activeTextEditor as any) = undefined

			await handleStatusBarClick()

			expect(CompletionClient.getProvider).not.toHaveBeenCalled()
		})

		it("should show login error when not authenticated", async () => {
			;(checkExistKey as jest.Mock).mockReturnValue(false)

			await handleStatusBarClick()

			expect(window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("login"), expect.any(String))
		})

		it("should show login error when API key is invalid", async () => {
			mockProvider.getState.mockResolvedValue({
				apiConfiguration: {
					zgsmApiKey: "test-key",
					isZgsmApiKeyValid: false,
				},
			})

			await handleStatusBarClick()

			expect(window.showErrorMessage).toHaveBeenCalled()
		})

		it("should show feature configuration when authenticated", async () => {
			;(checkExistKey as jest.Mock).mockReturnValue(true)
			mockProvider.getState.mockResolvedValue({
				apiConfiguration: {
					zgsmApiKey: "test-key",
					isZgsmApiKeyValid: true,
				},
			})

			await handleStatusBarClick()

			expect(window.showInformationMessage).toHaveBeenCalledWith(
				expect.any(String),
				{ modal: false },
				expect.any(String),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			)
		})

		it("should handle user selection for feature toggle", async () => {
			;(checkExistKey as jest.Mock).mockReturnValue(true)
			mockProvider.getState.mockResolvedValue({
				apiConfiguration: {
					zgsmApiKey: "test-key",
					isZgsmApiKeyValid: true,
				},
			})
			;(window.showInformationMessage as jest.Mock).mockResolvedValue("Disable completion")

			const mockConfig = {
				get: jest.fn().mockReturnValue(true),
				update: jest.fn(),
			}
			;(workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig)

			await handleStatusBarClick()

			expect(window.showInformationMessage).toHaveBeenCalled()
		})

		it("should handle provider without view", async () => {
			mockProvider.hasView = false
			mockProvider.contextProxy.getOriginSecrets.mockResolvedValue(null)

			await handleStatusBarClick()

			expect(window.showErrorMessage).toHaveBeenCalled()
		})
	})

	describe("update checking logic", () => {
		it("should show update notification when new version available", async () => {
			;(getExtensionsLatestVersion as jest.Mock).mockResolvedValue({ version: "1.1.0" })
			;(mockContext.globalState.get as jest.Mock).mockReturnValue(null)

			setupExtensionUpdater(mockContext)
			jest.advanceTimersByTime(3000)
			await Promise.resolve()

			expect(window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("version update"),
				{ modal: false },
				"Confirm",
				"Ignore",
			)
		})

		it("should not show notification for same version", async () => {
			;(getExtensionsLatestVersion as jest.Mock).mockResolvedValue({ version: "1.0.0" })
			;(mockContext.globalState.get as jest.Mock).mockReturnValue(null)

			setupExtensionUpdater(mockContext)
			jest.advanceTimersByTime(3000)
			await Promise.resolve()

			expect(window.showInformationMessage).not.toHaveBeenCalled()
		})

		it("should handle ignored versions", async () => {
			;(getExtensionsLatestVersion as jest.Mock).mockResolvedValue({ version: "1.1.0" })
			;(mockContext.globalState.get as jest.Mock).mockImplementation((key: string) => {
				if (key === "zgsmIgnoreVersion") return "1.1.0"
				return null
			})

			setupExtensionUpdater(mockContext)
			jest.advanceTimersByTime(3000)
			await Promise.resolve()

			expect(window.showInformationMessage).not.toHaveBeenCalled()
		})
	})
})
