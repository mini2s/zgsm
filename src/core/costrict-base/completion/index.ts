/**
 * ZGSM Completion Module
 *
 * Handles AI-powered code completion functionality including:
 * - Completion providers
 * - API clients
 * - Caching mechanisms
 * - Status bar integration
 * - Scoring and ranking
 */

// Main completion provider exports
export * from "./types"
// Export specific items from completionDataInterface to avoid conflicts
export type {
	CompletionDocumentInformation,
	CompletionFeedback,
	CompletionRequirement,
} from "./completionDataInterface"

export {
	CompletionAcception,
	getAcceptionString,
	CompletionCorrection,
	getCorrectionString,
	CompletionMode,
} from "./completionDataInterface"

// Core completion classes
export { AICompletionProvider } from "./CompletionProvider"
export { CompletionClient } from "./CompletionClient"
export { CompletionPoint, calcKey } from "./completionPoint"

// Utility classes
export { CompletionCache } from "./completionCache"
export { CompletionStatusBar } from "./completionStatusBar"
export { getHideScoreArgs } from "./completionScore"
export { CompletionTrace } from "./completionTrace"
export { getDependencyImports } from "./extractingImports"

// Command exports
export * from "./completionCommands"
