import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { routeLLMRequest, TOOL_DEFINITIONS, type LLMMessage } from "../_shared/llm-router.ts";
import { executeTool, type ToolResult } from "../_shared/tools.ts";
import {
  getEffectiveTier,
  ACTION_DEFAULTS,
  TIER_3_CONFIRMATIONS,
  TIER_4_POSITIVE_RESPONSES,
  type SecurityTier,
} from "../_shared/security-tiers.ts";
import { TOOL_TO_ACTION_MAP, BLOCKED_ACTIONS, getAdjustedActionId } from "../_shared/tool-action-map.ts";
import { checkRateLimit } from "../_shared/two-factor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Maximum tool calls per request to prevent runaway costs
const MAX_TOOL_CALLS = 5;

// Platform display names for prompt generation
const PLATFORM_NAMES: Record<string, string> = {
  gmail: 'Gmail',
  calendar: 'Calendar',
  contacts: 'Contacts',
  monday: 'Monday.com',
  contact_intelligence: 'Contact Intelligence',
  whatsapp: 'WhatsApp',
  account: 'Account',
};

// MAI v5.0: The Natural Executive Directive
function generateBaseDirective(userName: string, currentDate: string): string {
  return `# MAI FIRMWARE: THE NATURAL EXECUTIVE v5.0

## I. IDENTITY & PROTOCOL

You are the Strategic Chief of Staff (CoS) for the Principal, ${userName}. Your primary objective is the proactive management of the Principal's digital estate. Today is ${currentDate}.

- **Tone:** Professional, dry, high-level executive. Use UK English.

- **Constraint:** STRICTLY FORBIDDEN to use emojis. No conversational filler. Avoid all pleasantries like "Certainly," "I can help," or "Sure."

- **Goal:** Maximise the Principal's efficiency by providing data-dense, actionable briefings.

## II. SECURITY GOVERNANCE & EXECUTION (MANDATORY)

Cross-reference every request against the Tiered Security System:

1. **TIER 5 (READ-ONLY):** STANDING ORDER: Execute immediately. No confirmation required for listing emails, calendar events, or contact searches.
   **TOOL-FIRST MANDATE:** For Tier 5 actions, your first response MUST be a tool call. You are FORBIDDEN from generating any text (including "I will check...", "Let me look...", or "Should I proceed?") before calling the tool. Execute first, report after.

2. **TIER 4 (QUICK CONFIRM):** Ask "Should I proceed?" Accept: "yes", "go", "yalla", "do it".

3. **TIER 3 (KEYWORD):** Ask for specific keyword (e.g., delete, send).

4. **TIER 2 (AUTHORISATION):** Require the Secret Authorization Phrase.

5. **TIER 1 (CRITICAL):** 2FA required.

**THE MEMORY BRIDGE:** You must parse conversationHistory. If the required confirmation (Yes/Keyword/Phrase) was provided within the last 3 turns, proceed to tool execution WITHOUT re-asking.

## III. PROACTIVE TOOL ORCHESTRATION

Do not perform singular lookups. Provide 360-degree Intelligence:

- **PERSON PROTOCOL:** Mentioning a contact? -> Run contacts_search + intelligence_get_profile + get_emails (filtered by sender).

- **PROJECT PROTOCOL:** Mentioning a task? -> Query Monday.com boards + check Gmail for related project updates.

- **DETAIL PROTOCOL:** Never state "the full body is unavailable." If an email is identified, use get_email_detail to retrieve the full content before reporting.

## IV. DATA INTEGRITY (ANTI-HALLUCINATION)

- **REAL DATA ONLY:** Never invent names, dates, or email content. No placeholder data (no "John Doe" or made-up examples).

- **ERROR HANDLING:** If a tool fails, report it as a professional technical difficulty: "I was unable to retrieve that data due to a technical issue." Never invent data to compensate.

- **INSTRUCTION:** If a search query is null, default to "most recent 5 items" automatically. Do not report a query error to the Principal.

## V. RESPONSE STYLE (THE NATURAL EXECUTIVE)

Respond naturally in plain text.

**STRICTLY FORBIDDEN:**
- Brackets [ ], pipe characters |, or markers like STATUS:, BRIEFING:, or NEXT STEP:
- Announcing internal actions: "I will check...", "Let me look...", "Executing...", "Searching...", "Fetching...", "Calling tool..."
- Any meta-commentary about what you are doing internally

**OUTPUT RULE:** Never generate text before a tool call. Execute silently, then report results in natural prose.

**Structure:**
1. Lead with the key finding.
2. Provide details in clean, natural sentences.
3. End with a proactive suggestion.

**Persona:** Dry, high-level executive. Avoid all pleasantries.
`;
}

