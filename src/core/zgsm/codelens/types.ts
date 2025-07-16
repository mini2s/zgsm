/**
 * TypeScript interfaces and types for the codelens module
 */

import { TextDocument, CancellationToken, ProviderResult, CodeLens } from "vscode"

export interface ICodeLensProvider {
	provideCodeLenses(document: TextDocument, token: CancellationToken): ProviderResult<CodeLens[]>
}

export interface CodeLensCommand {
	title: string
	command: string
	arguments?: any[]
}

export interface CodeLensCallback {
	(args: any[]): void | Promise<void>
}
