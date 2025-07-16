/**
 * ZGSM Core Module
 *
 * This module provides the core ZGSM functionality including:
 * - Code completion
 * - Code lens providers
 * - Language support
 * - Internationalization
 * - Common utilities
 */

// Re-export all modules
export * from "./completion"
export * from "./codelens"
export * from "./common"
export * from "./language"
export * from "./i18n"

// Export data as a namespace to avoid conflicts
export * as ZgsmData from "./data"

// Export activation functions
export * from "./activate"
