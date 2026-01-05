/**
 * Tool definitions and execution for mai AI assistant
 * Handles calendar, email, and monday.com integrations
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt } from "./encryption.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============= Tool Definitions (OpenAI format) =============

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "Get upcoming calendar events from Google Calendar. Use this when the user asks about their schedule, meetings, or what's on their calendar.",
      parameters: {
        type: "object",
        properties: {
          time_min: {
            type: "string",
            description: "Start time in ISO 8601 format. Defaults to now if not specified.",
          },
          time_max: {
            type: "string",
            description: "End time in ISO 8601 format. Defaults to 7 days from now if not specified.",
          },
          max_results: {
            type: "number",
            description: "Maximum number of events to return. Defaults to 10.",
          },
        },
        required: [],
      },
    },
  },
  // Future tools will be added here:
  // - send_email
  // - get_emails
  // - get_monday_boards
  // - create_monday_item
];

// ============= Tool Call Types =============

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string; // JSON string of result
}

// ============= Token Retrieval =============

async function getValidToken(userId: string, provider: string): Promise<string | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Get the integration record
    const { data: integration, error: fetchError } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();

    if (fetchError || !integration) {
      console.error(`[Tools] No ${provider} integration found for user`);
      return null;
    }

    // Check if token needs refresh
    const expiresAt = new Date(integration.token_expires_at).getTime();
    const now = Date.now();
    const REFRESH_BUFFER_MS = 5 * 60 * 1000;
    const needsRefresh = expiresAt - now < REFRESH_BUFFER_MS;

    if (needsRefresh) {
      // Call the refresh endpoint
      console.log(`[Tools] Token needs refresh for ${provider}`);
      
      const { data: refreshTokenRow } = await supabase
        .from("encrypted_integration_tokens")
        .select("encrypted_value")
        .eq("user_id", userId)
        .eq("provider", provider)
        .eq("token_type", "refresh_token")
        .maybeSingle();

      if (!refreshTokenRow) {
        console.error(`[Tools] No refresh token available for ${provider}`);
        return null;
      }

      const refreshToken = await decrypt(refreshTokenRow.encrypted_value);
      
      // Refresh the token
      const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
      const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
      
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const tokenData = await tokenResponse.json();
      if (tokenData.error) {
        console.error(`[Tools] Token refresh failed:`, tokenData);
        return null;
      }

      return tokenData.access_token;
    }

    // Token is valid, decrypt and return
    const { data: accessTokenRow } = await supabase
      .from("encrypted_integration_tokens")
      .select("encrypted_value")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("token_type", "access_token")
      .maybeSingle();

    if (!accessTokenRow) {
      console.error(`[Tools] No access token found for ${provider}`);
      return null;
    }

    return await decrypt(accessTokenRow.encrypted_value);
  } catch (error) {
    console.error(`[Tools] Error getting token for ${provider}:`, error);
    return null;
  }
}

// ============= Tool Implementations =============

interface CalendarEventAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
}

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
  attendees?: CalendarEventAttendee[];
}

async function getCalendarEvents(
  userId: string,
  args: { time_min?: string; time_max?: string; max_results?: number }
): Promise<{ success: boolean; events?: CalendarEvent[]; error?: string }> {
  const now = new Date();
  const timeMin = args.time_min || now.toISOString();
  const timeMax = args.time_max || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const maxResults = args.max_results || 10;

  console.log(`[Tools] get_calendar_events: timeMin=${timeMin}, timeMax=${timeMax}, maxResults=${maxResults}`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Calendar API error: ${response.status} - ${errorText}`);
      return { success: false, error: "Failed to fetch calendar events" };
    }

    const data = await response.json();
    const events: CalendarEvent[] = (data.items || []).map((item: {
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
    }) => ({
      summary: item.summary || "Untitled event",
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      location: item.location,
      attendees: item.attendees?.map(a => ({
        email: a.email || "",
        displayName: a.displayName,
        responseStatus: a.responseStatus,
      })),
    }));

    console.log(`[Tools] Found ${events.length} calendar events`);
    return { success: true, events };
  } catch (error) {
    console.error(`[Tools] Calendar fetch error:`, error);
    return { success: false, error: "Failed to access calendar" };
  }
}

// ============= Tool Execution Router =============

export async function executeTool(
  toolCall: ToolCall,
  userId: string
): Promise<ToolResult> {
  const { name, arguments: argsString } = toolCall.function;
  
  console.log(`[Tools] Executing tool: ${name}`);
  
  let result: unknown;
  
  try {
    const args = JSON.parse(argsString);
    
    switch (name) {
      case "get_calendar_events":
        result = await getCalendarEvents(userId, args);
        break;
      
      // Future tool implementations:
      // case "send_email":
      // case "get_emails":
      // case "get_monday_boards":
      // case "create_monday_item":
      
      default:
        result = { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    console.error(`[Tools] Tool execution error:`, error);
    result = { success: false, error: `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}` };
  }
  
  return {
    tool_call_id: toolCall.id,
    role: "tool",
    content: JSON.stringify(result),
  };
}
