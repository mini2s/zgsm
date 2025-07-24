import { ClineProvider } from "../core/webview/ClineProvider"
import { ApiConfiguration } from "../shared/api"
import { ZgsmLoginManager } from "./zgsmLoginManager"

/**
 * Handle Costrict OAuth message
 * @param authUrl Authentication URL
 * @param apiConfiguration API configuration
 * @param provider ClineProvider instance
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleZgsmLogin(provider?: ClineProvider, apiConfiguration?: ApiConfiguration): Promise<void> {
	// Open authentication link
	// await vscode.env.openExternal(vscode.Uri.parse(authUrl))

	// Save apiConfiguration for use after successful authentication
	if (apiConfiguration) {
		await provider?.upsertProviderProfile((await provider.getState()).currentApiConfigName, apiConfiguration)
	}

	await ZgsmLoginManager.getInstance().startLogin()

	// Send message to webview to notify that authentication has started
	// provider.postMessageToWebview({ type: "state", state: await provider.getStateToPostToWebview() })
}
