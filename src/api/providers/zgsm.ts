import * as os from "os"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI, { AzureOpenAI } from "openai"
import axios, { AxiosError } from "axios"

import { azureOpenAiDefaultApiVersion, ModelInfo, type ApiHandlerOptions } from "../../shared/api"

import { XmlMatcher } from "../../utils/xml-matcher"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { convertToR1Format } from "../transform/r1-format"
import { convertToSimpleMessages } from "../transform/simple-format"
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { DEEP_SEEK_DEFAULT_TEMPERATURE, DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { getZgsmSelectedModelInfo } from "../../shared/getZgsmSelectedModelInfo"
import { getClientId } from "../../utils/getClientId"
import { getWorkspacePath } from "../../utils/path"
import { defaultZgsmAuthConfig } from "../../zgsmAuth/config"
import delay from "delay"
let modelsCache = new WeakRef<string[]>([])
let defaultModelCache: string | undefined = "glm45-fp8"
const OPENAI_AZURE_AI_INFERENCE_PATH = "/models/chat/completions"
const cpuCount = os.cpus().length || 4
const BUFFER_THRESHOLD = ((cpuCount) => {
	let limit = 0
	let time = 16

	if (cpuCount <= 4) {
		limit = 25
	} else if (cpuCount <= 8) {
		limit = 50
	} else if (cpuCount <= 16) {
		limit = 100
	} else {
		limit = 200
	}

	return { limit, time }
})(cpuCount)
export class ZgsmHandler extends BaseProvider implements SingleCompletionHandler {
	static BUFFER_THRESHOLD = BUFFER_THRESHOLD
	protected options: ApiHandlerOptions
	private client: OpenAI
	private baseURL: string
	private chatType?: "user" | "system"
	private headers = {}

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		this.baseURL = `${this.options.zgsmBaseUrl || this.options.zgsmDefaultBaseUrl || defaultZgsmAuthConfig.baseUrl}/chat-rag/api/v1`
		const apiKey = options.zgsmApiKey ?? "not-provided"
		const isAzureAiInference = this._isAzureAiInference(this.baseURL)
		const urlHost = this._getUrlHost(this.baseURL)
		const isAzureOpenAi = urlHost === "azure.com" || urlHost.endsWith(".azure.com") || options.openAiUseAzure

		this.headers = {
			...DEFAULT_HEADERS,
			...(this.options.openAiHeaders || {}),
		}

		if (isAzureAiInference) {
			// Azure AI Inference Service (e.g., for DeepSeek) uses a different path structure
			this.client = new OpenAI({
				baseURL: this.baseURL,
				apiKey,
				defaultHeaders: this.headers,
				defaultQuery: { "api-version": this.options.azureApiVersion || "2024-05-01-preview" },
			})
		} else if (isAzureOpenAi) {
			// Azure API shape slightly differs from the core API shape:
			// https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
			this.client = new AzureOpenAI({
				baseURL: this.baseURL,
				apiKey,
				apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
				defaultHeaders: this.headers,
			})
		} else {
			this.client = new OpenAI({
				baseURL: this.baseURL,
				apiKey,
				defaultHeaders: this.headers,
			})
		}
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Performance monitoring log
		const requestId = `${metadata?.instanceId}-${Date.now().toString()}`

		// 1. Cache calculation results and configuration
		const { info: modelInfo, reasoning } = this.getModel()
		const modelUrl = `${this.options.zgsmBaseUrl || this.options.zgsmDefaultBaseUrl}/chat-rag/api/v1`
		const modelId = `${this.options.zgsmModelId || this.options.zgsmDefaultModelId || defaultModelCache}`
		const enabledR1Format = this.options.openAiR1FormatEnabled ?? false
		const enabledLegacyFormat = this.options.openAiLegacyFormat ?? false

		// Cache boolean calculation results
		const isAzureAiInference = this._isAzureAiInference(modelUrl)
		const isDeepseekReasoner = modelId.includes("deepseek-reasoner")
		const deepseekReasoner = isDeepseekReasoner || enabledR1Format
		const isArk = modelUrl.includes(".volces.com")
		const ark = isArk
		const isGrokXAI = this._isGrokXAI(this.baseURL)
		const isO1Family = modelId.includes("o1") || modelId.includes("o3") || modelId.includes("o4")

		// 2. Cache async call results
		const cachedClientId = getClientId()
		const cachedWorkspacePath = getWorkspacePath()

		// 3. Pre-build headers to avoid repeated creation
		const _headers = this.buildHeaders(metadata, requestId, cachedClientId, cachedWorkspacePath)

		// 4. Handle O1 family models
		if (isO1Family) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages)
			return
		}

		// 5. Handle streaming and non-streaming requests
		if (this.options.openAiStreamingEnabled ?? true) {
			const convertedMessages = this.convertMessages(
				systemPrompt,
				messages,
				deepseekReasoner,
				ark,
				enabledLegacyFormat,
				modelInfo,
			)

			const requestOptions = this.buildStreamingRequestOptions(
				modelId,
				convertedMessages,
				deepseekReasoner,
				isGrokXAI,
				reasoning,
				modelInfo,
			)

			const stream = await this.client.chat.completions.create(
				requestOptions,
				Object.assign(isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
					headers: _headers,
				}),
			)

			// 6. Optimize stream processing - use batch processing and buffer
			yield* this.handleOptimizedStream(stream, modelInfo)
		} else {
			// Non-streaming processing
			const requestOptions = this.buildNonStreamingRequestOptions(
				modelId,
				systemPrompt,
				messages,
				deepseekReasoner,
				enabledLegacyFormat,
				modelInfo,
			)

			const response = await this.client.chat.completions.create(
				requestOptions,
				Object.assign(isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
					headers: _headers,
				}),
			)

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}

			const _usageProcessingStart = performance.now()
			yield this.processUsageMetrics(response.usage, modelInfo)
		}
	}

	/**
	 * Build request headers (optimize memory allocation)
	 */
	private buildHeaders(
		metadata: ApiHandlerCreateMessageMetadata | undefined,
		requestId: string,
		clientId: string,
		workspacePath: string,
	): Record<string, string> {
		return {
			...this.headers,
			"Accept-Language": metadata?.language || "en",
			"x-quota-identity": this.chatType || "system",
			"zgsm-task-id": metadata?.taskId || "",
			"zgsm-request-id": requestId,
			"zgsm-client-id": clientId,
			"zgsm-project-path": encodeURI(workspacePath),
		}
	}

	/**
	 * Unified message conversion logic (using strategy pattern)
	 */
	private convertMessages(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		isDeepseekReasoner: boolean,
		isArk: boolean,
		isLegacyFormat: boolean,
		modelInfo: ModelInfo,
	): OpenAI.Chat.ChatCompletionMessageParam[] {
		let convertedMessages: OpenAI.Chat.ChatCompletionMessageParam[]

		if (isDeepseekReasoner) {
			convertedMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
		} else if (isArk || isLegacyFormat) {
			convertedMessages = [{ role: "system", content: systemPrompt }, ...convertToSimpleMessages(messages)]
		} else {
			const systemMessage = modelInfo.supportsPromptCache
				? {
						role: "system" as const,
						content: [
							{
								type: "text" as const,
								text: systemPrompt,
								cache_control: { type: "ephemeral" },
							},
						],
					}
				: { role: "system" as const, content: systemPrompt }

			convertedMessages = [systemMessage, ...convertToOpenAiMessages(messages)]
		}

		// Apply cache control logic
		this.applyCacheControlLogic(convertedMessages, modelInfo)

		return convertedMessages
	}

	/**
	 * Apply cache control logic (extracted as separate method)
	 */
	private applyCacheControlLogic(messages: OpenAI.Chat.ChatCompletionMessageParam[], modelInfo: ModelInfo): void {
		if (!modelInfo.supportsPromptCache) {
			return
		}

		const lastTwoUserMessages = messages.filter((msg) => msg.role === "user").slice(-2)

		for (const msg of lastTwoUserMessages) {
			if (typeof msg.content === "string") {
				msg.content = [{ type: "text", text: msg.content }]
			}

			if (Array.isArray(msg.content)) {
				let lastTextPart = msg.content.filter((part) => part.type === "text").pop()

				if (!lastTextPart) {
					lastTextPart = { type: "text", text: "..." }
					msg.content.push(lastTextPart)
				}

				// @ts-ignore-next-line
				lastTextPart["cache_control"] = { type: "ephemeral" }
			}
		}
	}

	/**
	 * Build streaming request options
	 */
	private buildStreamingRequestOptions(
		modelId: string,
		messages: OpenAI.Chat.ChatCompletionMessageParam[],
		isDeepseekReasoner: boolean,
		isGrokXAI: boolean,
		reasoning: any,
		modelInfo: ModelInfo,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: modelId,
			temperature: this.options.modelTemperature ?? (isDeepseekReasoner ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
			messages,
			stream: true as const,
			...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
			...(reasoning && reasoning),
		}

		this.addMaxTokensIfNeeded(requestOptions, modelInfo)
		return requestOptions
	}

	/**
	 * Build non-streaming request options
	 */
	private buildNonStreamingRequestOptions(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		isDeepseekReasoner: boolean,
		isLegacyFormat: boolean,
		modelInfo: ModelInfo,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
		const systemMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
			role: "user",
			content: systemPrompt,
		}

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
			model: modelId,
			messages: isDeepseekReasoner
				? convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
				: isLegacyFormat
					? [systemMessage, ...convertToSimpleMessages(messages)]
					: [systemMessage, ...convertToOpenAiMessages(messages)],
		}

		this.addMaxTokensIfNeeded(requestOptions, modelInfo)
		return requestOptions
	}

	/**
	 * Optimized stream processing method (improves memory usage and performance)
	 */
	private async *handleOptimizedStream(
		stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
		modelInfo: ModelInfo,
	): ApiStream {
		const matcher = new XmlMatcher(
			"think",
			(chunk) =>
				({
					type: chunk.matched ? "reasoning" : "text",
					text: chunk.data,
				}) as const,
		)

		let lastUsage

		// Use content buffer to reduce matcher.update() calls
		const contentBuffer: string[] = []
		let time = Date.now() + 2000
		for await (const chunk of stream) {
			await delay(ZgsmHandler.BUFFER_THRESHOLD.time)
			const delta = chunk.choices[0]?.delta ?? {}

			// Cache content for batch processing
			if (delta.content) {
				contentBuffer.push(delta.content)

				// Process in batch when threshold is reached
				if (contentBuffer.length >= ZgsmHandler.BUFFER_THRESHOLD.limit || Date.now() >= time) {
					const batchedContent = contentBuffer.join("")
					for (const processedChunk of matcher.update(batchedContent)) {
						yield processedChunk
					}
					contentBuffer.length = 0 // Clear buffer
					time = Date.now() + 2000
				}
			}

			// Process reasoning content
			if ("reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					text: (delta.reasoning_content as string | undefined) || "",
				}
			}

			// Cache usage information
			if (chunk.usage) {
				lastUsage = chunk.usage
			}
		}

		// Process remaining content
		if (contentBuffer.length > 0) {
			const remainingContent = contentBuffer.join("")
			for (const processedChunk of matcher.update(remainingContent)) {
				yield processedChunk
			}
		}

		// Output final results
		for (const chunk of matcher.final()) {
			yield chunk
		}

		// Process usage metrics
		if (lastUsage) {
			yield this.processUsageMetrics(lastUsage, modelInfo)
		}
	}

	protected processUsageMetrics(usage: any, _modelInfo?: ModelInfo): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.cache_creation_input_tokens || undefined,
			cacheReadTokens: usage?.cache_read_input_tokens || undefined,
		}
	}

	override getModel() {
		const id = `${this.options.zgsmModelId || this.options.zgsmDefaultModelId || defaultModelCache}`
		const defaultInfo = getZgsmSelectedModelInfo(id)
		const info = this.options.useZgsmCustomConfig
			? (this.options.openAiCustomModelInfo ?? defaultInfo)
			: defaultInfo
		const params = getModelParams({ format: "zgsm", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const isAzureAiInference = this._isAzureAiInference(this.baseURL)
			const model = this.getModel()
			const modelInfo = model.info

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: model.id,
				messages: [{ role: "user", content: prompt }],
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const response = await this.client.chat.completions.create(
				requestOptions,
				isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)

			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`OpenAI completion error: ${error.message}`)
			}

			throw error
		}
	}

	private async *handleO3FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		const modelInfo = this.getModel().info
		const methodIsAzureAiInference = this._isAzureAiInference(this.baseURL)

		if (this.options.openAiStreamingEnabled ?? true) {
			const isGrokXAI = this._isGrokXAI(this.baseURL)

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				stream: true,
				...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
				reasoning_effort: modelInfo.reasoningEffort,
				temperature: undefined,
			}

			// O3 family models do not support the deprecated max_tokens parameter
			// but they do support max_completion_tokens (the modern OpenAI parameter)
			// This allows O3 models to limit response length when includeMaxTokens is enabled
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const stream = await this.client.chat.completions.create(
				requestOptions,
				methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)

			yield* this.handleStreamResponse(stream)
		} else {
			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				reasoning_effort: modelInfo.reasoningEffort,
				temperature: undefined,
			}

			// O3 family models do not support the deprecated max_tokens parameter
			// but they do support max_completion_tokens (the modern OpenAI parameter)
			// This allows O3 models to limit response length when includeMaxTokens is enabled
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const response = await this.client.chat.completions.create(
				requestOptions,
				methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}
			yield this.processUsageMetrics(response.usage)
		}
	}

	private async *handleStreamResponse(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>): ApiStream {
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}
	}
	private _getUrlHost(baseUrl?: string): string {
		try {
			return new URL(baseUrl ?? "").host
		} catch (error) {
			return ""
		}
	}

	private _isGrokXAI(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.includes("x.ai")
	}

	private _isAzureAiInference(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.endsWith(".services.ai.azure.com")
	}

	/**
	 * Adds max_completion_tokens to the request body if needed based on provider configuration
	 * Note: max_tokens is deprecated in favor of max_completion_tokens as per OpenAI documentation
	 * O3 family models handle max_tokens separately in handleO3FamilyMessage
	 */
	private addMaxTokensIfNeeded(
		requestOptions:
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
		modelInfo: ModelInfo,
	): void {
		// Only add max_completion_tokens if includeMaxTokens is true
		if (this.options.includeMaxTokens === true) {
			// Use user-configured modelMaxTokens if available, otherwise fall back to model's default maxTokens
			// Using max_completion_tokens as max_tokens is deprecated
			requestOptions.max_completion_tokens = this.options.modelMaxTokens || modelInfo.maxTokens
		}
	}

	setChatType(type: "user" | "system"): void {
		this.chatType = type
	}

	getChatType() {
		return this.chatType
	}
}

