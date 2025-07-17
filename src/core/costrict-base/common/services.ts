/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
// import { getExtensionsLatestVersion } from "./api"
import { configCompletion, configCodeLens, ZGSM_API_KEY, ZGSM_BASE_URL } from "./constant"
import { Logger } from "./log-util"
import { LangSetting, LangSwitch, LangDisables, getLanguageByFilePath } from "./lang-util"
// import { DateFormat, formatTime, formatTimeDifference } from "./util"
import { t } from "../../../i18n"

import { ApiConfiguration } from "../../../shared/api"
import { CompletionClient } from "../completion/CompletionClient"
// import { generateZgsmAuthUrl } from "../../../shared/zgsmAuthUrl"
import { checkExistKey } from "../../../shared/checkExistApiConfig"
import { handleZgsmLogin } from "../../../zgsmAuth/zgsmAuthHandler"
import { ClineProvider } from "../../webview/ClineProvider"

/**
 * Update settings related to [Function Quick Menu]
 */
export function updateCodelensConfig() {
	const config = vscode.workspace.getConfiguration(configCodeLens)
	const disables: LangDisables = config.get("disableLanguages") || {}
	const enabled = config.get("enabled")

	if (enabled) {
		LangSetting.codelensEnabled = true
	} else {
		LangSetting.codelensEnabled = false
	}
	LangSetting.setCodelensDisables(disables)
}

/**
 * Update settings related to [Intelligent Code Completion]
 */
export function updateCompletionConfig() {
	const config = vscode.workspace.getConfiguration(configCompletion)
	const disables: LangDisables = config.get("disableLanguages") || {}
	const enabled = config.get("enabled")

	if (enabled) {
		LangSetting.completionEnabled = true
	} else {
		LangSetting.completionEnabled = false
	}
	LangSetting.setCompletionDisables(disables)
}

/**
 * Initialize language settings
 */
export function initLangSetting() {
	updateCodelensConfig()
	updateCompletionConfig()
	// Save the disables once during initialization, which can write all supported languages of the extension to the configuration items for easy user settings later.
	let config = vscode.workspace.getConfiguration(configCompletion)
	let disables = LangSetting.getCompletionDisables()
	config.update("disableLanguages", disables, vscode.ConfigurationTarget.Global)

	config = vscode.workspace.getConfiguration(configCodeLens)
	disables = LangSetting.getCodelensDisables()
	config.update("disableLanguages", disables, vscode.ConfigurationTarget.Global)
}

/**
 * Definition of showInformationMessage button commands
 */
type ButtonCommand = {
	funcName: string
	setupGlobal: (button: any, value: boolean | LangSwitch) => void
	setupLanguage: (button: any, value: boolean | LangSwitch) => void
}

/**
 * Definition of showInformationMessage buttons
 */
interface ButtonDefined {
	text: string
	lang: string
	value: LangSwitch | boolean
	command: (button: any, value: boolean | LangSwitch) => void
}

/**
 * Create a button array for a specific feature (completion/function quick menu)
 */
function createButtons(lang: string, cmd: ButtonCommand, enabled: boolean, sw: LangSwitch): ButtonDefined[] {
	const buttons: ButtonDefined[] = []
	if (enabled) {
		// Use different disable button text based on feature type
		if (cmd.funcName === t("common:function.completion")) {
			buttons.push({
				text: t("common:button.disable_completion"),
				lang: lang,
				value: false,
				command: cmd.setupGlobal,
			})
		} else {
			buttons.push({
				text: t("common:button.disable_quick_menu"),
				lang: lang,
				value: false,
				command: cmd.setupGlobal,
			})
		}

		if (sw === LangSwitch.Disabled) {
			buttons.push({
				text: t("common:button.enable") + " " + lang + " " + cmd.funcName,
				lang: lang,
				value: LangSwitch.Enabled,
				command: cmd.setupLanguage,
			})
		} else {
			buttons.push({
				text: t("common:button.disable") + " " + lang + " " + cmd.funcName,
				lang: lang,
				value: LangSwitch.Disabled,
				command: cmd.setupLanguage,
			})
		}
	} else {
		// Use different button text based on feature type
		if (cmd.funcName === t("common:function.completion")) {
			buttons.push({
				text: t("common:button.enable_completion"),
				lang: lang,
				value: true,
				command: cmd.setupGlobal,
			})
		} else {
			buttons.push({
				text: t("common:button.enable_quick_menu"),
				lang: lang,
				value: true,
				command: cmd.setupGlobal,
			})
		}
	}
	return buttons
}

/**
 * Get the set of languages that have disabled completion
 */
