# ZGSM Core Migration Guide

## Overview

This document describes the migration of ZGSM extension functionality from the standalone `/zgsm/src/` directory to the integrated `/src/core/zgsm/` structure. The migration consolidates the codebase into a unified architecture while maintaining all existing functionality.

## Migration Summary

### What Changed

- **Directory Structure**: All ZGSM functionality moved from `/zgsm/src/` to `/src/core/zgsm/`
- **Module Organization**: Code reorganized into functional modules (completion, codelens, common, language, i18n, data)
- **Import Paths**: All import statements updated to use new module locations
- **Build Configuration**: TypeScript and build configurations updated for new structure

### What Stayed the Same

- **Functionality**: All features work exactly as before
- **User Experience**: No changes to commands, UI, or behavior
- **Configuration**: Extension settings remain unchanged
- **API**: Public interfaces and exports remain consistent

## New Module Structure

```
src/core/zgsm/
├── completion/          # AI code completion functionality
│   ├── CompletionProvider.ts
│   ├── CompletionClient.ts
│   ├── completionCache.ts
│   ├── completionStatusBar.ts
│   ├── completionScore.ts
│   ├── completionTrace.ts
│   ├── completionPoint.ts
│   ├── completionDataInterface.ts
│   ├── extractingImports.ts
│   └── __tests__/
├── codelens/            # Code lens providers and callbacks
│   ├── CodeLensProvider.ts
│   ├── CodeLensCallbacks.ts
│   └── __tests__/
├── common/              # Shared utilities and services
│   ├── api.ts
│   ├── constant.ts
│   ├── env.ts
│   ├── lang-util.ts
│   ├── log-util.ts
│   ├── services.ts
│   ├── util.ts
│   ├── vscode-util.ts
│   └── __tests__/
├── language/            # Language-specific functionality
│   ├── factory.ts
│   ├── base.ts
│   ├── LangClass.ts
│   ├── javascript.ts
│   ├── typescript.ts
│   ├── python.ts
│   ├── c.ts
│   ├── cpp.ts
│   └── go.ts
├── i18n/                # Internationalization
│   ├── setup.ts
│   ├── index.ts
│   └── locales/
│       ├── en/
│       ├── zh-CN/
│       └── zh-TW/
├── data/                # Static data files
│   └── language-extension-data.json
└── activate.ts          # ZGSM activation logic
```

## Module Responsibilities

### Completion Module (`src/core/zgsm/completion/`)

- **Purpose**: Handles AI-powered code completion functionality
- **Key Components**:
    - `CompletionProvider.ts`: Main VS Code completion provider
    - `CompletionClient.ts`: API client for completion requests
    - `completionCache.ts`: Caching mechanism for performance
    - `completionStatusBar.ts`: Status bar integration
    - `completionScore.ts`: Completion ranking and scoring
    - `completionTrace.ts`: Debugging and tracing utilities

### CodeLens Module (`src/core/zgsm/codelens/`)

- **Purpose**: Provides quick action buttons above function definitions
- **Key Components**:
    - `CodeLensProvider.ts`: VS Code code lens provider implementation
    - `CodeLensCallbacks.ts`: Command callback implementations for quick actions

### Common Module (`src/core/zgsm/common/`)

- **Purpose**: Shared utilities and services used across ZGSM modules
- **Key Components**:
    - `services.ts`: Extension lifecycle and update services
    - `api.ts`: API utilities and HTTP client functions
    - `util.ts`: General utility functions (UUID, hashing, throttling, etc.)
    - `vscode-util.ts`: VS Code integration utilities
    - `constant.ts`: Configuration constants and enums

### Language Module (`src/core/zgsm/language/`)

- **Purpose**: Language-specific functionality and detection
- **Key Components**:
    - `factory.ts`: Language class factory for creating language-specific instances
    - `base.ts`: Base language class with common functionality
    - Individual language classes for JavaScript, TypeScript, Python, C, C++, Go

### I18n Module (`src/core/zgsm/i18n/`)

- **Purpose**: Internationalization support
- **Key Components**:
    - `setup.ts`: I18n initialization and configuration
    - `locales/`: Translation files for supported languages

### Data Module (`src/core/zgsm/data/`)

