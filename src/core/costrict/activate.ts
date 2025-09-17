/**
 * ZGSM Core Activation Module
 *
 * Handles the activation and initialization of all ZGSM functionality
 * including completion providers, codelens providers, and command registration.
 */

import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"

// Import from migrated modules
import { AICompletionProvider, CompletionStatusBar, shortKeyCut } from "./completion"

import { MyCodeLensProvider, codeLensCallBackCommand, codeLensCallBackMoreCommand } from "./codelens"

import {
	configCompletion,
	configCodeLens,
	OPENAI_CLIENT_NOT_INITIALIZED,
	updateCodelensConfig,
	updateCompletionConfig,
	initLangSetting,
	printLogo,
	loadLocalLanguageExtensions,
} from "./base/common"
import { ZgsmAuthApi, ZgsmAuthCommands, ZgsmAuthService, ZgsmAuthStorage } from "./auth"
import { initCodeReview } from "./code-review"
import { initTelemetry } from "./telemetry"
import { initErrorCodeManager } from "./error-code"
import { Package } from "../../shared/package"
import { createLogger, ILogger, deactivate as loggerDeactivate } from "../../utils/logger"
import { connectIPC, disconnectIPC, onZgsmLogout, onZgsmTokensUpdate, startIPCServer, stopIPCServer } from "./auth/ipc"
import { getClientId } from "../../utils/getClientId"
import ZgsmCodebaseIndexManager, { zgsmCodebaseIndexManager } from "./codebase-index"
import { workspaceEventMonitor } from "./codebase-index/workspace-event-monitor"
import { initGitCheckoutDetector } from "./codebase-index/git-checkout-detector"
import { writeCostrictAccessToken } from "./codebase-index/utils"
import { getPanel } from "../../activate/registerCommands"
import { t } from "../../i18n"
import prettyBytes from "pretty-bytes"
import { createCoworkflowModule } from "./workflow"

const HISTORY_WARN_SIZE = 1000 * 1000 * 1000 * 3

/**
 * Coworkflow module instance
 */
let coworkflowModule: ReturnType<typeof createCoworkflowModule> | null = null

/**
 * Initialization entry
 */
async function initialize(provider: ClineProvider, logger: ILogger) {
	const oldEnabled = provider.getValue("zgsmCodebaseIndexEnabled")
	if (oldEnabled == null) {
		await provider.setValue("zgsmCodebaseIndexEnabled", true)
	}
	//
	ZgsmAuthStorage.setProvider(provider)
	ZgsmAuthApi.setProvider(provider)
	ZgsmAuthService.setProvider(provider)
	ZgsmAuthCommands.setProvider(provider)

	//
	zgsmCodebaseIndexManager.setProvider(provider)
	zgsmCodebaseIndexManager.setLogger(logger)
	workspaceEventMonitor.setProvider(provider)
	workspaceEventMonitor.setLogger(logger)

	//
	printLogo()
	initLangSetting()
	loadLocalLanguageExtensions()
}

/**
 * Entry function when the ZGSM extension is activated
 */