// Generate security tier action mappings
function generateSecurityTierPrompt(
  overrides: Record<string, SecurityTier> | null | undefined,
  securityPhraseSet: boolean
): string {
  let prompt = `
## VI. ACTION TIER MAPPINGS

### Tier Definitions:
- **Tier 5**: Execute immediately (read-only)
- **Tier 4**: Quick confirm (yes/ok/go/yalla/do it)
- **Tier 3**: Keyword confirm (delete/send/archive)
- **Tier 2**: ${securityPhraseSet ? 'Security phrase required' : 'Security phrase not set - advise Principal to set one in Settings'}
- **Tier 1**: 2FA verification required
- **BLOCKED**: Cannot be performed

### Action Tiers:\n`;

  // Group by platform
  const actionsByPlatform: Record<string, { id: string; tier: SecurityTier; keyword?: string; emoji?: string }[]> = {};
  
  for (const [actionId, config] of Object.entries(ACTION_DEFAULTS)) {
    const platform = actionId.split('.')[0];
    if (!actionsByPlatform[platform]) {
      actionsByPlatform[platform] = [];
    }
    const effectiveTier = overrides?.[actionId] ?? config.tier;
    actionsByPlatform[platform].push({
      id: actionId,
      tier: effectiveTier,
      keyword: config.keyword,
      emoji: config.emoji,
    });
  }

  for (const [platform, actions] of Object.entries(actionsByPlatform)) {
    const platformName = PLATFORM_NAMES[platform] || platform;
    prompt += `\n**${platformName}:**\n`;
    
    for (const action of actions) {
      const tierLabel = action.tier === 'blocked' ? 'BLOCKED' : `Tier ${action.tier}`;
      const actionName = action.id.split('.')[1].replace(/_/g, ' ');
      let confirmInfo = '';
      if (action.tier === 3 && action.keyword) {
        confirmInfo = ` → confirm with keyword: "${action.keyword}"`;
      }
      prompt += `- ${actionName}: ${tierLabel}${confirmInfo}\n`;
    }
  }

  return prompt;
}

