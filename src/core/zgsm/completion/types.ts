/**
 * TypeScript interfaces and types for the completion module
 */

import {
	TextDocument,
	Position,
	InlineCompletionContext,
	CancellationToken,
	ProviderResult,
	InlineCompletionList,
} from "vscode"

export interface ICompletionProvider {
	provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken,
	): ProviderResult<InlineCompletionList>
}

export interface CompletionPrompt {
	text: string
	language: string
	context: CompletionContext
}

export interface CompletionContext {
	prefix: string
	suffix: string
	filename: string
	language: string
}

export interface CompletionResponse {
	text: string
	confidence: number
	metadata: CompletionMetadata
}

export interface CompletionMetadata {
	model: string
	tokens: number
	latency: number
}

export interface ICompletionClient {
	requestCompletion(prompt: CompletionPrompt): Promise<CompletionResponse>
}
