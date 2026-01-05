import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { routeLLMRequest, TOOL_DEFINITIONS, type LLMMessage } from "../_shared/llm-router.ts";
import { executeTool, type ToolCall, type ToolResult } from "../_shared/tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Maximum tool calls per request to prevent runaway costs
const MAX_TOOL_CALLS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;

    console.log(`[AI Assistant] Auth header present: ${!!authHeader}`);

    if (authHeader) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error(`[AI Assistant] Auth error: ${authError.message}`);
      }
      
      userId = user?.id || null;
      console.log(`[AI Assistant] User ID: ${userId || "anonymous"}, email: ${user?.email || "none"}`);
    } else {
      console.log(`[AI Assistant] No auth header - user is anonymous`);
    }

    const body = await req.json();
    const { messages: inputMessages, temperature, max_tokens, stream, provider } = body;

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

    console.log(`[AI Assistant] Received ${messages.length} messages, stream=${stream}, tools_enabled=${!!userId}, tools_count=${userId ? TOOL_DEFINITIONS.length : 0}`);

    // Streaming doesn't support tool calling yet
    if (stream) {
      return handleStreamingRequest(messages, temperature, max_tokens, provider);
    }

    // Non-streaming with tool calling loop
    let toolCallCount = 0;
    let finalResponse = await routeLLMRequest({
      messages,
      temperature,
      max_tokens,
      provider,
      tools: userId ? TOOL_DEFINITIONS : undefined, // Only provide tools if user is authenticated
      tool_choice: "auto",
    });

    // Tool calling loop
    while (finalResponse.tool_calls && finalResponse.tool_calls.length > 0 && toolCallCount < MAX_TOOL_CALLS) {
      console.log(`[AI Assistant] Processing ${finalResponse.tool_calls.length} tool calls (iteration ${toolCallCount + 1})`);

      if (!userId) {
        console.error("[AI Assistant] Tool calls requested but no user ID");
        break;
      }

      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: finalResponse.content || "",
        tool_calls: finalResponse.tool_calls,
      });

      // Execute each tool call
      const toolResults: ToolResult[] = [];
      for (const toolCall of finalResponse.tool_calls) {
        toolCallCount++;
        if (toolCallCount > MAX_TOOL_CALLS) {
          console.warn(`[AI Assistant] Max tool calls (${MAX_TOOL_CALLS}) reached`);
          break;
        }

        const result = await executeTool(toolCall, userId);
        toolResults.push(result);
        console.log(`[AI Assistant] Tool ${toolCall.function.name} result: ${result.content.substring(0, 100)}...`);
      }

      // Add tool results to messages
      for (const result of toolResults) {
        messages.push({
          role: "tool",
          content: result.content,
          tool_call_id: result.tool_call_id,
        });
      }

      // Call LLM again with tool results
      finalResponse = await routeLLMRequest({
        messages,
        temperature,
        max_tokens,
        provider,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      });
    }

    if (finalResponse.error) {
      console.error(`[AI Assistant] LLM routing failed: ${finalResponse.error}`);
      return new Response(
        JSON.stringify({ error: finalResponse.error, latency_ms: finalResponse.latency_ms }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[AI Assistant] Success: ${finalResponse.provider_used}/${finalResponse.model_used} in ${finalResponse.latency_ms}ms, tool_calls=${toolCallCount}`
    );

    return new Response(
      JSON.stringify({
        content: finalResponse.content,
        model_used: finalResponse.model_used,
        provider_used: finalResponse.provider_used,
        latency_ms: finalResponse.latency_ms,
        fallback_used: finalResponse.fallback_used,
        tool_calls_made: toolCallCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[AI Assistant] Request error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Streaming handler (no tool support yet)
async function handleStreamingRequest(
  messages: LLMMessage[],
  temperature?: number,
  max_tokens?: number,
  provider?: string
): Promise<Response> {
  const { streamLLMRequest } = await import("../_shared/llm-router.ts");
  
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const { chunk, done, model_used, provider_used } of streamLLMRequest({
          messages,
          temperature,
          max_tokens,
          provider: provider as "groq" | "openai" | "gemini" | undefined,
        })) {
          if (done) {
            const finalData = JSON.stringify({
              choices: [{ delta: {}, finish_reason: "stop" }],
              model: model_used,
              provider: provider_used,
            });
            controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          if (chunk) {
            const data = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }
      } catch (error) {
        console.error("[AI Assistant] Stream error:", error);
        const errorData = JSON.stringify({
          error: error instanceof Error ? error.message : "Stream failed",
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
