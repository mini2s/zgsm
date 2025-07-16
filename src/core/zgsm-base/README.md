# ZGSM Core Module Documentation

## Overview

The ZGSM (Zhuge Shenma) core module provides AI-powered coding assistance features including code completion, code lens actions, and language-specific functionality. This module is organized into focused sub-modules that handle specific aspects of the AI coding experience.

## Module Structure

```
src/core/zgsm/
├── completion/          # AI code completion functionality
├── codelens/           # Quick action code lens providers
├── common/             # Shared utilities and services
├── language/           # Language-specific support
├── i18n/               # Internationalization
├── data/               # Static data and configuration
├── activate.ts         # Module activation logic
└── README.md           # This documentation
```

## Module Details

### Completion Module (`completion/`)

**Purpose**: Provides AI-powered inline code completion functionality.

**Key Components**:

- `CompletionProvider.ts` - VS Code inline completion provider
- `CompletionClient.ts` - API client for completion requests
- `completionCache.ts` - Caching system for performance optimization
- `completionStatusBar.ts` - Status bar integration and feedback
- `completionScore.ts` - Completion ranking and scoring algorithms
- `completionTrace.ts` - Debug tracing and logging utilities
- `completionPoint.ts` - Completion trigger point detection
- `completionDataInterface.ts` - Type definitions and interfaces
- `extractingImports.ts` - Import statement extraction utilities

**Features**:

- Context-aware code suggestions
- Multi-language support
- Caching for improved performance
- Real-time status feedback
- Configurable completion triggers

### CodeLens Module (`codelens/`)

**Purpose**: Provides quick action buttons above function definitions and code blocks.

**Key Components**:

- `CodeLensProvider.ts` - VS Code code lens provider implementation
- `CodeLensCallbacks.ts` - Command handlers for code lens actions

**Supported Actions**:

- Explain code functionality
- Add comments to functions
- Generate unit tests
- Perform code review
- Add debug logging
- Enhance error handling
- Simplify complex code
- Optimize performance

### Common Module (`common/`)

**Purpose**: Shared utilities, services, and constants used across ZGSM modules.

**Key Components**:

- `api.ts` - HTTP client utilities and API helpers
- `constant.ts` - Configuration constants and enums
- `env.ts` - Environment detection and configuration
- `lang-util.ts` - Language detection and utility functions
- `log-util.ts` - Logging utilities and debug helpers
- `services.ts` - Extension lifecycle and update services
- `util.ts` - General utility functions (UUID, hashing, throttling, etc.)
- `vscode-util.ts` - VS Code API integration utilities

**Utilities Provided**:

- HTTP request handling
- Language detection
- File system operations
- Logging and debugging
- Extension state management
- Performance utilities (debounce, throttle)

### Language Module (`language/`)

**Purpose**: Language-specific functionality and detection.

**Key Components**:

- `factory.ts` - Language class factory for creating instances
- `base.ts` - Base language class with common functionality
- `LangClass.ts` - Language class registry and management
- Individual language implementations:
    - `javascript.ts` - JavaScript-specific functionality
    - `typescript.ts` - TypeScript-specific functionality
    - `python.ts` - Python-specific functionality
    - `c.ts` - C language support
    - `cpp.ts` - C++ language support
    - `go.ts` - Go language support

**Features**:

- Automatic language detection
- Language-specific code analysis
- Syntax highlighting support
- Language-specific completion contexts

### I18n Module (`i18n/`)

**Purpose**: Internationalization and localization support.

**Key Components**:

- `setup.ts` - I18n initialization and configuration
- `index.ts` - Main i18n exports and utilities
- `locales/` - Translation files directory
    - `en/common.json` - English translations
    - `zh-CN/common.json` - Simplified Chinese translations
    - `zh-TW/common.json` - Traditional Chinese translations

**Features**:

- Multi-language UI support
- Dynamic language switching
- Fallback language handling
- Translation key management

### Data Module (`data/`)

**Purpose**: Static data files and configuration resources.

**Key Components**:

- `language-extension-data.json` - File extension to language mappings

**Data Provided**:

- Language detection mappings
- File extension associations
- Configuration defaults

## Usage Examples

### Using Completion Provider

```typescript
import { CompletionProvider } from "@zgsm/completion"
import * as vscode from "vscode"

// Register the completion provider
const provider = new CompletionProvider()
const disposable = vscode.languages.registerInlineCompletionItemProvider({ scheme: "file" }, provider)
```

### Using Language Detection

