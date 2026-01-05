import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { routeLLMRequest, streamLLMRequest, type LLMRequest } from "../_shared/llm-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { messages, temperature, max_tokens, stream } = body as LLMRequest & { stream?: boolean };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[AI Assistant] Received request with ${messages.length} messages, stream=${stream}`);

    // Non-streaming response
    if (!stream) {
      const result = await routeLLMRequest({ messages, temperature, max_tokens });

      if (result.error) {
        console.error(`[AI Assistant] LLM routing failed: ${result.error}`);
        return new Response(
          JSON.stringify({
            error: result.error,
            latency_ms: result.latency_ms,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(
        `[AI Assistant] Success: ${result.provider_used}/${result.model_used} in ${result.latency_ms}ms, fallback=${result.fallback_used}`
      );

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Streaming response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const { chunk, done, model_used, provider_used } of streamLLMRequest({
            messages,
            temperature,
            max_tokens,
          })) {
            if (done) {
              // Send final metadata
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
              const data = JSON.stringify({
                choices: [{ delta: { content: chunk } }],
              });
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
  } catch (error) {
    console.error("[AI Assistant] Request error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
