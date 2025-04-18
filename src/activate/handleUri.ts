import * as vscode from "vscode"

import { ClineProvider } from "../core/webview/ClineProvider"
import { handleZgsmAuthCallback } from "../auth/zgsmAuthHandler"

export const handleUri = async (uri: vscode.Uri) => {
	const path = uri.path
	const query = new URLSearchParams(uri.query.replace(/\+/g, "%2B"))
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		return
	}

	switch (path) {
		case "/glama": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleGlamaCallback(code)
			}
			break
		}
		case "/openrouter": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleOpenRouterCallback(code)
			}
			break
		}
		case "/requesty": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleRequestyCallback(code)
			}
			break
		}
		case "/zgsm": {
			const code = query.get("code")
			const state = query.get("state")
			if (code && state) {
				// 使用独立函数处理 ZGSM 认证回调
				await handleZgsmAuthCallback(code, state, visibleProvider);
			}
			break;
		}
		default:
			break
	}
}
