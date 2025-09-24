import { useCallback } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"
import { TelemetryEventName } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"
import { telemetryClient } from "@src/utils/TelemetryClient"
import { useEvent } from "react-use"
import { ExtensionMessage } from "@roo/ExtensionMessage"
import { useZgsmUserInfo } from "@src/hooks/useZgsmUserInfo"

type AccountViewProps = {
	apiConfiguration?: ProviderSettings
	onDone: () => void
}

export const ZgsmAccountView = ({ apiConfiguration, onDone }: AccountViewProps) => {
	const { t } = useAppTranslation()
	const { userInfo, logoPic, hash } = useZgsmUserInfo(apiConfiguration?.zgsmAccessToken)
	console.log("New Credit hash: ", hash)
	const rooLogoUri = (window as any).COSTRICT_BASE_URI + "/logo.svg"

	const handleConnectClick = () => {
		// Send telemetry for account connect action
		telemetryClient.capture(TelemetryEventName.ACCOUNT_CONNECT_CLICKED)

		vscode.postMessage({ type: "zgsmLogin", apiConfiguration })
	}

	const handleLogoutClick = () => {
		// Send telemetry for account logout action
		telemetryClient.capture(TelemetryEventName.ACCOUNT_LOGOUT_CLICKED)
		vscode.postMessage({ type: "zgsmLogout" })
	}

	const handleVisitCloudWebsite = () => {
		// Send telemetry for cloud website visit
		telemetryClient.capture(TelemetryEventName.ACCOUNT_CONNECT_CLICKED)
		const cloudUrl = `${apiConfiguration?.zgsmBaseUrl?.trim() || "https://zgsm.sangfor.com"}/credit/manager?state=${hash}`

		vscode.postMessage({ type: "openExternal", url: cloudUrl })
	}

	const onMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			switch (message.type) {
				case "zgsmLogined": {
					onDone()
					break
				}
			}
		},
		[onDone],
	)

	useEvent("message", onMessage)

	return (
		<div className="flex flex-col h-full p-4 bg-vscode-editor-background">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-xl font-medium text-vscode-foreground">{t("cloud:title")}</h1>
				<VSCodeButton appearance="primary" onClick={onDone}>
					{t("settings:common.done")}
				</VSCodeButton>
			</div>
			{apiConfiguration?.zgsmAccessToken ? (
				<>
					{userInfo && (
						<div className="flex flex-col items-center mb-6">
							<div className="w-16 h-16 mb-3 rounded-full overflow-hidden">
								{logoPic ? (
									<img
										src={logoPic}
										alt={t("account:profilePicture")}
										className="w-full h-full object-cover"
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center bg-vscode-button-background text-vscode-button-foreground text-xl">
										{userInfo?.name?.charAt(0) || userInfo?.email?.charAt(0) || "?"}
									</div>
								)}
							</div>
							{userInfo.name && (
								<h2 className="text-lg font-medium text-vscode-foreground mb-0">{userInfo.name}</h2>
							)}
							{userInfo?.email && (
								<p className="text-sm text-vscode-descriptionForeground">{userInfo?.email}</p>
							)}
							{userInfo?.organizationName && (
								<div className="flex items-center gap-2 text-sm text-vscode-descriptionForeground">
									{userInfo.organizationImageUrl && (
										<img
											src={userInfo.organizationImageUrl}
											alt={userInfo.organizationName}
											className="w-4 h-4 rounded object-cover"
										/>
									)}
									<span>{userInfo.organizationName}</span>
								</div>
							)}
						</div>
					)}
					<div className="flex flex-col gap-2 mt-4">
						<VSCodeButton appearance="primary" onClick={handleVisitCloudWebsite} className="w-full">
							{t("account:visitCloudWebsite")}
						</VSCodeButton>
						<div className="flex gap-2 mt-4">
							<VSCodeButton appearance="secondary" onClick={handleLogoutClick} className="w-[50%]">
								{t("cloud:logOut")}
							</VSCodeButton>
							<VSCodeButton appearance="secondary" onClick={handleConnectClick} className="w-[50%]">
								{t("settings:providers.getZgsmApiKeyAgain")}
							</VSCodeButton>
						</div>
					</div>
				</>
			) : (
				<>
					<div className="flex flex-col items-center mb-1 text-center">
						<div className="w-16 h-16 mb-1 flex items-center justify-center">
							<div
								className="w-12 h-12 bg-vscode-foreground"
								style={{
									WebkitMaskImage: `url('${rooLogoUri}')`,
									WebkitMaskRepeat: "no-repeat",
									WebkitMaskSize: "contain",
									maskImage: `url('${rooLogoUri}')`,
									maskRepeat: "no-repeat",
									maskSize: "contain",
								}}>
								<img src={rooLogoUri} alt="Costrict logo" className="w-12 h-12 opacity-0" />
							</div>
						</div>
					</div>

					<div className="flex flex-col mb-6 text-center">
						<h2 className="text-lg font-medium text-vscode-foreground mb-2">{t("account:signIn")}</h2>
					</div>

					<div className="flex flex-col gap-4">
						<VSCodeButton appearance="primary" onClick={handleConnectClick} className="w-full">
							{t("account:cloudBenefitsTitle")}
						</VSCodeButton>
					</div>
				</>
			)}
		</div>
	)
}