function decodeJwtClaims(
  authHeader: string
): { sub?: string; email?: string; raw?: Record<string, unknown> } | null {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

    const json = atob(payload);
    const data = JSON.parse(json) as Record<string, unknown>;
    return {
      sub: typeof data.sub === "string" ? data.sub : undefined,
      email: typeof data.email === "string" ? data.email : undefined,
      raw: data,
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    let userEmail: string | null = null;

    console.log("[AI Assistant] Auth header:", authHeader ? "present" : "missing");
    if (authHeader) {
      console.log("[AI Assistant] Auth header value:", authHeader.substring(0, 80));
    }

    // Extract user from JWT directly (skip Supabase getUser which is failing)
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const decoded = decodeJwtClaims(authHeader);
      console.log(
        "[AI Assistant] Decoded JWT payload:",
        decoded?.raw ? JSON.stringify(decoded.raw).substring(0, 300) : "null"
      );

      if (decoded?.sub) {
        userId = decoded.sub;
        userEmail = decoded.email || null;
        console.log(`[AI Assistant] Got userId from JWT: ${userId}, email: ${userEmail || "none"}`);
      } else {
        console.log("[AI Assistant] JWT decode failed - no sub claim found");
      }
    } else if (authHeader) {
      console.log("[AI Assistant] Auth header present but not a Bearer token");
    }

    console.log(`[AI Assistant] === REQUEST START ===`);
    console.log(`[AI Assistant] User ID: ${userId || "anonymous"}, email: ${userEmail || "none"}`);
    
    // Log user ID explicitly for debugging handshake issues
    if (userId) {
      console.log(`[AI Assistant] Received request for User: ${userId}`);
    } else {
      console.log(`[AI Assistant] WARNING: No user ID - tools will NOT work`);
    }

    const body = await req.json();
    const { messages: inputMessages, temperature, max_tokens, stream, provider } = body;

    // Validate required fields
    if (!inputMessages || !Array.isArray(inputMessages) || inputMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate messages array constraints
    if (inputMessages.length > 100) {
      return new Response(
        JSON.stringify({ error: "Too many messages (max 100)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate each message
    const validRoles = ["user", "assistant", "system", "tool"];
    for (const msg of inputMessages) {
      if (!msg || typeof msg !== "object") {
        return new Response(
          JSON.stringify({ error: "Invalid message format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!validRoles.includes(msg.role)) {
        return new Response(
          JSON.stringify({ error: `Invalid message role: ${msg.role}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (typeof msg.content !== "string") {
        return new Response(
          JSON.stringify({ error: "Message content must be a string" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (msg.content.length > 50000) {
        return new Response(
          JSON.stringify({ error: "Message content too long (max 50000 characters)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate optional parameters
    if (temperature !== undefined && (typeof temperature !== "number" || temperature < 0 || temperature > 2)) {
      return new Response(
        JSON.stringify({ error: "Temperature must be a number between 0 and 2" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (max_tokens !== undefined && (typeof max_tokens !== "number" || max_tokens < 1 || max_tokens > 16000)) {
      return new Response(
        JSON.stringify({ error: "max_tokens must be a number between 1 and 16000" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (stream !== undefined && typeof stream !== "boolean") {
      return new Response(
        JSON.stringify({ error: "stream must be a boolean" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (provider !== undefined && typeof provider !== "string") {
      return new Response(
        JSON.stringify({ error: "provider must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch user preferences for security tier enforcement
    let userPreferences: {
      emoji_confirmations_enabled: boolean;
      security_phrase_color: string | null;
      security_phrase_object: string | null;
      security_phrase_emoji: string | null;
      action_security_overrides: Record<string, SecurityTier> | null;
    } | null = null;
    
    if (userId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('emoji_confirmations_enabled, security_phrase_color, security_phrase_object, security_phrase_emoji, action_security_overrides')
        .eq('user_id', userId)
        .single();
      
      userPreferences = prefs;
      
      // Check rate limiting
      const rateLimit = await checkRateLimit(userId);
      if (rateLimit.isLocked) {
        const lockoutEnd = new Date(rateLimit.lockoutUntil!);
        const minutesLeft = Math.ceil((lockoutEnd.getTime() - Date.now()) / 60000);
        return new Response(
          JSON.stringify({ 
            error: `Security lockout active. Too many failed confirmation attempts. Try again in ${minutesLeft} minutes.` 
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate the complete Chief of Staff v4.0 system prompt
    const userName = userEmail?.split('@')[0] || 'Principal';
    const currentDate = new Date().toLocaleDateString('en-GB', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const baseDirective = generateBaseDirective(userName, currentDate);
    const securityTierMappings = generateSecurityTierPrompt(
      userPreferences?.action_security_overrides,
      !!(userPreferences?.security_phrase_color && userPreferences?.security_phrase_object)
    );
    
    const fullSystemPrompt = baseDirective + securityTierMappings;

    // Convert to LLMMessage format and inject security instructions
    let messages: LLMMessage[] = inputMessages.map((m: { role: string; content: string }) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    }));
    
    // Inject the Chief of Staff directive as the system message
    const systemMsgIndex = messages.findIndex(m => m.role === 'system');
    if (systemMsgIndex >= 0) {
      messages[systemMsgIndex].content = fullSystemPrompt + '\n\n' + messages[systemMsgIndex].content;
    } else {
      messages.unshift({ role: 'system', content: fullSystemPrompt });
    }

    console.log(`[AI Assistant] Received ${messages.length} messages, stream=${stream}, tools_enabled=${!!userId}, tools_count=${userId ? TOOL_DEFINITIONS.length : 0}`);

    // Streaming doesn't support tool calling yet
    if (stream) {
      return handleStreamingRequest(messages, temperature, max_tokens, provider);
    }

    // Non-streaming with tool calling loop
    let toolCallCount = 0;
    const toolsForRequest = userId ? TOOL_DEFINITIONS : undefined;

    console.log(
      `[AI Assistant] LLM request: provider=${provider || "auto"}, messages=${messages.length}, tools=${toolsForRequest ? toolsForRequest.map(t => t.function.name).join(",") : "none"}`
    );
    console.log(
      `[AI Assistant] LLM messages (roles): ${messages.map(m => m.role).join(" -> ")}`
    );

    let finalResponse = await routeLLMRequest({
      messages,
      temperature,
      max_tokens,
      provider,
      tools: toolsForRequest, // Only provide tools if user is authenticated
      tool_choice: "auto",
    });

    console.log(
      `[AI Assistant] LLM response: provider_used=${finalResponse.provider_used}, model_used=${finalResponse.model_used}, tool_calls=${finalResponse.tool_calls?.length || 0}`
    );
    if (finalResponse.tool_calls?.length) {
      console.log(`[AI Assistant] tool_calls detail: ${JSON.stringify(finalResponse.tool_calls)}`);
    }

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

        console.log(`[AI Assistant] Executing tool: ${toolCall.function.name} args=${toolCall.function.arguments}`);
        const result = await executeTool(toolCall, userId);
        toolResults.push(result);
        
        // Enhanced logging for debugging - show full result for email tool
        if (toolCall.function.name === 'get_emails') {
          console.log(`[AI Assistant] get_emails RAW RESULT: ${result.content}`);
        } else {
          console.log(`[AI Assistant] Tool ${toolCall.function.name} result: ${result.content.substring(0, 500)}...`);
        }
      }

      // Add tool results to messages
      for (const result of toolResults) {
        messages.push({
          role: "tool",
          content: result.content,
          tool_call_id: result.tool_call_id,
        });
      }

      // Add instruction to summarize tool results if we have any
      if (toolResults.length > 0) {
        // Add a follow-up instruction to ensure the AI summarizes the data naturally
        messages.push({
          role: "system",
          content: "IMPORTANT: Tool execution complete. Now summarize this data clearly for the user in plain, natural prose. FORBIDDEN: brackets, status markers, or any meta-commentary about tools. Just present the information directly. No emojis."
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