export const canParseURL = (url: string): boolean => {
	// if the URL constructor is available, use it to check if the URL is valid
	if (typeof URL.canParse === "function") {
		return URL.canParse(url)
	}

	try {
		new URL(url)
		return true
	} catch {
		return false
	}
}
export async function getZgsmModels(
	baseUrl?: string,
	apiKey?: string,
	openAiHeaders?: Record<string, string>,
): Promise<[string[], string | undefined, (AxiosError | undefined)?]> {
	baseUrl = baseUrl ? baseUrl.trim() || defaultZgsmAuthConfig.baseUrl : defaultZgsmAuthConfig.baseUrl
	const modelsUrl = `${baseUrl}/ai-gateway/api/v1/models`
	try {
		if (!canParseURL(modelsUrl)) {
			throw new Error(`Invalid Costrict base URL: ${modelsUrl}`)
		}

		const config: Record<string, any> = {}
		const headers: Record<string, string> = {
			...DEFAULT_HEADERS,
			...(openAiHeaders || {}),
		}

		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`
		}

		if (Object.keys(headers).length > 0) {
			config["headers"] = headers
		}
		config.timeout = 3000
		const response = await axios.get(modelsUrl, config)
		const modelsArray = response.data?.data?.map((model: any) => model.id) || []

		modelsCache = new WeakRef([...new Set<string>(modelsArray)])
		defaultModelCache = modelsArray[0]
	} catch (error) {
		console.error(`[${new Date().toLocaleString()}] Error fetching Costrict models`, modelsUrl, error)
	} finally {
		return [modelsCache.deref() || [], defaultModelCache]
	}
}
