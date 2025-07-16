# Design Document

## Overview

This design outlines the migration of ZGSM extension functionality from `/zgsm/src/` to `/src/core/zgsm/` and the reorganization of the codebase into well-defined functional modules. The migration will maintain all existing functionality while creating a more maintainable and organized architecture.

## Architecture

### Current Structure

```
zgsm/
├── src/
│   ├── codeCompletion/     # AI code completion functionality
│   ├── codeLens/           # Code lens providers for quick actions
│   ├── common/             # Shared utilities and services
│   ├── core/               # Core tools (minimal)
│   ├── data/               # Static data files
│   ├── i18n/               # Internationalization
│   ├── langClass/          # Language-specific classes
│   ├── test/               # Test files
│   └── extension.ts        # Extension entry point
```

### Target Structure

```
src/
├── core/
│   └── zgsm/
│       ├── completion/     # Code completion module
│       ├── codelens/       # Code lens module
│       ├── common/         # Shared utilities
│       ├── i18n/           # Internationalization
│       ├── language/       # Language support
│       ├── data/           # Static resources
│       └── index.ts        # ZGSM module entry point
└── extension.ts            # Updated main extension entry
```

## Components and Interfaces

### 1. Completion Module (`src/core/zgsm/completion/`)

**Purpose:** Handles AI-powered code completion functionality

**Components:**

- `CompletionProvider.ts` - Main completion provider implementation
- `CompletionClient.ts` - API client for completion requests
- `CompletionCache.ts` - Caching mechanism for completions
- `CompletionStatusBar.ts` - Status bar integration
- `CompletionScore.ts` - Completion scoring and ranking
- `CompletionTrace.ts` - Debugging and tracing utilities
- `types.ts` - TypeScript interfaces and types

**Key Interfaces:**

```typescript
interface ICompletionProvider {
	provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken,
	): ProviderResult<InlineCompletionList>
}

interface ICompletionClient {
	requestCompletion(prompt: CompletionPrompt): Promise<CompletionResponse>
}
```

### 2. CodeLens Module (`src/core/zgsm/codelens/`)

**Purpose:** Provides quick action buttons above function definitions

**Components:**

- `CodeLensProvider.ts` - Main code lens provider
- `CodeLensCallbacks.ts` - Command callback implementations
- `types.ts` - CodeLens-specific types

**Key Interfaces:**

```typescript
interface ICodeLensProvider {
	provideCodeLenses(document: TextDocument, token: CancellationToken): ProviderResult<CodeLens[]>
}
```

### 3. Common Module (`src/core/zgsm/common/`)

**Purpose:** Shared utilities and services used across ZGSM modules

**Components:**

- `services.ts` - Extension lifecycle and update services
- `constants.ts` - Configuration constants
- `api.ts` - API utilities
- `vscode-util.ts` - VS Code integration utilities
- `log-util.ts` - Logging utilities
- `util.ts` - General utility functions

### 4. Language Module (`src/core/zgsm/language/`)

**Purpose:** Language-specific functionality and detection

**Components:**

- `factory.ts` - Language class factory
- `settings.ts` - Language-specific settings
- `detection.ts` - Language detection utilities
- `classes/` - Individual language implementations

### 5. I18n Module (`src/core/zgsm/i18n/`)

**Purpose:** Internationalization support

**Components:**

- `setup.ts` - I18n initialization
- `types.ts` - I18n type definitions
- `locales/` - Translation files

## Data Models

### Configuration Model

```typescript
interface ZgsmConfiguration {
	completion: {
		enabled: boolean
		model: string
		maxTokens: number
		temperature: number
	}
	codelens: {
		enabled: boolean
		quickCommands: Record<string, boolean>
	}
	language: {
		settings: Record<string, LanguageSetting>
	}
}
```

### Completion Models

```typescript
interface CompletionRequest {
	prompt: string
	language: string
	context: CompletionContext
	maxTokens: number
}

interface CompletionResponse {
	text: string
	confidence: number
	metadata: CompletionMetadata
}
```

## Error Handling

### Migration Error Handling

- **Import Resolution Errors:** Comprehensive path mapping and validation
- **Module Loading Errors:** Graceful fallbacks and error reporting
- **Configuration Errors:** Migration scripts for configuration updates

### Runtime Error Handling

- **API Errors:** Retry mechanisms and user notifications
- **Provider Errors:** Fallback providers and error recovery
- **Performance Errors:** Timeout handling and resource management

## Testing Strategy

### Unit Testing

- **Module Isolation:** Each module tested independently
- **Mock Dependencies:** External dependencies mocked for testing
- **Coverage Requirements:** Minimum 80% code coverage for critical paths

### Integration Testing

- **Extension Loading:** Verify extension activates correctly
- **Command Registration:** Test all commands register properly
- **Provider Integration:** Test VS Code provider integrations

### Migration Testing

- **Before/After Comparison:** Functional equivalence testing
- **Performance Testing:** Ensure no performance regression
- **User Workflow Testing:** End-to-end user scenarios

### Test Structure

```
src/core/zgsm/
├── completion/__tests__/
├── codelens/__tests__/
├── common/__tests__/
├── language/__tests__/
└── i18n/__tests__/
```

## Migration Strategy

### Phase 1: Structure Setup

1. Create new directory structure in `src/core/zgsm/`
2. Set up module entry points and exports
3. Update TypeScript configuration for new paths

### Phase 2: Module Migration

1. Migrate completion module with updated imports
2. Migrate codelens module with updated imports
3. Migrate common utilities and services
4. Migrate language support and i18n

### Phase 3: Integration

1. Update main extension.ts to use new modules
2. Update package.json and build configuration
3. Update all import paths throughout codebase

### Phase 4: Cleanup

1. Remove old zgsm directory structure
2. Update documentation and README files
3. Verify all functionality works correctly

## Build and Configuration Updates

### TypeScript Configuration

```json
{
	"compilerOptions": {
		"paths": {
			"@zgsm/*": ["src/core/zgsm/*"],
			"@zgsm/completion": ["src/core/zgsm/completion"],
			"@zgsm/codelens": ["src/core/zgsm/codelens"],
			"@zgsm/common": ["src/core/zgsm/common"]
		}
	}
}
```

### Package.json Updates

- Update main entry point to reference new structure
- Update build scripts to compile from new locations
- Update test scripts to include new test directories

### VS Code Extension Manifest

- Verify activation events still work
- Update any hardcoded paths in contributes section
- Ensure all commands and providers are properly registered
