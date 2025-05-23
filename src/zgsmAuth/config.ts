import { ClineProvider } from "../core/webview/ClineProvider"

class DefaultZgsmAuthConfig {
	static URL_TEMPLATES = {
		loginUrlTpl: "/oidc_auth/plugin/login",
		logoutUrlTpl: "/oidc_auth/plugin/logout",
		tokenUrlTpl: "/oidc_auth/plugin/login/status",
	}

	baseUrl: string
	zgsmSite: string
	clientId: string
	clientSecret: string
	tokenUrl: string
	loginUrl: string
	logoutUrl: string
	completionUrl: string
	downloadUrl: string
	// tokenIsValid
	isZgsmApiKeyValid: boolean

	constructor() {
		this.baseUrl = "https://zgsm.sangfor.com"
		this.zgsmSite = "https://zgsm.ai"
		this.clientId = "vscode"
		this.clientSecret = "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l"
		this.completionUrl = "/v2"
		this.downloadUrl = "/downloads"
		this.loginUrl = DefaultZgsmAuthConfig.URL_TEMPLATES.loginUrlTpl
		this.logoutUrl = DefaultZgsmAuthConfig.URL_TEMPLATES.logoutUrlTpl
		this.tokenUrl = DefaultZgsmAuthConfig.URL_TEMPLATES.tokenUrlTpl
		this.isZgsmApiKeyValid = true
	}

	createStateId() {
		return Math.random().toString(36).substring(2) + Date.now().toString(36)
	}

	getAuthUrls(baseUrl = this.baseUrl) {
		const _baseUrl = `${baseUrl}`.trim()

		return {
			tokenUrl: `${_baseUrl || this.baseUrl}${this.tokenUrl}`,
			loginUrl: `${_baseUrl || this.baseUrl}${this.loginUrl}`,
			logoutUrl: `${_baseUrl || this.baseUrl}${this.logoutUrl}`,
		}
	}

	async initProviderConfig(provider: ClineProvider, config: any) {
		await provider?.setValues({
			// zgsmDefaultModelId,
			// zgsmModels,
			// apiModelId: apiConfiguration.apiModelId || zgsmDefaultModelId,
			...config,
			zgsmSite: this.zgsmSite,
			zgsmDefaultBaseUrl: this.baseUrl,
			zgsmLoginUrl: this.loginUrl,
			zgsmLogoutUrl: this.logoutUrl,
			zgsmTokenUrl: this.tokenUrl,
			zgsmCompletionUrl: this.completionUrl,
			zgsmDownloadUrl: this.downloadUrl,
			zgsmClientId: this.clientId,
			zgsmClientSecret: this.clientSecret,
		})

		await provider.postStateToWebview()
	}
}

export const defaultZgsmAuthConfig = new DefaultZgsmAuthConfig()
