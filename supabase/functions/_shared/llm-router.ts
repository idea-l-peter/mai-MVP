/**
 * Multi-provider LLM Router
 * Supports Groq (primary), OpenAI (fallback), Gemini (secondary fallback)
 * Config-driven with auto-fallback on failure
 * Now with function/tool calling support
 */

import { TOOL_DEFINITIONS, type ToolDefinition, type ToolCall } from "./tools.ts";

export type Provider = "groq" | "openai" | "gemini";

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  provider?: Provider;
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none";
}

export interface LLMResponse {
  content: string;
  model_used: string;
  provider_used: Provider;
  latency_ms: number;
  fallback_used: boolean;
  tool_calls?: ToolCall[];
  error?: string;
}

interface ProviderConfig {
  name: Provider;
  baseUrl: string;
  model: string;
  timeout: number;
  apiKeyEnv: string;
  supportsTemperature: boolean;
  supportsTools: boolean;
}

const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  groq: {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile", // Fixed: was using invalid model name
    timeout: 30000, // Increased timeout
    apiKeyEnv: "GROQ_API_KEY",
    supportsTemperature: true,
    supportsTools: true,
  },
  openai: {
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    timeout: 30000, // Increased timeout
    apiKeyEnv: "OPENAI_API_KEY",
    supportsTemperature: true,
    supportsTools: true,
  },
  gemini: {
    name: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash", // Updated to stable model
    timeout: 30000, // Increased timeout
    apiKeyEnv: "GEMINI_API_KEY",
    supportsTemperature: true,
    supportsTools: false, // Gemini has different tool format, skip for now
  },
};

const FALLBACK_ORDER: Provider[] = ["groq", "openai", "gemini"];

function getDefaultProvider(): Provider {
  const envProvider = Deno.env.get("LLM_PROVIDER")?.toLowerCase() as Provider;
  if (envProvider && PROVIDER_CONFIGS[envProvider]) {
    return envProvider;
  }
  return "groq";
}

async function callOpenAICompatible(
  config: ProviderConfig,
  request: LLMRequest,
  apiKey: string
): Promise<{ content: string; model: string; tool_calls?: ToolCall[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: request.messages.map(m => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        return msg;
      }),
      max_tokens: request.max_tokens || 2048,
      stream: false,
    };

    if (config.supportsTemperature && request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    // Add tools if provided and provider supports them
    if (request.tools && request.tools.length > 0 && config.supportsTools) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice || "auto";
    }

    console.log(`[LLM Router] Calling ${config.name} with ${request.messages.length} messages, tools=${request.tools?.length || 0}`);

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM Router] ${config.name} error: ${response.status} - ${errorText}`);
      throw new Error(`${config.name} API error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const content = message?.content || "";
    const tool_calls = message?.tool_calls;

    console.log(`[LLM Router] ${config.name} response: content=${content?.length || 0} chars, tool_calls=${tool_calls?.length || 0}`);

    return { content, model: data.model || config.model, tool_calls };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGemini(
  config: ProviderConfig,
  request: LLMRequest,
  apiKey: string
): Promise<{ content: string; model: string; tool_calls?: ToolCall[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    // Convert messages to Gemini format (skip tool messages for Gemini)
    const contents = request.messages
      .filter((m) => m.role !== "system" && m.role !== "tool")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemMessage = request.messages.find((m) => m.role === "system")?.content;

    const body: Record<string, unknown> = {
      contents: systemMessage
        ? [{ role: "user", parts: [{ text: `System: ${systemMessage}` }] }, ...contents]
        : contents,
      generationConfig: {
        maxOutputTokens: request.max_tokens || 2048,
      },
    };

    if (request.temperature !== undefined) {
      (body.generationConfig as Record<string, unknown>).temperature = request.temperature;
    }

    const response = await fetch(
      `${config.baseUrl}/models/${config.model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM Router] Gemini error: ${response.status} - ${errorText}`);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("Gemini returned empty content");
    }

    return { content, model: config.model };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callProvider(
  provider: Provider,
  request: LLMRequest
): Promise<{ content: string; model: string; tool_calls?: ToolCall[] }> {
  const config = PROVIDER_CONFIGS[provider];
  const apiKey = Deno.env.get(config.apiKeyEnv);

  if (!apiKey) {
    throw new Error(`${config.apiKeyEnv} not configured`);
  }

  if (provider === "gemini") {
    return callGemini(config, request, apiKey);
  }

  return callOpenAICompatible(config, request, apiKey);
}

export async function routeLLMRequest(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();
  const defaultProvider =
    request.provider && PROVIDER_CONFIGS[request.provider]
      ? request.provider
      : getDefaultProvider();

  console.log(`[LLM Router] Using provider: ${defaultProvider}`);

  // Build fallback chain
  const fallbackChain = [defaultProvider, ...FALLBACK_ORDER.filter((p) => p !== defaultProvider)];

  let lastError: Error | null = null;
  const attemptedProviders: Provider[] = [];

  for (const provider of fallbackChain) {
    attemptedProviders.push(provider);

    try {
      const result = await callProvider(provider, request);
      const latency_ms = Date.now() - startTime;

      console.log(`[LLM Router] Success with ${provider} in ${latency_ms}ms`);

      return {
        content: result.content,
        model_used: result.model,
        provider_used: provider,
        latency_ms,
        fallback_used: attemptedProviders.length > 1,
        tool_calls: result.tool_calls,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[LLM Router] ${provider} failed: ${lastError.message}, trying next...`);
    }
  }

  // All providers failed
  const latency_ms = Date.now() - startTime;
  console.error(`[LLM Router] All providers failed after ${latency_ms}ms`);

  return {
    content: "",
    model_used: "",
    provider_used: defaultProvider,
    latency_ms,
    fallback_used: true,
    error: `All providers failed. Last error: ${lastError?.message}`,
  };
}

// Streaming support (unchanged)
export async function* streamLLMRequest(
  request: LLMRequest
): AsyncGenerator<{ chunk: string; done: boolean; model_used?: string; provider_used?: Provider }> {
  const defaultProvider =
    request.provider && PROVIDER_CONFIGS[request.provider]
      ? request.provider
      : getDefaultProvider();
  const config = PROVIDER_CONFIGS[defaultProvider];
  const apiKey = Deno.env.get(config.apiKeyEnv);

  if (!apiKey) {
    throw new Error(`${config.apiKeyEnv} not configured`);
  }

  if (defaultProvider === "gemini") {
    const result = await routeLLMRequest(request);
    yield { chunk: result.content, done: true, model_used: result.model_used, provider_used: result.provider_used };
    return;
  }

  const body = {
    model: config.model,
    messages: request.messages,
    max_tokens: request.max_tokens || 2048,
    stream: true,
    ...(config.supportsTemperature && request.temperature !== undefined
      ? { temperature: request.temperature }
      : {}),
  };

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    throw new Error(`${defaultProvider} streaming error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6);
      if (jsonStr === "[DONE]") {
        yield { chunk: "", done: true, model_used: config.model, provider_used: defaultProvider };
        return;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          yield { chunk: content, done: false };
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  yield { chunk: "", done: true, model_used: config.model, provider_used: defaultProvider };
}

// Re-export for convenience
export { TOOL_DEFINITIONS };