function getDisableLanguages(config: vscode.WorkspaceConfiguration, name: string = "disableLanguages"): LangDisables {
	let disables: LangDisables = config.get(name) || {}
	// Convert all keys and values to lowercase
	disables = Object.entries(disables).reduce((acc: any, [key, value]) => {
		acc[key.toLowerCase()] = value.toLowerCase()
		return acc
	}, {} as LangDisables)
	return disables
}

/**
 * Set the language feature switch in user settings
 */
function setupLangSwitch(button: any, value: boolean | LangSwitch, config: vscode.WorkspaceConfiguration) {
	const language = (button as ButtonDefined).lang
	if (value === LangSwitch.Unsupported) {
		Logger.info(`The current language ${language} does not support code completion`)
		return
	}
	const disables = getDisableLanguages(config, "disableLanguages")
	if (value === LangSwitch.Disabled) {
		disables[language] = "true"
	} else {
		disables[language] = "false"
	}
	config.update("disableLanguages", disables, vscode.ConfigurationTarget.Global)
}

/**
 * Create a button command with the given configuration
 */
function createButtonCommand(funcName: string, configName: string, enabledSetting: { value: boolean }): ButtonCommand {
	return {
		funcName: t(funcName),
		setupGlobal: (button: any, value: boolean | LangSwitch) => {
			const config = vscode.workspace.getConfiguration(configName)
			config.update("enabled", value as boolean, vscode.ConfigurationTarget.Global)
			enabledSetting.value = value as boolean
		},
		setupLanguage: (button: any, value: boolean | LangSwitch) => {
			const config = vscode.workspace.getConfiguration(configName)
			setupLangSwitch(button, value, config)
		},
	}
}

/**
 * Status bar click forbid callback function
 * @param editor vscode.TextEditor
 */
function statusBarForbidCallback(editor: vscode.TextEditor) {
	const language = getLanguageByFilePath(editor.document.uri.fsPath)
	const completionSwitch = LangSetting.getCompletionDisable(language)
	const codelensSwitch = LangSetting.getCodelensDisable(language)

	let buttons = createButtons(
		language,
		createButtonCommand(t("common:function.quick_menu"), configCodeLens, { value: LangSetting.codelensEnabled }),
		LangSetting.codelensEnabled,
		codelensSwitch,
	)
	buttons = buttons.concat(
		...createButtons(
			language,
			createButtonCommand(t("common:function.completion"), configCompletion, {
				value: LangSetting.completionEnabled,
			}),
			LangSetting.completionEnabled,
			completionSwitch,
		),
	)

	const buttonTexts: string[] = []
	buttons.forEach((button) => {
		buttonTexts.push(button.text)
	})

	vscode.window
		.showInformationMessage(
			t("common:window.infor.enable_disable_function_quick_menu"),
			{ modal: false },
			...buttonTexts,
		)
		.then((button) => {
			for (let i = 0; i < buttons.length; i++) {
				if (button === buttons[i].text) {
					buttons[i].command(buttons[i], buttons[i].value)
				}
			}
		})
}

export function statusBarloginCallback(
	provider?: ClineProvider,
	apiConfiguration?: ApiConfiguration,
	opt?: {
		cb?: () => void
		errorTitle?: string
		btnText?: string
	},
) {
	const reLoginText = opt?.btnText || t("common:window.error.login_again")
	return vscode.window
		.showErrorMessage(opt?.errorTitle || t("common:window.error.failed_to_get_login_info"), reLoginText)
		.then(async (selection) => {
			if (selection !== reLoginText) {
				opt?.cb?.()
				return
			}

			opt?.cb?.()
			// re-login
			handleZgsmLogin(provider, apiConfiguration)
		})
}

/**
 * Status bar click event function
 */
export async function handleStatusBarClick() {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		return
	}

	const provider = CompletionClient.getProvider()

	const { apiConfiguration } = await provider!.getState()

	const context = provider?.contextProxy

	const zgsmApiKey = await context?.getOriginSecrets(ZGSM_API_KEY)

	const globalStateZgsmBaseUrl = await context?.getOriginGlobalState(ZGSM_BASE_URL)

	const isLogin = checkExistKey(apiConfiguration)

	// if isZgsmApiKeyValid is false, user is not authenticated
	const { isZgsmApiKeyValid } = apiConfiguration

	const hasView = provider?.hasView
	const hasValidKey = !isZgsmApiKeyValid

	// 1.open webview but not login
	// 2.not open webview and not login
	// 3.token error
	const needLogin = (!isLogin && hasView) || (!hasView && !zgsmApiKey) || hasValidKey

	if (needLogin) {
		statusBarloginCallback(provider, {
			...apiConfiguration,
			zgsmBaseUrl: hasView
				? apiConfiguration.zgsmBaseUrl || apiConfiguration.zgsmDefaultBaseUrl
				: (globalStateZgsmBaseUrl as string),
		})

		return
	}

	statusBarForbidCallback(editor)
}
