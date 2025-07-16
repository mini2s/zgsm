/**
 * Mock utilities for completion module tests
 */
import { Position, TextDocument, ExtensionContext, CancellationToken } from "vscode"
import { CompletionPoint } from "../../completionPoint"
import { CompletionDocumentInformation, CompletionPrompt } from "../../completionDataInterface"
import { ClineProvider } from "../../../../webview/ClineProvider"

/**
 * Creates a mock TextDocument for testing
 */
export function createMockTextDocument(overrides: Partial<TextDocument> = {}): jest.Mocked<TextDocument> {
	return {
		uri: { fsPath: "/test/file.ts" },
		fileName: "/test/file.ts",
		isUntitled: false,
		languageId: "typescript",
		version: 1,
		isDirty: false,
		isClosed: false,
		lineCount: 10,
		getText: jest.fn().mockReturnValue("mock document text"),
		getWordRangeAtPosition: jest.fn(),
		lineAt: jest.fn().mockReturnValue({
			text: "const test = value",
			range: { start: new Position(0, 0), end: new Position(0, 18) },
			rangeIncludingLineBreak: { start: new Position(0, 0), end: new Position(1, 0) },
			firstNonWhitespaceCharacterIndex: 0,
			isEmptyOrWhitespace: false,
		}),
		offsetAt: jest.fn(),
		positionAt: jest.fn(),
		validateRange: jest.fn(),
		validatePosition: jest.fn(),
		save: jest.fn(),
		eol: 1,
		...overrides,
	} as any
}

/**
 * Creates a mock ExtensionContext for testing
 */
export function createMockExtensionContext(overrides: Partial<ExtensionContext> = {}): jest.Mocked<ExtensionContext> {
	return {
		subscriptions: [],
		workspaceState: {
			get: jest.fn(),
			update: jest.fn(),
			keys: jest.fn().mockReturnValue([]),
		},
		globalState: {
			get: jest.fn(),
			update: jest.fn(),
			keys: jest.fn().mockReturnValue([]),
			setKeysForSync: jest.fn(),
		},
		secrets: {
			get: jest.fn(),
			store: jest.fn(),
			delete: jest.fn(),
			onDidChange: jest.fn(),
		},
		extensionUri: { scheme: "file", path: "/test/extension" } as any,
		extensionPath: "/test/extension",
		environmentVariableCollection: {} as any,
		asAbsolutePath: jest.fn(),
		storageUri: undefined,
		storagePath: undefined,
		globalStorageUri: { scheme: "file", path: "/test/global" } as any,
		globalStoragePath: "/test/global",
		logUri: { scheme: "file", path: "/test/logs" } as any,
		logPath: "/test/logs",
		extensionMode: 1,
		extension: {} as any,
		...overrides,
	} as any
}

/**
 * Creates a mock ClineProvider for testing
 */
export function createMockClineProvider(overrides: Partial<ClineProvider> = {}): jest.Mocked<ClineProvider> {
	return {
		contextProxy: {
			getOriginSecrets: jest.fn().mockResolvedValue("test-api-key"),
			getGlobalState: jest.fn().mockResolvedValue("https://test.com"),
		},
		hasView: true,
		getState: jest.fn().mockResolvedValue({
			apiConfiguration: {
				zgsmApiKey: "test-key",
				zgsmBaseUrl: "https://test.com",
				zgsmCompletionUrl: "/completion",
			},
		}),
		setValue: jest.fn(),
		postMessageToWebview: jest.fn(),
		getStateToPostToWebview: jest.fn().mockResolvedValue({}),
		...overrides,
	} as any
}

/**
 * Creates a mock CancellationToken for testing
 */
export function createMockCancellationToken(cancelled = false): jest.Mocked<CancellationToken> {
	return {
		isCancellationRequested: cancelled,
		onCancellationRequested: jest.fn(),
	}
}

/**
 * Creates a mock CompletionPoint for testing
 */
export function createMockCompletionPoint(overrides: Partial<CompletionPoint> = {}): jest.Mocked<CompletionPoint> {
	const mockDoc: CompletionDocumentInformation = {
		fpath: "/test/file.ts",
		language: "typescript",
	}

	const mockPrompt: CompletionPrompt = {
		prefix: "const test = ",
		suffix: "\nrest of code",
		cursor_line_prefix: "const test = ",
		cursor_line_suffix: "",
	}

	return {
		id: "test-completion-id",
		doc: mockDoc,
		pos: new Position(5, 10),
		triggerMode: "auto",
		createTime: Date.now(),
		parentId: undefined,
		getPrompt: jest.fn().mockReturnValue(mockPrompt),
		getContent: jest.fn().mockReturnValue(""),
		getAcception: jest.fn().mockReturnValue("None"),
		getKey: jest.fn().mockReturnValue("/test/file.ts:5:10"),
		linePrefix: "const test = ",
		fetched: jest.fn(),
		accept: jest.fn(),
		reject: jest.fn(),
		cancel: jest.fn(),
		submit: jest.fn(),
		changed: jest.fn(),
		unchanged: jest.fn(),
		isSamePosition: jest.fn(),
		isStrictSamePosition: jest.fn(),
		isSameLine: jest.fn(),
		isSameAsDoc: jest.fn(),
		...overrides,
	} as any
}

/**
 * Creates a mock completion response for testing
 */
export function createMockCompletionResponse(text = "completion text", id = "response-id") {
	return {
		id,
		choices: [
			{
				text: text.trim(),
				index: 0,
				logprobs: null,
				finish_reason: "stop",
			},
		],
		created: Date.now(),
		model: "test-model",
		object: "text_completion",
		usage: {
			prompt_tokens: 10,
			completion_tokens: 5,
			total_tokens: 15,
		},
	}
}

/**
 * Sets up common mocks for completion tests
 */
export function setupCompletionMocks() {
	// Mock workspace configuration
	const mockWorkspaceConfig = {
		get: jest.fn().mockReturnValue(true),
	}

	// Mock vscode workspace
	const mockWorkspace = {
		getConfiguration: jest.fn().mockReturnValue(mockWorkspaceConfig),
		name: "test-workspace",
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" },
				name: "test-workspace",
				index: 0,
			},
		],
		onDidChangeTextDocument: jest.fn(),
		asRelativePath: jest.fn().mockReturnValue("file.ts"),
	}

	// Mock vscode window
	const mockWindow = {
		activeTextEditor: {
			document: createMockTextDocument(),
			selection: { start: new Position(0, 0), end: new Position(0, 0) },
		},
		createStatusBarItem: jest.fn().mockReturnValue({
			text: "",
			tooltip: "",
			color: undefined,
			show: jest.fn(),
			hide: jest.fn(),
			dispose: jest.fn(),
		}),
	}

	return {
		workspace: mockWorkspace,
		window: mockWindow,
		workspaceConfig: mockWorkspaceConfig,
	}
}
