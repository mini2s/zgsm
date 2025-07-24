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
let modelsCache = new WeakRef<string[]>([])
let defaultModelCache: string | undefined = "deepseek-v3"
const OPENAI_AZURE_AI_INFERENCE_PATH = "/models/chat/completions"

export class ZgsmHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI
	private baseURL: string
	private chatType?: "user" | "system"
	private headers = {}

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		this.baseURL = `${this.options.zgsmBaseUrl || this.options.zgsmDefaultBaseUrl}/chat-rag/api/v1`
		const apiKey = options.zgsmApiKey ?? "not-provided"
		const isAzureAiInference = this._isAzureAiInference(this.options.zgsmBaseUrl || this.options.zgsmDefaultBaseUrl)
		const urlHost = this._getUrlHost(this.options.zgsmBaseUrl || this.options.zgsmDefaultBaseUrl)
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
		const { info: modelInfo, reasoning } = this.getModel()
		const modelUrl = `${this.options.zgsmBaseUrl || this.options.zgsmDefaultBaseUrl}/chat-rag/api/v1`
		const modelId = `${this.options.zgsmModelId || this.options.zgsmDefaultModelId || defaultModelCache}`
		const enabledR1Format = this.options.openAiR1FormatEnabled ?? false
		const enabledLegacyFormat = this.options.openAiLegacyFormat ?? false
		const isAzureAiInference = this._isAzureAiInference(modelUrl)
		const deepseekReasoner = modelId.includes("deepseek-reasoner") || enabledR1Format
		const ark = modelUrl.includes(".volces.com")

		const _headers = {
			...this.headers,
			"Accept-Language": metadata?.language || "en",
			"x-quota-identity": this.chatType || "system",
			"zgsm-task-id": metadata?.taskId,
			"zgsm-request-id": `${metadata?.instanceId}-${Date.now().toString()}`,
			"zgsm-client-id": getClientId(),
			"zgsm-project-path": encodeURI(getWorkspacePath()),
		}

		if (modelId.includes("o1") || modelId.includes("o3") || modelId.includes("o4")) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages)
			return
		}

		if (this.options.openAiStreamingEnabled ?? true) {
			let systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
				role: "system",
				content: systemPrompt,
			}

			let convertedMessages
			if (deepseekReasoner) {
				convertedMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
			} else if (ark || enabledLegacyFormat) {
				convertedMessages = [systemMessage, ...convertToSimpleMessages(messages)]
			} else {
				if (modelInfo.supportsPromptCache) {
					systemMessage = {
						role: "system",
						content: [
							{
								type: "text",
								text: systemPrompt,
								// @ts-ignore-next-line
								cache_control: { type: "ephemeral" },
							},
						],
					}
				}
				convertedMessages = [systemMessage, ...convertToOpenAiMessages(messages)]
				if (modelInfo.supportsPromptCache) {
					// Note: the following logic is copied from openrouter:
					// Add cache_control to the last two user messages
					// (note: this works because we only ever add one user message at a time, but if we added multiple we'd need to mark the user message before the last assistant message)
					const lastTwoUserMessages = convertedMessages.filter((msg) => msg.role === "user").slice(-2)
					lastTwoUserMessages.forEach((msg) => {
						if (typeof msg.content === "string") {
							msg.content = [{ type: "text", text: msg.content }]
						}
						if (Array.isArray(msg.content)) {
							// NOTE: this is fine since env details will always be added at the end. but if it weren't there, and the user added a image_url type message, it would pop a text part before it and then move it after to the end.
							let lastTextPart = msg.content.filter((part) => part.type === "text").pop()

							if (!lastTextPart) {
								lastTextPart = { type: "text", text: "..." }
								msg.content.push(lastTextPart)
							}

							// @ts-ignore-next-line
							lastTextPart["cache_control"] = { type: "ephemeral" }
						}
					})
				}
			}

			const isGrokXAI = this._isGrokXAI(this.baseURL)

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				temperature: this.options.modelTemperature ?? (deepseekReasoner ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
				messages: convertedMessages,
				stream: true as const,
				...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
				...(reasoning && reasoning),
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const stream = await this.client.chat.completions.create(
				requestOptions,
				Object.assign(isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
					headers: _headers,
				}),
			)

			const matcher = new XmlMatcher(
				"think",
				(chunk) =>
					({
						type: chunk.matched ? "reasoning" : "text",
						text: chunk.data,
					}) as const,
			)

			let lastUsage

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta ?? {}

				if (delta.content) {
					for (const chunk of matcher.update(delta.content)) {
						yield chunk
					}
				}

				if ("reasoning_content" in delta && delta.reasoning_content) {
					yield {
						type: "reasoning",
						text: (delta.reasoning_content as string | undefined) || "",
					}
				}
				if (chunk.usage) {
					lastUsage = chunk.usage
				}
			}

			for (const chunk of matcher.final()) {
				yield chunk
			}

			if (lastUsage) {
				yield this.processUsageMetrics(lastUsage, modelInfo)
			}
		} else {
			// o1 for instance doesnt support streaming, non-1 temp, or system prompt
			const systemMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
				role: "user",
				content: systemPrompt,
			}

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: deepseekReasoner
					? convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
					: enabledLegacyFormat
						? [systemMessage, ...convertToSimpleMessages(messages)]
						: [systemMessage, ...convertToOpenAiMessages(messages)],
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			const response = await this.client.chat.completions.create(
				requestOptions,
				Object.assign(this._isAzureAiInference(modelUrl) ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
					headers: _headers,
				}),
			)

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}

			yield this.processUsageMetrics(response.usage, modelInfo)
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
	baseUrl = baseUrl || defaultZgsmAuthConfig.baseUrl
	const modelsUrl = `${baseUrl}/ai-gateway/api/v1/models`
	try {
		if (!canParseURL(baseUrl)) {
			throw new Error(`Invalid Costrict base URL: ${baseUrl}`)
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
