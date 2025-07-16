/**
 * ZGSM Data Module
 *
 * Static resources and data files including:
 * - Language extension mappings
 * - Configuration data
 * - Static assets
 */

// Import JSON data using require for better TypeScript compatibility
const languageExtensionData = require("./language-extension-data.json")

// Export language extension data
export { languageExtensionData }

// Type definition for language extension data
export interface LanguageExtensionMapping {
	file_extensions: string[]
	language: string
}

export type LanguageExtensionData = LanguageExtensionMapping[]