```typescript
import { getLanguageClass } from "@zgsm/language"

// Get language-specific functionality
const langClass = getLanguageClass("typescript")
const isFunction = langClass.isFunctionDeclaration(codeText)
```

### Using Common Utilities

```typescript
import { throttle, computeHash } from "@zgsm/common"

// Throttle function calls
const throttledFunction = throttle(myFunction, 300)

// Compute content hash
const hash = computeHash(fileContent)
```

## Configuration

### TypeScript Path Mapping

The module uses TypeScript path mapping for clean imports:

```json
{
	"compilerOptions": {
		"paths": {
			"@zgsm/*": ["src/core/zgsm/*"],
			"@zgsm/completion": ["src/core/zgsm/completion"],
			"@zgsm/codelens": ["src/core/zgsm/codelens"],
			"@zgsm/common": ["src/core/zgsm/common"],
			"@zgsm/language": ["src/core/zgsm/language"],
			"@zgsm/i18n": ["src/core/zgsm/i18n"],
			"@zgsm/data": ["src/core/zgsm/data"]
		}
	}
}
```

### Extension Settings

The module respects the following VS Code settings:

- `IntelligentCodeCompletion.enabled` - Enable/disable code completion
- `IntelligentCodeCompletion.betaMode` - Enable beta features
- `IntelligentCodeCompletion.inlineCompletion` - Enable inline completions
- `FunctionQuickCommands.enabled` - Enable/disable code lens actions
- `FunctionQuickCommands.quickCommandButtons` - Configure available actions

## Testing

### Test Organization

Tests are organized alongside their respective modules:

```
src/core/zgsm/
├── completion/__tests__/
├── codelens/__tests__/
├── common/__tests__/
└── __tests__/integration/
```

### Running Tests

```bash
# Run all ZGSM tests
npm test -- --testPathPattern=zgsm

# Run specific module tests
npm test -- --testPathPattern=completion
npm test -- --testPathPattern=codelens
npm test -- --testPathPattern=common
```

## Development Guidelines

### Adding New Features

1. **Choose the appropriate module** based on functionality
2. **Follow established patterns** for file organization
3. **Add comprehensive tests** in the module's `__tests__/` directory
4. **Update module exports** in index files
5. **Document new functionality** in this README

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Use proper error handling and logging
- Follow the established module boundaries

### Module Boundaries

- **Completion**: Only code completion related functionality
- **CodeLens**: Only code lens and quick actions
- **Common**: Only shared utilities used by multiple modules
- **Language**: Only language-specific functionality
- **I18n**: Only internationalization concerns
- **Data**: Only static data and configuration

## API Reference

### Completion Module

```typescript
// Main completion provider
class CompletionProvider implements vscode.InlineCompletionItemProvider {
	provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken,
	): Promise<vscode.InlineCompletionList>
}

// Completion client for API requests
class CompletionClient {
	requestCompletion(prompt: string): Promise<CompletionResponse>
}
```

### CodeLens Module

```typescript
// Code lens provider
class MyCodeLensProvider implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[]
}
```

### Language Module

```typescript
// Language factory
function getLanguageClass(language: string): LanguageClass

// Base language class
abstract class BaseLanguageClass {
	abstract isFunctionDeclaration(text: string): boolean
	abstract extractFunctionName(text: string): string
}
```

## Troubleshooting

### Common Issues

1. **Import Resolution Errors**

    - Verify TypeScript path mapping is configured
    - Check that imports use the correct module paths
    - Restart TypeScript service in VS Code

2. **Module Not Found Errors**

    - Ensure all modules have proper index.ts exports
    - Verify file paths are correct
    - Check for circular dependencies

3. **Test Failures**
    - Verify test files are in correct `__tests__/` directories
    - Check that mocks use updated import paths
    - Ensure test setup is correct

### Getting Help

- Check the [Migration Guide](../../../docs/ZGSM_MIGRATION_GUIDE.md) for detailed information
- Review existing code for patterns and examples
- Contact the development team for architecture questions

## Future Enhancements

### Planned Features

- Enhanced language support for more programming languages
- Improved completion accuracy with better context analysis
- Additional code lens actions based on user feedback
- Performance optimizations for large codebases

### Architecture Improvements

- Plugin system for extensible language support
- Better separation of concerns between modules
- Enhanced testing infrastructure
- Improved error handling and recovery

---

This module represents the core AI coding assistance functionality of the Costrict extension. It provides a solid foundation for intelligent code completion, quick actions, and language-specific features while maintaining clean architecture and good separation of concerns.