- **Purpose**: Static data files and resources
- **Key Components**:
    - `language-extension-data.json`: Language-to-file-extension mappings

## Import Path Changes

### Before Migration

```typescript
// Old import paths
import { CompletionProvider } from "../../../zgsm/src/codeCompletion/completionProvider"
import { MyCodeLensProvider } from "../../../zgsm/src/codeLens/codeLensProvider"
import { getLanguageClass } from "../../../zgsm/src/langClass/factory"
import { statusBarloginCallback } from "../../../zgsm/src/common/services"
```

### After Migration

```typescript
// New import paths
import { CompletionProvider } from "../core/zgsm/completion/CompletionProvider"
import { MyCodeLensProvider } from "../core/zgsm/codelens/CodeLensProvider"
import { getLanguageClass } from "../core/zgsm/language/factory"
import { statusBarloginCallback } from "../core/zgsm/common/services"
```

### TypeScript Path Mapping

The following path aliases are configured in `tsconfig.json`:

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

## Configuration Changes

### TypeScript Configuration

- Updated `tsconfig.json` to include new module paths
- Removed references to old `/zgsm/src/` directory
- Added path mapping for cleaner imports

### Jest Configuration

- Updated test roots to exclude old directory
- Test files moved to respective module `__tests__/` directories

### Build Configuration

- No changes required to build scripts
- Extension continues to build from `src/` directory as before

## Testing

### Test Organization

Tests are now organized alongside their respective modules:

```
src/core/zgsm/
├── completion/__tests__/
│   ├── CompletionProvider.test.ts
│   ├── CompletionClient.test.ts
│   └── ...
├── codelens/__tests__/
│   ├── CodeLensProvider.test.ts
│   └── CodeLensCallbacks.test.ts
├── common/__tests__/
│   ├── api.test.ts
│   ├── services.test.ts
│   └── util.test.ts
└── __tests__/
    └── integration/
        ├── extension-activation.test.ts
        ├── provider-integration.test.ts
        └── command-registration.test.ts
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific module tests
npm test -- --testPathPattern=completion
npm test -- --testPathPattern=codelens
npm test -- --testPathPattern=common
```

## Migration Benefits

### Improved Organization

- **Modular Structure**: Related functionality grouped together
- **Clear Boundaries**: Each module has well-defined responsibilities
- **Better Maintainability**: Easier to locate and modify specific features

### Unified Codebase

- **Single Source Tree**: All code under `/src/` directory
- **Consistent Build Process**: Unified build and test configuration
- **Simplified Dependencies**: Cleaner import relationships

### Enhanced Developer Experience

- **Better IDE Support**: Improved IntelliSense and navigation
- **Clearer Architecture**: Module boundaries make system easier to understand
- **Easier Testing**: Tests co-located with implementation

## Troubleshooting

### Common Issues

#### Import Resolution Errors

If you encounter import resolution errors:

1. Check that TypeScript path mapping is correctly configured
2. Verify import paths use the new module structure
3. Ensure VS Code TypeScript service is restarted

#### Test Failures

If tests fail after migration:

1. Verify test files are in correct `__tests__/` directories
2. Check that mock imports use new paths
3. Update any hardcoded paths in test setup

#### Build Errors

If build fails:

1. Run `npm run clean` to clear old build artifacts
2. Verify `tsconfig.json` includes new paths
3. Check that all imports are updated to new structure

### Getting Help

If you encounter issues not covered in this guide:

1. Check the GitHub issues for similar problems
2. Verify all import paths have been updated
3. Ensure TypeScript configuration is correct
4. Contact the development team for assistance

## Future Development

### Adding New Features

When adding new ZGSM functionality:

1. Choose the appropriate module (completion, codelens, common, etc.)
2. Follow the established directory structure
3. Add tests in the module's `__tests__/` directory
4. Update module exports as needed

### Module Guidelines

- Keep modules focused on single responsibilities
- Use the common module for shared utilities
- Follow established naming conventions
- Maintain clear import/export patterns

### Best Practices

- Use TypeScript path aliases for cleaner imports
- Co-locate tests with implementation
- Document module responsibilities clearly
- Maintain backward compatibility for public APIs

---

This migration represents a significant improvement in code organization while maintaining full backward compatibility. The new structure provides a solid foundation for future development and maintenance of the ZGSM extension.
