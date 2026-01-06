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
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new event on the user's Google Calendar. Use this when the user wants to schedule, add, or create a meeting or event.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Title of the event",
          },
          start_time: {
            type: "string",
            description: "Start time in ISO 8601 format (e.g., 2026-01-06T10:00:00+04:00)",
          },
          end_time: {
            type: "string",
            description: "End time in ISO 8601 format",
          },
          description: {
            type: "string",
            description: "Description/notes for the event",
          },
          location: {
            type: "string",
            description: "Location of the event",
          },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "List of attendee email addresses",
          },
          add_video_call: {
            type: "boolean",
            description: "If true, adds a Google Meet video call link to the event",
          },
        },
        required: ["summary", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_calendar_event",
      description: "Update an existing event on the user's Google Calendar. Use this when the user wants to reschedule, modify, or change an existing meeting or event. You must first find the event using get_calendar_events to get the event_id.",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "The ID of the event to update (obtained from get_calendar_events)",
          },
          summary: {
            type: "string",
            description: "New title for the event (optional)",
          },
          start_time: {
            type: "string",
            description: "New start time in ISO 8601 format (optional)",
          },
          end_time: {
            type: "string",
            description: "New end time in ISO 8601 format (optional)",
          },
          description: {
            type: "string",
            description: "New description/notes for the event (optional)",
          },
          location: {
            type: "string",
            description: "New location for the event (optional)",
          },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "Updated list of attendee email addresses (optional, replaces existing attendees)",
          },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_emails",
      description: "Get emails from the user's Gmail inbox. Use this when the user asks about their emails, inbox, or messages.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Gmail search query (e.g., 'is:unread', 'from:john@example.com', 'subject:invoice'). Defaults to recent emails if not specified.",
          },
          max_results: {
            type: "number",
            description: "Maximum number of emails to return. Defaults to 10.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email from the user's Gmail account. Use this when the user wants to compose, send, or email someone. The email will include the user's Gmail signature automatically.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content (plain text)",
          },
          cc: {
            type: "string",
            description: "CC recipients (comma-separated)",
          },
          bcc: {
            type: "string",
            description: "BCC recipients (comma-separated)",
          },
          attachments: {
            type: "array",
            items: { type: "string" },
            description: "File paths or URLs to attach (not yet implemented)",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_preferences",
      description: "Get the user's preferences including emoji confirmation settings and security phrase. Use this internally to know how to handle confirmations.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // Future tools will be added here:
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
  id: string;
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
      id?: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
    }) => ({
      id: item.id || "",
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

interface CreateCalendarEventArgs {
  summary: string;
  start_time: string;
  end_time: string;
  description?: string;
  location?: string;
  attendees?: string[];
  add_video_call?: boolean;
}

interface CreatedEventResult {
  success: boolean;
  event?: {
    id: string;
    summary: string;
    start: string;
    end: string;
    htmlLink: string;
    meetLink?: string;
  };
  error?: string;
}

async function createCalendarEvent(
  userId: string,
  args: CreateCalendarEventArgs
): Promise<CreatedEventResult> {
  console.log(`[Tools] create_calendar_event: summary="${args.summary}", start=${args.start_time}, end=${args.end_time}`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    const eventBody: Record<string, unknown> = {
      summary: args.summary,
      start: { dateTime: args.start_time },
      end: { dateTime: args.end_time },
    };

    if (args.description) {
      eventBody.description = args.description;
    }
    if (args.location) {
      eventBody.location = args.location;
    }
    if (args.attendees && args.attendees.length > 0) {
      eventBody.attendees = args.attendees.map((email) => ({ email }));
    }

    // Add Google Meet video call if requested
    if (args.add_video_call) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    // Use conferenceDataVersion=1 if adding video call
    const apiUrl = args.add_video_call
      ? "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1"
      : "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Calendar API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to create event: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Tools] Created calendar event: ${data.id}`);

    // Extract Google Meet link if present
    const meetLink = data.conferenceData?.entryPoints?.find(
      (ep: { entryPointType: string; uri: string }) => ep.entryPointType === "video"
    )?.uri;

    return {
      success: true,
      event: {
        id: data.id,
        summary: data.summary,
        start: data.start?.dateTime || data.start?.date || "",
        end: data.end?.dateTime || data.end?.date || "",
        htmlLink: data.htmlLink,
        meetLink,
      },
    };
  } catch (error) {
    console.error(`[Tools] Calendar create error:`, error);
    return { success: false, error: "Failed to create calendar event" };
  }
}

// ============= Update Calendar Event =============

interface UpdateCalendarEventArgs {
  event_id: string;
  summary?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface UpdatedEventResult {
  success: boolean;
  event?: {
    id: string;
    summary: string;
    start: string;
    end: string;
    htmlLink: string;
  };
  error?: string;
}

async function updateCalendarEvent(
  userId: string,
  args: UpdateCalendarEventArgs
): Promise<UpdatedEventResult> {
  console.log(`[Tools] update_calendar_event: event_id="${args.event_id}"`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    // First, get the existing event to preserve fields we're not updating
    const getUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${args.event_id}`;
    const getResponse = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error(`[Tools] Calendar API error fetching event: ${getResponse.status} - ${errorText}`);
      return { success: false, error: `Event not found or access denied: ${getResponse.status}` };
    }

    const existingEvent = await getResponse.json();

    // Build the update body, preserving existing fields
    const eventBody: Record<string, unknown> = {
      summary: args.summary ?? existingEvent.summary,
      start: args.start_time ? { dateTime: args.start_time } : existingEvent.start,
      end: args.end_time ? { dateTime: args.end_time } : existingEvent.end,
    };

    if (args.description !== undefined) {
      eventBody.description = args.description;
    } else if (existingEvent.description) {
      eventBody.description = existingEvent.description;
    }

    if (args.location !== undefined) {
      eventBody.location = args.location;
    } else if (existingEvent.location) {
      eventBody.location = existingEvent.location;
    }

    if (args.attendees !== undefined) {
      eventBody.attendees = args.attendees.map((email) => ({ email }));
    } else if (existingEvent.attendees) {
      eventBody.attendees = existingEvent.attendees;
    }

    // Preserve conference data if it exists
    if (existingEvent.conferenceData) {
      eventBody.conferenceData = existingEvent.conferenceData;
    }

    // Update the event
    const updateUrl = existingEvent.conferenceData
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${args.event_id}?conferenceDataVersion=1`
      : `https://www.googleapis.com/calendar/v3/calendars/primary/events/${args.event_id}`;

    const response = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Calendar API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to update event: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Tools] Updated calendar event: ${data.id}`);

    return {
      success: true,
      event: {
        id: data.id,
        summary: data.summary,
        start: data.start?.dateTime || data.start?.date || "",
        end: data.end?.dateTime || data.end?.date || "",
        htmlLink: data.htmlLink,
      },
    };
  } catch (error) {
    console.error(`[Tools] Calendar update error:`, error);
    return { success: false, error: "Failed to update calendar event" };
  }
}

// ============= Gmail Tool Implementations =============

interface EmailSummary {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
}

interface GetEmailsResult {
  success: boolean;
  emails?: EmailSummary[];
  error?: string;
}

async function getEmails(
  userId: string,
  args: { query?: string; max_results?: number }
): Promise<GetEmailsResult> {
  const query = args.query || "";
  const maxResults = args.max_results || 10;

  console.log(`[Tools] get_emails: query="${query}", maxResults=${maxResults}`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    // Step 1: Get list of message IDs
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    if (query) {
      listUrl.searchParams.set("q", query);
    }
    listUrl.searchParams.set("maxResults", String(maxResults));

    const listResponse = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error(`[Tools] Gmail list error: ${listResponse.status} - ${errorText}`);
      return { success: false, error: "Failed to fetch emails" };
    }

    const listData = await listResponse.json();
    const messageIds: string[] = (listData.messages || []).map((m: { id: string }) => m.id);

    if (messageIds.length === 0) {
      return { success: true, emails: [] };
    }

    // Step 2: Fetch metadata for each message
    const emails: EmailSummary[] = [];

    for (const messageId of messageIds) {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;

      const msgResponse = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgResponse.ok) {
        console.error(`[Tools] Failed to fetch message ${messageId}`);
        continue;
      }

      const msgData = await msgResponse.json();
      const headers = msgData.payload?.headers || [];

      const getHeader = (name: string): string => {
        const h = headers.find((h: { name: string; value: string }) => 
          h.name.toLowerCase() === name.toLowerCase()
        );
        return h?.value || "";
      };

      emails.push({
        id: msgData.id,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: msgData.snippet || "",
      });
    }

    console.log(`[Tools] Found ${emails.length} emails`);
    return { success: true, emails };
  } catch (error) {
    console.error(`[Tools] Gmail fetch error:`, error);
    return { success: false, error: "Failed to access Gmail" };
  }
}

interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  attachments?: string[];
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  invalidEmails?: string[];
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Clean and validate email addresses
function cleanEmailAddress(email: string): { cleaned: string; valid: boolean } {
  // Remove all spaces
  const cleaned = email.replace(/\s+/g, "").trim();
  const valid = EMAIL_REGEX.test(cleaned);
  return { cleaned, valid };
}

// Clean a comma-separated list of emails
function cleanEmailList(emails: string): { cleaned: string; invalid: string[] } {
  const parts = emails.split(",").map((e) => e.trim()).filter(Boolean);
  const cleanedParts: string[] = [];
  const invalid: string[] = [];

  for (const part of parts) {
    const { cleaned, valid } = cleanEmailAddress(part);
    if (valid) {
      cleanedParts.push(cleaned);
    } else {
      invalid.push(part);
    }
  }

  return { cleaned: cleanedParts.join(", "), invalid };
}

// Fetch user's Gmail signature from sendAs settings
async function fetchGmailSignature(accessToken: string): Promise<{ signature: string; isHtml: boolean } | null> {
  try {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.log(`[Tools] Could not fetch sendAs settings: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const sendAsAddresses = data.sendAs || [];
    
    // Find the primary/default send-as address
    const primary = sendAsAddresses.find(
      (sa: { isPrimary?: boolean; isDefault?: boolean }) => sa.isPrimary || sa.isDefault
    ) || sendAsAddresses[0];

    if (!primary || !primary.signature) {
      console.log("[Tools] No signature found in sendAs settings");
      return null;
    }

    // Gmail signatures are HTML
    console.log("[Tools] Found Gmail signature");
    return { signature: primary.signature, isHtml: true };
  } catch (error) {
    console.error("[Tools] Error fetching signature:", error);
    return null;
  }
}

async function sendEmail(
  userId: string,
  args: SendEmailArgs
): Promise<SendEmailResult> {
  console.log(`[Tools] send_email: to="${args.to}", subject="${args.subject}"`);

  // Clean and validate email addresses
  const toResult = cleanEmailAddress(args.to);
  if (!toResult.valid) {
    return { 
      success: false, 
      error: `Invalid email address: "${args.to}". Please provide a valid email address.`,
      invalidEmails: [args.to]
    };
  }
  const cleanedTo = toResult.cleaned;

  let cleanedCc = "";
  let cleanedBcc = "";
  const allInvalidEmails: string[] = [];

  if (args.cc) {
    const ccResult = cleanEmailList(args.cc);
    cleanedCc = ccResult.cleaned;
    allInvalidEmails.push(...ccResult.invalid);
  }

  if (args.bcc) {
    const bccResult = cleanEmailList(args.bcc);
    cleanedBcc = bccResult.cleaned;
    allInvalidEmails.push(...bccResult.invalid);
  }

  if (allInvalidEmails.length > 0) {
    return {
      success: false,
      error: `Invalid email addresses found: ${allInvalidEmails.join(", ")}. Please correct them.`,
      invalidEmails: allInvalidEmails
    };
  }

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    // Fetch user's Gmail signature
    const signatureData = await fetchGmailSignature(accessToken);
    
    let emailBody = args.body;
    let contentType = "text/plain; charset=utf-8";

    // mai branding
    const maiBrandingText = "Sent via mai, my AI assistant.";
    const maiBrandingHtml = `<span style="color: #888; font-size: 12px;">Sent via mai, my AI assistant.</span>`;

    if (signatureData && signatureData.signature) {
      if (signatureData.isHtml) {
        // Convert plain text body to HTML, add mai branding, then signature
        const htmlBody = args.body.replace(/\n/g, "<br>");
        emailBody = `${htmlBody}<br><br>${maiBrandingHtml}<br><br>${signatureData.signature}`;
        contentType = "text/html; charset=utf-8";
      } else {
        // Plain text: body + mai branding + signature
        emailBody = `${args.body}\n\n${maiBrandingText}\n\n${signatureData.signature}`;
      }
      console.log("[Tools] Appended mai branding and signature to email");
    } else {
      // No signature - just add mai branding
      const htmlBody = args.body.replace(/\n/g, "<br>");
      emailBody = `${htmlBody}<br><br>${maiBrandingHtml}`;
      contentType = "text/html; charset=utf-8";
      console.log("[Tools] Appended mai branding to email (no signature)");
    }

    // Construct RFC 2822 formatted email
    let emailContent = `To: ${cleanedTo}\r\n`;
    if (cleanedCc) {
      emailContent += `Cc: ${cleanedCc}\r\n`;
    }
    if (cleanedBcc) {
      emailContent += `Bcc: ${cleanedBcc}\r\n`;
    }
    emailContent += `Subject: ${args.subject}\r\n`;
    emailContent += `Content-Type: ${contentType}\r\n`;
    emailContent += `\r\n`;
    emailContent += emailBody;

    // Base64url encode the email
    const encoder = new TextEncoder();
    const emailBytes = encoder.encode(emailContent);
    const base64Email = btoa(String.fromCharCode(...emailBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send the email directly
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: base64Email }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail send error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to send email: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Tools] Sent email: ${data.id}`);

    return { success: true, messageId: data.id };
  } catch (error) {
    console.error(`[Tools] Gmail send error:`, error);
    return { success: false, error: "Failed to send email" };
  }
}

// ============= User Preferences =============

interface UserPreferencesResult {
  success: boolean;
  preferences?: {
    emoji_confirmations_enabled: boolean;
    security_phrase_text: string | null;
    security_phrase_emoji: string | null;
    has_security_phrase: boolean;
  };
  error?: string;
}

async function getUserPreferences(userId: string): Promise<UserPreferencesResult> {
  console.log(`[Tools] get_user_preferences for user ${userId}`);
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(`[Tools] Error fetching preferences:`, error);
      return { success: false, error: "Failed to fetch preferences" };
    }

    if (!data) {
      // Return defaults if no preferences set
      return {
        success: true,
        preferences: {
          emoji_confirmations_enabled: true,
          security_phrase_text: null,
          security_phrase_emoji: null,
          has_security_phrase: false,
        },
      };
    }

    const securityPhraseText = data.security_phrase_color && data.security_phrase_object
      ? `${data.security_phrase_color} ${data.security_phrase_object}`
      : null;

    return {
      success: true,
      preferences: {
        emoji_confirmations_enabled: data.emoji_confirmations_enabled,
        security_phrase_text: securityPhraseText,
        security_phrase_emoji: data.security_phrase_emoji || null,
        has_security_phrase: !!(data.security_phrase_color && data.security_phrase_object),
      },
    };
  } catch (error) {
    console.error(`[Tools] Preferences error:`, error);
    return { success: false, error: "Failed to access preferences" };
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
      
      case "create_calendar_event":
        result = await createCalendarEvent(userId, args);
        break;
      
      case "update_calendar_event":
        result = await updateCalendarEvent(userId, args);
        break;
      
      case "get_emails":
        result = await getEmails(userId, args);
        break;
      
      case "send_email":
        result = await sendEmail(userId, args);
        break;
      
      case "get_user_preferences":
        result = await getUserPreferences(userId);
        break;
      
      // Future tool implementations:
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
