/**
 * ZGSM Language Module
 *
 * Language-specific functionality and detection including:
 * - Language class factory
 * - Language-specific settings
 * - Language detection utilities
 * - Individual language implementations
 */

export type { LangClass } from "./LangClass"
export { BaseLangClass, LangName } from "./base"
export { getLanguageClass } from "./factory"
export * from "./classes"
