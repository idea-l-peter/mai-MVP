import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeTool, type ToolCall, type ToolResult } from "../_shared/tools.ts";
import { TOOL_DEFINITIONS } from "../_shared/tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Maximum tool calls per request to prevent runaway costs
const MAX_TOOL_CALLS = 5;

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface LovableAIResponse {
  choices: Array<{
    message: {
      content: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  model: string;
}

async function callLovableAI(
  messages: LLMMessage[],
  tools?: typeof TOOL_DEFINITIONS,
  toolChoice?: "auto" | "none",
  temperature?: number,
  maxTokens?: number
): Promise<{ content: string; model: string; tool_calls?: ToolCall[] }> {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const body: Record<string, unknown> = {
    model: "google/gemini-2.5-flash",
    messages: messages.map(m => {
      const msg: Record<string, unknown> = { role: m.role, content: m.content };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      return msg;
    }),
    max_tokens: maxTokens || 2048,
    stream: false,
  };

  if (temperature !== undefined) {
    body.temperature = temperature;
  }

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice || "auto";
  }

  console.log(`[AI Assistant] Calling Lovable AI with ${messages.length} messages, tools=${tools?.length || 0}`);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI Assistant] Lovable AI error: ${response.status} - ${errorText}`);
    
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a moment.");
    }
    if (response.status === 402) {
      throw new Error("AI credits exhausted. Please add funds to continue.");
    }
    throw new Error(`Lovable AI error: ${response.status}`);
  }

  const data: LovableAIResponse = await response.json();
  const message = data.choices?.[0]?.message;
  const content = message?.content || "";
  const tool_calls = message?.tool_calls;

  console.log(`[AI Assistant] Lovable AI response: content=${content?.length || 0} chars, tool_calls=${tool_calls?.length || 0}`);

  return { content, model: data.model || "google/gemini-2.5-flash", tool_calls };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;

    if (authHeader) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { authorization: authHeader } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    }

    console.log(`[AI Assistant] User ID: ${userId || "anonymous"}`);

    const body = await req.json();
    const { messages: inputMessages, temperature, max_tokens, stream } = body;

    if (!inputMessages || !Array.isArray(inputMessages) || inputMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert to LLMMessage format
    let messages: LLMMessage[] = inputMessages.map((m: { role: string; content: string }) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    }));

    console.log(`[AI Assistant] Received ${messages.length} messages, stream=${stream}`);

    // Streaming doesn't support tool calling yet
    if (stream) {
      return handleStreamingRequest(messages, temperature, max_tokens);
    }

    const startTime = Date.now();

    // Non-streaming with tool calling loop
    let toolCallCount = 0;
    let result = await callLovableAI(
      messages,
      userId ? TOOL_DEFINITIONS : undefined,
      "auto",
      temperature,
      max_tokens
    );

    // Tool calling loop
    while (result.tool_calls && result.tool_calls.length > 0 && toolCallCount < MAX_TOOL_CALLS) {
      console.log(`[AI Assistant] Processing ${result.tool_calls.length} tool calls (iteration ${toolCallCount + 1})`);

      if (!userId) {
        console.error("[AI Assistant] Tool calls requested but no user ID");
        break;
      }

      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: result.content || "",
        tool_calls: result.tool_calls,
      });

      // Execute each tool call
      const toolResults: ToolResult[] = [];
      for (const toolCall of result.tool_calls) {
        toolCallCount++;
        if (toolCallCount > MAX_TOOL_CALLS) {
          console.warn(`[AI Assistant] Max tool calls (${MAX_TOOL_CALLS}) reached`);
          break;
        }

        const toolResult = await executeTool(toolCall, userId);
        toolResults.push(toolResult);
        console.log(`[AI Assistant] Tool ${toolCall.function.name} result: ${toolResult.content.substring(0, 100)}...`);
      }

      // Add tool results to messages
      for (const toolResult of toolResults) {
        messages.push({
          role: "tool",
          content: toolResult.content,
          tool_call_id: toolResult.tool_call_id,
        });
      }

      // Call LLM again with tool results
      result = await callLovableAI(
        messages,
        TOOL_DEFINITIONS,
        "auto",
        temperature,
        max_tokens
      );
    }

    const latency_ms = Date.now() - startTime;

    console.log(
      `[AI Assistant] Success: ${result.model} in ${latency_ms}ms, tool_calls=${toolCallCount}`
    );

    return new Response(
      JSON.stringify({
        content: result.content,
        model_used: result.model,
        provider_used: "lovable",
        latency_ms,
        tool_calls_made: toolCallCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[AI Assistant] Request error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const status = errorMessage.includes("Rate limit") ? 429 
      : errorMessage.includes("credits") ? 402 
      : 500;
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Streaming handler (no tool support yet)
async function handleStreamingRequest(
  messages: LLMMessage[],
  temperature?: number,
  max_tokens?: number
): Promise<Response> {
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const body = {
    model: "google/gemini-2.5-flash",
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    max_tokens: max_tokens || 2048,
    stream: true,
    ...(temperature !== undefined ? { temperature } : {}),
  };

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI Assistant] Streaming error: ${response.status} - ${errorText}`);
    
    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: `AI gateway error: ${response.status}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(response.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