export async function activate(
	context: vscode.ExtensionContext,
	provider: ClineProvider,
	outputChannel: vscode.OutputChannel,
) {
	const logger = createLogger(Package.outputChannel, { channel: outputChannel })
	initErrorCodeManager(provider)
	initGitCheckoutDetector(context, logger)
	await initialize(provider, logger)
	startIPCServer()
	connectIPC()

	const zgsmAuthService = ZgsmAuthService.getInstance()
	context.subscriptions.push(zgsmAuthService)
	context.subscriptions.push(
		onZgsmTokensUpdate((tokens: { state: string; access_token: string; refresh_token: string }) => {
			zgsmAuthService.saveTokens(tokens)
			provider.log(`new token from other window: ${tokens.access_token}`)
		}),
		onZgsmLogout((sessionId: string) => {
			if (vscode.env.sessionId === sessionId) return
			zgsmAuthService.logout(true)
			provider.log(`logout from other window`)
		}),
	)
	const zgsmAuthCommands = ZgsmAuthCommands.getInstance()
	context.subscriptions.push(zgsmAuthCommands)

	zgsmAuthCommands.registerCommands(context)

	provider.setZgsmAuthCommands(zgsmAuthCommands)
	let loginTip = () => {}
	/**
	 * Check login status when plugin starts
	 */
	try {
		const isLoggedIn = await zgsmAuthService.checkLoginStatusOnStartup()

		if (isLoggedIn) {
			provider.log("Login status detected at plugin startup: valid")
			zgsmAuthService.getTokens().then(async (tokens) => {
				if (!tokens) {
					return
				}
				writeCostrictAccessToken(tokens.access_token).then(async () => {
					await zgsmCodebaseIndexManager.initialize()
					zgsmCodebaseIndexManager.syncToken()
					workspaceEventMonitor.initialize()
				})
				zgsmAuthService.startTokenRefresh(tokens.refresh_token, getClientId(), tokens.state)
				zgsmAuthService.updateUserInfo(tokens.access_token)
			})
			// Start token refresh timer
		} else {
			// ZgsmAuthService.openStatusBarLoginTip()
			loginTip = () => {
				zgsmAuthService.getTokens().then(async (tokens) => {
					if (!tokens) {
						getPanel()?.webview.postMessage({
							type: "showReauthConfirmationDialog",
							messageTs: new Date().getTime(),
						})
						return
					}
				})
			}
			provider.log("Login status detected at plugin startup: invalid")
		}
	} catch (error) {
		provider.log("Failed to check login status at startup: " + error.message)
	}
	initCodeReview(context, provider, outputChannel)
	CompletionStatusBar.create(context)
	initTelemetry(provider)

	context.subscriptions.push(
		// Register codelens related commands
		vscode.commands.registerTextEditorCommand(
			codeLensCallBackCommand.command,
			codeLensCallBackCommand.callback(context),
		),
		// Construct instruction set
		vscode.commands.registerTextEditorCommand(
			codeLensCallBackMoreCommand.command,
			codeLensCallBackMoreCommand.callback(context),
		),
		// Register function header menu
		vscode.languages.registerCodeLensProvider("*", new MyCodeLensProvider()),
	)

	// Listen for configuration changes
	const configChanged = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration(configCompletion)) {
			// Code completion settings changed
			updateCompletionConfig()
		}
		if (e.affectsConfiguration(configCodeLens)) {
			// Function Quick Commands settings changed
			updateCodelensConfig()
		}

		// Handle Coworkflow configuration changes
		const coworkflowConfigSection = `${Package.name}.coworkflow`
		if (
			e.affectsConfiguration(`${coworkflowConfigSection}.enableCodeLens`) ||
			e.affectsConfiguration(`${coworkflowConfigSection}.enableDecorations`) ||
			e.affectsConfiguration(`${coworkflowConfigSection}.enableFileWatcher`)
		) {
			outputChannel.appendLine("Coworkflow configuration changed, reinitializing module...")

			// Dispose existing module
			if (coworkflowModule) {
				coworkflowModule.dispose()
				coworkflowModule = null
			}

			// Reinitialize with new configuration
			;(async () => {
				try {
					const config = vscode.workspace.getConfiguration(Package.name)
					const enableCodeLens = config.get<boolean>("coworkflow.enableCodeLens", true)
					const enableDecorations = config.get<boolean>("coworkflow.enableDecorations", true)
					const enableFileWatcher = config.get<boolean>("coworkflow.enableFileWatcher", true)

					coworkflowModule = createCoworkflowModule({
						enableCodeLens,
						enableDecorations,
						enableFileWatcher,
					})

					await coworkflowModule.initialize()

					// Re-register disposables
					context.subscriptions.push({
						dispose: () => {
							if (coworkflowModule) {
								coworkflowModule.dispose()
								coworkflowModule = null
							}
						},
					})

					outputChannel.appendLine("Coworkflow module reinitialized successfully with new configuration")
				} catch (error) {
					outputChannel.appendLine(
						`Failed to reinitialize Coworkflow module: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			})()
		}

		CompletionStatusBar.initByConfig()
	})
	context.subscriptions.push(configChanged)

	context.subscriptions.push(
		// Code completion service
		vscode.languages.registerInlineCompletionItemProvider(
			{ pattern: "**" },
			new AICompletionProvider(context, provider),
		),
		// Shortcut command to trigger auto-completion manually
		vscode.commands.registerCommand(shortKeyCut.command, () => {
			shortKeyCut.callback(context)
		}),
	)

	// Get zgsmRefreshToken without webview resolve
	const tokens = await ZgsmAuthStorage.getInstance().getTokens()
	if (tokens?.access_token) {
		CompletionStatusBar.initByConfig()
	} else {
		CompletionStatusBar.fail({
			message: OPENAI_CLIENT_NOT_INITIALIZED,
		})
	}
	provider.getState().then((state) => {
		const size = (state.taskHistory || []).reduce((p, c) => p + Number(c.size), 0)
		if (size > HISTORY_WARN_SIZE) {
			const btnText = t("common:history.viewAllHistory")
			vscode.window
				.showWarningMessage(t("common:history.warn", { size: prettyBytes(HISTORY_WARN_SIZE) }), btnText)
				.then((selection) => {
					if (btnText === selection) {
						provider.postMessageToWebview({ type: "action", action: "switchTab", tab: "history" })
					}
				})
		}
	})

	// Initialize Coworkflow module
	try {
		const coworkflowConfig = vscode.workspace.getConfiguration(Package.name)
		const enableCodeLens = coworkflowConfig.get<boolean>("coworkflow.enableCodeLens", true)
		const enableDecorations = coworkflowConfig.get<boolean>("coworkflow.enableDecorations", true)
		const enableFileWatcher = coworkflowConfig.get<boolean>("coworkflow.enableFileWatcher", true)

		coworkflowModule = createCoworkflowModule({
			enableCodeLens,
			enableDecorations,
			enableFileWatcher,
		})

		await coworkflowModule.initialize()
		context.subscriptions.push({
			dispose: () => {
				if (coworkflowModule) {
					coworkflowModule.dispose()
					coworkflowModule = null
				}
			},
		})

		outputChannel.appendLine("Coworkflow module initialized successfully")

		// Set up event system integration for Coworkflow
		if (coworkflowModule) {
			const fileWatcher = coworkflowModule.getProviders().fileWatcher
			const decorationProvider = coworkflowModule.getProviders().decorationProvider

			// Listen to file changes from CoworkflowFileWatcher
			fileWatcher.onFileChanged((uri) => {
				// Update decorations when files change
				const activeEditor = vscode.window.activeTextEditor
				if (activeEditor && activeEditor.document.uri === uri) {
					decorationProvider.updateDecorations(activeEditor.document)
				}

				// Log file change event
				outputChannel.appendLine(`Coworkflow file changed: ${uri.fsPath}`)
			})

			// Register command to handle file change events
			const fileChangedDisposable = vscode.commands.registerCommand("coworkflow.fileChanged", (event) => {
				outputChannel.appendLine(`Coworkflow file changed event: ${event.uri.fsPath} (${event.eventType})`)

				// Trigger CodeLens refresh
				vscode.commands.executeCommand("workbench.action.codeLens.refresh")

				// Update decorations if the changed file is currently active
				const activeEditor = vscode.window.activeTextEditor
				if (activeEditor && activeEditor.document.uri.fsPath === event.uri.fsPath) {
					decorationProvider.updateDecorations(activeEditor.document)
				}
			})

			context.subscriptions.push(fileChangedDisposable)
		}
	} catch (error) {
		outputChannel.appendLine(
			`Failed to initialize Coworkflow module: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	setTimeout(() => {
		loginTip()
	}, 2000)
}

/**
 * Deactivation function for ZGSM
 */
export async function deactivate() {
	// Stop periodic health checks
	ZgsmCodebaseIndexManager.getInstance().stopHealthCheck()

	// ZgsmCodebaseIndexManager.getInstance().stopExistingClient()
	// Clean up IPC connections
	disconnectIPC()
	stopIPCServer()
	// Clean up workspace event monitoring
	workspaceEventMonitor.handleVSCodeClose()

	// Clean up Coworkflow module
	if (coworkflowModule) {
		coworkflowModule.dispose()
		coworkflowModule = null
	}

	// Currently no specific cleanup needed
	loggerDeactivate()
}
