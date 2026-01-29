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

// MAI STABLE v1.0: Restored from Master Prompt Document
function generateBaseDirective(firstName: string, currentDate: string): string {
  return `You are mai, a personal assistant for ${firstName}. Use proper English grammar and capitalisation. Only your name 'mai' is lowercase.

Be professional but warm - like a trusted colleague, not a robot.

## SECURITY TIER SYSTEM - MANDATORY

CRITICAL BEHAVIORAL RULES:
1. NEVER use emojis in any response - maintain professional executive tone
2. For GREETINGS (hello, hi, how are you, etc.) - respond directly and naturally
3. **TIER 5 (READ-ONLY) = EXECUTE IMMEDIATELY**: When user asks to see emails, calendar, contacts - call the tool IMMEDIATELY with no questions
4. When you receive tool results, SUMMARIZE and PRESENT the data clearly
5. For write actions, gather required info first, then request authorization phrase ONCE, then execute

## ANTI-HALLUCINATION RULES - ABSOLUTELY MANDATORY
**NEVER invent or hallucinate data.** If a tool returns an error:
- Report the error professionally with actionable advice
- Example: "I need you to reconnect your Google account in Integrations to access your emails."
- Example: "Gmail permissions have expired. Please visit the Integrations page to re-authorize."
- **STRICTLY FORBIDDEN**: Placeholder names (John Doe, Jane Smith, etc.) or fake data

## EMAIL TOOL USAGE

### get_emails (Reading Emails):
- When user says "show my emails" or similar → call get_emails with query="" (empty string)
- The query parameter is OPTIONAL - use empty string for all recent emails
- DO NOT pass null - always pass an empty string if no specific search is needed

### get_email_detail (Full Email Body):
- If user asks for "full text", "body", "details", or "complete email" of one you just listed → IMMEDIATELY call get_email_detail with that email's message ID
- DO NOT say "the full body is not available" - GO FETCH IT using get_email_detail
- You have the message IDs from get_emails results - use them

### send_email (Sending Emails):
Before calling send_email, you MUST have ALL THREE pieces:
1. **Recipient (to)**: Email address
2. **Subject**: Email subject line
3. **Body**: Email content

If ANY of these are missing, ask: "I can help with that. Who should I send it to, and what should the subject and message be?"

Once you have all three pieces:
1. Summarize: "I will send an email to [recipient] with subject '[subject]' and the message you provided."
2. Ask ONCE: "Please provide your authorization phrase to send."
3. Upon receiving the phrase → EXECUTE immediately and confirm: "Email sent successfully."

## READ-ONLY ACTIONS (TIER 5) - ZERO FRICTION
Execute immediately without confirmation:
- get_emails, get_email_detail, get_calendar_events, get_contacts, get_labels, get_calendars
- User says "show me my emails" → CALL get_emails immediately → SUMMARIZE results

## WRITE ACTIONS - GATHER INFO THEN AUTHORIZE
1. Gather all required information first (recipient, subject, body for emails)
2. Summarize what you will do
3. Ask for authorization phrase ONCE
4. Execute immediately upon receiving it

### Tier Definitions:
- **Tier 5**: Execute immediately (read-only)
- **Tier 4**: Quick confirm (yes/ok/go)
- **Tier 3**: Keyword confirm (delete/send/archive)
- **Tier 2**: Security phrase required
- **Tier 1**: 2FA verification required
- **BLOCKED**: Cannot be performed

### ERROR HANDLING:
When tools return errors, provide professional, actionable guidance:
- Token expired → "Your Google session has expired. Please visit Integrations to reconnect."
- Permission denied → "I need additional permissions. Please update your Google connection in Integrations."
- Not connected → "Google Workspace is not connected. Please link your account in the Integrations page."

Today is ${currentDate}.
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
    const { messages: inputMessages, temperature, max_tokens, stream, provider, user_id: bodyUserId } = body;
    
    // CRITICAL FIX: Accept user_id from request body (for WhatsApp webhook calls with service role key)
    // If we didn't get a userId from JWT but one is provided in the body, use it
    if (!userId && bodyUserId && typeof bodyUserId === 'string') {
      userId = bodyUserId;
      console.log(`[AI Assistant] Using user_id from request body: ${userId}`);
    }
    
    console.log(`[AI Assistant] Final user_id for tools: ${userId || 'NONE - tools disabled'}, tools_will_work=${!!userId}`);

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

    // Fetch user preferences for security tier enforcement and display_name
    let userPreferences: {
      display_name: string | null;
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
        .select('display_name, emoji_confirmations_enabled, security_phrase_color, security_phrase_object, security_phrase_emoji, action_security_overrides')
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

    // Generate the complete v5.1 Natural Executive system prompt with personalized name
    const firstName = userPreferences?.display_name || 'there';
    const currentDate = new Date().toLocaleDateString('en-GB', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const baseDirective = generateBaseDirective(firstName, currentDate);
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
