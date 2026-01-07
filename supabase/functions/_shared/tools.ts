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
    name: "delete_calendar_event",
    description: "Delete a calendar event. This is a destructive action that requires user confirmation. Use this ONLY when the user explicitly confirms they want to delete an event by responding with 🗑️ or typing 'delete'.",
    parameters: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "The ID of the event to delete (obtained from get_calendar_events)",
        },
      },
      required: ["event_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "get_calendars",
    description: "Get list of user's calendars (work, personal, etc.). Use this when the user asks about their different calendars or wants to create an event on a specific calendar.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
},
{
  type: "function",
  function: {
    name: "get_free_busy",
    description: "Check free/busy status for a time range across calendars. Use this to check availability before scheduling meetings.",
    parameters: {
      type: "object",
      properties: {
        start_time: {
          type: "string",
          description: "Start time in ISO 8601 format",
        },
        end_time: {
          type: "string",
          description: "End time in ISO 8601 format",
        },
        calendar_ids: {
          type: "array",
          items: { type: "string" },
          description: "Optional array of calendar IDs to check. Defaults to primary calendar.",
        },
      },
      required: ["start_time", "end_time"],
    },
  },
},
{
  type: "function",
  function: {
    name: "find_available_slots",
    description: "Find available meeting slots within a date range. Use this when the user asks when they're free or wants to find time for a meeting.",
    parameters: {
      type: "object",
      properties: {
        duration_minutes: {
          type: "number",
          description: "Duration of the meeting in minutes",
        },
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
        },
        preferred_times: {
          type: "string",
          description: "Optional preference: 'morning' (9am-12pm), 'afternoon' (12pm-5pm), or 'evening' (5pm-8pm)",
        },
      },
      required: ["duration_minutes", "start_date", "end_date"],
    },
  },
},
{
  type: "function",
  function: {
    name: "create_event_on_calendar",
    description: "Create an event on a specific calendar (not just primary). Use this when the user wants to add an event to a specific calendar like their work or personal calendar.",
    parameters: {
      type: "object",
      properties: {
        calendar_id: {
          type: "string",
          description: "The calendar ID to create the event on",
        },
        summary: {
          type: "string",
          description: "Title of the event",
        },
        start_time: {
          type: "string",
          description: "Start time in ISO 8601 format",
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
          description: "If true, adds a Google Meet video call link",
        },
      },
      required: ["calendar_id", "summary", "start_time", "end_time"],
    },
  },
},
{
  type: "function",
  function: {
    name: "rsvp_to_event",
    description: "Respond to a calendar invite (accept, decline, or tentative).",
    parameters: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "The ID of the event to respond to",
        },
        response: {
          type: "string",
          description: "Your response: 'accepted', 'declined', or 'tentative'",
        },
      },
      required: ["event_id", "response"],
    },
  },
},
{
  type: "function",
  function: {
    name: "get_event_attendees",
    description: "Get list of attendees and their RSVP status for an event.",
    parameters: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "The ID of the event",
        },
      },
      required: ["event_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "create_recurring_event",
    description: "Create a recurring event series (daily, weekly, monthly).",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Title of the event",
        },
        start_time: {
          type: "string",
          description: "Start time in ISO 8601 format",
        },
        end_time: {
          type: "string",
          description: "End time in ISO 8601 format",
        },
        recurrence_rule: {
          type: "string",
          description: "Recurrence pattern: 'daily', 'weekly', 'monthly', or a custom RRULE string",
        },
        description: {
          type: "string",
          description: "Description/notes for the event",
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "List of attendee email addresses",
        },
        location: {
          type: "string",
          description: "Location of the event",
        },
        add_video_call: {
          type: "boolean",
          description: "If true, adds a Google Meet video call link",
        },
      },
      required: ["summary", "start_time", "end_time", "recurrence_rule"],
    },
  },
},
{
  type: "function",
  function: {
    name: "update_single_occurrence",
    description: "Modify a single occurrence of a recurring event without affecting the series.",
    parameters: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "The ID of the recurring event series",
        },
        instance_date: {
          type: "string",
          description: "The date of the specific occurrence to modify (YYYY-MM-DD format)",
        },
        new_start_time: {
          type: "string",
          description: "New start time in ISO 8601 format",
        },
        new_end_time: {
          type: "string",
          description: "New end time in ISO 8601 format",
        },
        new_summary: {
          type: "string",
          description: "New title for this occurrence",
        },
      },
      required: ["event_id", "instance_date"],
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
{
  type: "function",
  function: {
    name: "delete_email",
    description: "Delete an email (move to trash). This is a destructive action that requires Tier C confirmation. Use this ONLY when the user explicitly confirms they want to delete the email by responding with 🗑️ or typing 'delete'.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The ID of the email to delete",
        },
      },
      required: ["message_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "archive_email",
    description: "Archive an email (remove from inbox). This is a destructive action that requires Tier C confirmation. Use this ONLY when the user explicitly confirms they want to archive by responding with 🗑️ or typing 'delete'.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The ID of the email to archive",
        },
      },
      required: ["message_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "create_draft",
    description: "Create an email draft without sending. Use this when the user wants to save a draft for later.",
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
      },
      required: ["to", "subject", "body"],
    },
  },
},
{
  type: "function",
  function: {
    name: "mark_email_read",
    description: "Mark an email as read.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The ID of the email to mark as read",
        },
      },
      required: ["message_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "mark_email_unread",
    description: "Mark an email as unread.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The ID of the email to mark as unread",
        },
      },
      required: ["message_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "reply_to_email",
    description: "Reply to an email thread. Requires confirmation before sending - show the draft first and ask for approval.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The ID of the email to reply to",
        },
        body: {
          type: "string",
          description: "Reply body content (plain text)",
        },
      },
      required: ["message_id", "body"],
    },
  },
},
{
  type: "function",
  function: {
    name: "forward_email",
    description: "Forward an email to someone. Requires confirmation before sending - show the draft first and ask for approval.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The ID of the email to forward",
        },
        to: {
          type: "string",
          description: "Recipient email address to forward to",
        },
        body: {
          type: "string",
          description: "Optional additional message to include above the forwarded email",
        },
      },
      required: ["message_id", "to"],
    },
  },
},
{
  type: "function",
  function: {
    name: "get_labels",
    description: "Get list of Gmail labels (folders/categories).",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
},
{
  type: "function",
  function: {
    name: "apply_label",
    description: "Apply a label to an email.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The ID of the email",
        },
        label_id: {
          type: "string",
          description: "The ID of the label to apply",
        },
      },
      required: ["message_id", "label_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "remove_label",
    description: "Remove a label from an email.",
    parameters: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The ID of the email",
        },
        label_id: {
          type: "string",
          description: "The ID of the label to remove",
        },
      },
      required: ["message_id", "label_id"],
    },
  },
},
// ============= Monday.com Tools =============
{
  type: "function",
  function: {
    name: "monday_get_boards",
    description: "Get list of all Monday.com boards the user has access to. Use this when the user asks about their boards, projects, or tasks in Monday.com.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_get_board",
    description: "Get details of a specific Monday.com board including its columns and groups. Use this to understand the structure before creating or updating items.",
    parameters: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the board to get details for",
        },
      },
      required: ["board_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_get_items",
    description: "Get items (tasks) from a Monday.com board. Optionally filter by group.",
    parameters: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the board",
        },
        group_id: {
          type: "string",
          description: "Optional group ID to filter items by group",
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return. Defaults to 25.",
        },
      },
      required: ["board_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_get_item",
    description: "Get details of a specific Monday.com item including its updates/comments.",
    parameters: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          description: "The ID of the item",
        },
      },
      required: ["item_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_search_items",
    description: "Search for items by name within a Monday.com board.",
    parameters: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the board to search in",
        },
        search_term: {
          type: "string",
          description: "The search term to find in item names",
        },
      },
      required: ["board_id", "search_term"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_get_me",
    description: "Get the current Monday.com user's information.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_create_item",
    description: "Create a new item (task) on a Monday.com board. This is a Tier B action - show the item details and ask for confirmation before creating.",
    parameters: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the board",
        },
        item_name: {
          type: "string",
          description: "The name/title of the item",
        },
        group_id: {
          type: "string",
          description: "Optional group ID to place the item in",
        },
        column_values: {
          type: "object",
          description: "Optional column values as a JSON object (column_id: value)",
        },
      },
      required: ["board_id", "item_name"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_update_item",
    description: "Update column values on a Monday.com item. This is a Tier B action - show the proposed changes and ask for confirmation.",
    parameters: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the board",
        },
        item_id: {
          type: "string",
          description: "The ID of the item to update",
        },
        column_values: {
          type: "object",
          description: "Column values to update as a JSON object (column_id: value)",
        },
      },
      required: ["board_id", "item_id", "column_values"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_change_status",
    description: "Change the status column of a Monday.com item. This is a Tier B action - confirm with user before changing.",
    parameters: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the board",
        },
        item_id: {
          type: "string",
          description: "The ID of the item",
        },
        column_id: {
          type: "string",
          description: "The ID of the status column",
        },
        status_label: {
          type: "string",
          description: "The status label to set (e.g., 'Done', 'Working on it', 'Stuck')",
        },
      },
      required: ["board_id", "item_id", "column_id", "status_label"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_add_update",
    description: "Add a comment/update to a Monday.com item. This is a Tier B action - show the comment and ask for confirmation.",
    parameters: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          description: "The ID of the item",
        },
        body: {
          type: "string",
          description: "The comment/update text",
        },
      },
      required: ["item_id", "body"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_delete_item",
    description: "Delete a Monday.com item. This is a Tier C destructive action - requires 🗑️ or 'delete' confirmation.",
    parameters: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          description: "The ID of the item to delete",
        },
      },
      required: ["item_id"],
    },
  },
},
{
  type: "function",
  function: {
    name: "monday_archive_item",
    description: "Archive a Monday.com item. This is a Tier C action - requires 🗑️ or 'delete' confirmation.",
    parameters: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          description: "The ID of the item to archive",
        },
      },
      required: ["item_id"],
    },
  },
},
// ============= Google Contacts Tools (All Tier A - Read Only) =============
{
  type: "function",
  function: {
    name: "contacts_get_contacts",
    description: "Get a list of contacts from the user's Google Contacts. Returns names, emails, phones, organizations, and more. Use this to look up contact information or find someone's details.",
    parameters: {
      type: "object",
      properties: {
        page_size: {
          type: "number",
          description: "Number of contacts to return (max 1000, default 100)",
        },
        page_token: {
          type: "string",
          description: "Token for pagination to get next page of results",
        },
      },
      required: [],
    },
  },
},
{
  type: "function",
  function: {
    name: "contacts_search",
    description: "Search for contacts by name, email, or phone number. Returns matching contacts with their details. Use this when looking for a specific person.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - can be name, email, or phone number",
        },
        page_size: {
          type: "number",
          description: "Number of results to return (max 30, default 30)",
        },
      },
      required: ["query"],
    },
  },
},
{
  type: "function",
  function: {
    name: "contacts_get_contact",
    description: "Get detailed information about a specific contact by their resource name/ID.",
    parameters: {
      type: "object",
      properties: {
        resource_name: {
          type: "string",
          description: "The contact's resource name (e.g., 'people/c123456789')",
        },
      },
      required: ["resource_name"],
    },
  },
},
{
  type: "function",
  function: {
    name: "contacts_get_groups",
    description: "Get list of contact groups/labels (e.g., Family, Work, Friends). Use this to understand how contacts are organized.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
},
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

// ============= Delete Calendar Event =============

interface DeleteCalendarEventArgs {
  event_id: string;
}

interface DeletedEventResult {
  success: boolean;
  message?: string;
  error?: string;
}

async function deleteCalendarEvent(
  userId: string,
  args: DeleteCalendarEventArgs
): Promise<DeletedEventResult> {
  console.log(`[Tools] delete_calendar_event: event_id="${args.event_id}"`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${args.event_id}`;

    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Google Calendar API returns 204 No Content on successful delete
    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      console.error(`[Tools] Calendar API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to delete event: ${response.status}` };
    }

    console.log(`[Tools] Deleted calendar event: ${args.event_id}`);
    return { success: true, message: "Event deleted successfully" };
  } catch (error) {
    console.error(`[Tools] Calendar delete error:`, error);
    return { success: false, error: "Failed to delete calendar event" };
  }
}

// ============= Get Calendars =============

interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  accessRole: string;
  backgroundColor?: string;
}

interface GetCalendarsResult {
  success: boolean;
  calendars?: CalendarInfo[];
  error?: string;
}

async function getCalendars(userId: string): Promise<GetCalendarsResult> {
  console.log(`[Tools] get_calendars`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Calendar list error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to get calendars: ${response.status}` };
    }

    const data = await response.json();
    const calendars: CalendarInfo[] = (data.items || []).map((c: {
      id: string;
      summary: string;
      description?: string;
      primary?: boolean;
      accessRole: string;
      backgroundColor?: string;
    }) => ({
      id: c.id,
      summary: c.summary,
      description: c.description,
      primary: !!c.primary,
      accessRole: c.accessRole,
      backgroundColor: c.backgroundColor,
    }));

    console.log(`[Tools] Found ${calendars.length} calendars`);
    return { success: true, calendars };
  } catch (error) {
    console.error(`[Tools] Calendar list error:`, error);
    return { success: false, error: "Failed to get calendars" };
  }
}

// ============= Get Free/Busy =============

interface FreeBusyArgs {
  start_time: string;
  end_time: string;
  calendar_ids?: string[];
}

interface BusyPeriod {
  start: string;
  end: string;
}

interface FreeBusyResult {
  success: boolean;
  calendars?: Record<string, { busy: BusyPeriod[] }>;
  error?: string;
}

async function getFreeBusy(
  userId: string,
  args: FreeBusyArgs
): Promise<FreeBusyResult> {
  console.log(`[Tools] get_free_busy: start=${args.start_time}, end=${args.end_time}`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    const calendarIds = args.calendar_ids || ["primary"];
    const items = calendarIds.map((id) => ({ id }));

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: args.start_time,
          timeMax: args.end_time,
          items,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] FreeBusy error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to check availability: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Tools] Got free/busy data for ${Object.keys(data.calendars || {}).length} calendars`);
    return { success: true, calendars: data.calendars };
  } catch (error) {
    console.error(`[Tools] FreeBusy error:`, error);
    return { success: false, error: "Failed to check availability" };
  }
}

// ============= Find Available Slots =============

interface FindAvailableSlotsArgs {
  duration_minutes: number;
  start_date: string;
  end_date: string;
  preferred_times?: "morning" | "afternoon" | "evening";
}

interface AvailableSlot {
  start: string;
  end: string;
  date: string;
  time_of_day: string;
}

interface FindAvailableSlotsResult {
  success: boolean;
  slots?: AvailableSlot[];
  error?: string;
}

async function findAvailableSlots(
  userId: string,
  args: FindAvailableSlotsArgs
): Promise<FindAvailableSlotsResult> {
  console.log(`[Tools] find_available_slots: duration=${args.duration_minutes}min, ${args.start_date} to ${args.end_date}`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    // Define time ranges based on preferences
    const timeRanges = {
      morning: { start: 9, end: 12 },
      afternoon: { start: 12, end: 17 },
      evening: { start: 17, end: 20 },
    };

    // Parse dates
    const startDate = new Date(args.start_date + "T00:00:00");
    const endDate = new Date(args.end_date + "T23:59:59");
    
    // Fetch all events in the range
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", startDate.toISOString());
    url.searchParams.set("timeMax", endDate.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Calendar API error: ${response.status} - ${errorText}`);
      return { success: false, error: "Failed to fetch calendar events" };
    }

    const data = await response.json();
    const events = (data.items || []).filter((e: { start?: { dateTime?: string } }) => e.start?.dateTime);

    // Build busy periods
    const busyPeriods: { start: Date; end: Date }[] = events.map((e: {
      start: { dateTime: string };
      end: { dateTime: string };
    }) => ({
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
    }));

    // Find available slots
    const slots: AvailableSlot[] = [];
    const durationMs = args.duration_minutes * 60 * 1000;
    const currentDate = new Date(startDate);

    while (currentDate <= endDate && slots.length < 5) {
      // Skip weekends
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Determine which time ranges to check
      const rangesToCheck = args.preferred_times
        ? [timeRanges[args.preferred_times]]
        : [timeRanges.morning, timeRanges.afternoon, timeRanges.evening];

      for (const range of rangesToCheck) {
        if (slots.length >= 5) break;

        const slotStart = new Date(currentDate);
        slotStart.setHours(range.start, 0, 0, 0);
        const rangeEnd = new Date(currentDate);
        rangeEnd.setHours(range.end, 0, 0, 0);

        // Check each 30-minute window
        while (slotStart.getTime() + durationMs <= rangeEnd.getTime() && slots.length < 5) {
          const slotEnd = new Date(slotStart.getTime() + durationMs);
          
          // Skip if in the past
          if (slotStart < new Date()) {
            slotStart.setTime(slotStart.getTime() + 30 * 60 * 1000);
            continue;
          }

          // Check if this slot conflicts with any busy period
          const hasConflict = busyPeriods.some(
            (busy) => slotStart < busy.end && slotEnd > busy.start
          );

          if (!hasConflict) {
            const hour = slotStart.getHours();
            let timeOfDay = "morning";
            if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
            else if (hour >= 17) timeOfDay = "evening";

            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              date: slotStart.toISOString().split("T")[0],
              time_of_day: timeOfDay,
            });
          }

          slotStart.setTime(slotStart.getTime() + 30 * 60 * 1000);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`[Tools] Found ${slots.length} available slots`);
    return { success: true, slots };
  } catch (error) {
    console.error(`[Tools] Find slots error:`, error);
    return { success: false, error: "Failed to find available slots" };
  }
}

// ============= Create Event on Specific Calendar =============

interface CreateEventOnCalendarArgs {
  calendar_id: string;
  summary: string;
  start_time: string;
  end_time: string;
  description?: string;
  location?: string;
  attendees?: string[];
  add_video_call?: boolean;
}

async function createEventOnCalendar(
  userId: string,
  args: CreateEventOnCalendarArgs
): Promise<CreatedEventResult> {
  console.log(`[Tools] create_event_on_calendar: calendar=${args.calendar_id}, summary="${args.summary}"`);

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

    if (args.description) eventBody.description = args.description;
    if (args.location) eventBody.location = args.location;
    if (args.attendees?.length) {
      eventBody.attendees = args.attendees.map((email) => ({ email }));
    }
    if (args.add_video_call) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const calendarId = encodeURIComponent(args.calendar_id);
    const apiUrl = args.add_video_call
      ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`
      : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

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
    console.log(`[Tools] Created event on calendar ${args.calendar_id}: ${data.id}`);

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

// ============= RSVP to Event =============

interface RSVPToEventArgs {
  event_id: string;
  response: "accepted" | "declined" | "tentative";
}

interface RSVPToEventResult {
  success: boolean;
  message?: string;
  error?: string;
}

async function rsvpToEvent(
  userId: string,
  args: RSVPToEventArgs
): Promise<RSVPToEventResult> {
  console.log(`[Tools] rsvp_to_event: event_id="${args.event_id}", response="${args.response}"`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    // Get current user's email
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileResponse.ok) {
      return { success: false, error: "Failed to get user info" };
    }
    const profile = await profileResponse.json();
    const userEmail = profile.email;

    // Get the event
    const getUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${args.event_id}`;
    const getResponse = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!getResponse.ok) {
      return { success: false, error: "Event not found" };
    }

    const event = await getResponse.json();
    
    // Update the attendee's response status
    const attendees = event.attendees || [];
    const updatedAttendees = attendees.map((a: { email: string; responseStatus?: string }) => {
      if (a.email.toLowerCase() === userEmail.toLowerCase()) {
        return { ...a, responseStatus: args.response };
      }
      return a;
    });

    // Patch the event
    const patchResponse = await fetch(getUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attendees: updatedAttendees }),
    });

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      console.error(`[Tools] RSVP error: ${patchResponse.status} - ${errorText}`);
      return { success: false, error: `Failed to RSVP: ${patchResponse.status}` };
    }

    console.log(`[Tools] RSVP'd ${args.response} to event ${args.event_id}`);
    return { success: true, message: `Response "${args.response}" sent` };
  } catch (error) {
    console.error(`[Tools] RSVP error:`, error);
    return { success: false, error: "Failed to RSVP" };
  }
}

// ============= Get Event Attendees =============

interface GetEventAttendeesArgs {
  event_id: string;
}

interface AttendeeInfo {
  email: string;
  displayName?: string;
  responseStatus: string;
  organizer: boolean;
  self: boolean;
}

interface GetEventAttendeesResult {
  success: boolean;
  attendees?: AttendeeInfo[];
  eventSummary?: string;
  error?: string;
}

async function getEventAttendees(
  userId: string,
  args: GetEventAttendeesArgs
): Promise<GetEventAttendeesResult> {
  console.log(`[Tools] get_event_attendees: event_id="${args.event_id}"`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    const getUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${args.event_id}`;
    const response = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { success: false, error: "Event not found" };
    }

    const event = await response.json();
    const attendees: AttendeeInfo[] = (event.attendees || []).map((a: {
      email: string;
      displayName?: string;
      responseStatus?: string;
      organizer?: boolean;
      self?: boolean;
    }) => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: a.responseStatus || "needsAction",
      organizer: !!a.organizer,
      self: !!a.self,
    }));

    console.log(`[Tools] Found ${attendees.length} attendees for event ${args.event_id}`);
    return { success: true, attendees, eventSummary: event.summary };
  } catch (error) {
    console.error(`[Tools] Get attendees error:`, error);
    return { success: false, error: "Failed to get attendees" };
  }
}

// ============= Create Recurring Event =============

interface CreateRecurringEventArgs {
  summary: string;
  start_time: string;
  end_time: string;
  recurrence_rule: string;
  description?: string;
  attendees?: string[];
  location?: string;
  add_video_call?: boolean;
}

async function createRecurringEvent(
  userId: string,
  args: CreateRecurringEventArgs
): Promise<CreatedEventResult> {
  console.log(`[Tools] create_recurring_event: summary="${args.summary}", recurrence="${args.recurrence_rule}"`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    // Convert simple recurrence to RRULE
    let rrule = args.recurrence_rule;
    if (!rrule.startsWith("RRULE:")) {
      const ruleMap: Record<string, string> = {
        daily: "RRULE:FREQ=DAILY",
        weekly: "RRULE:FREQ=WEEKLY",
        monthly: "RRULE:FREQ=MONTHLY",
        yearly: "RRULE:FREQ=YEARLY",
      };
      rrule = ruleMap[rrule.toLowerCase()] || `RRULE:${rrule}`;
    }

    const eventBody: Record<string, unknown> = {
      summary: args.summary,
      start: { dateTime: args.start_time },
      end: { dateTime: args.end_time },
      recurrence: [rrule],
    };

    if (args.description) eventBody.description = args.description;
    if (args.location) eventBody.location = args.location;
    if (args.attendees?.length) {
      eventBody.attendees = args.attendees.map((email) => ({ email }));
    }
    if (args.add_video_call) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

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
      return { success: false, error: `Failed to create recurring event: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Tools] Created recurring event: ${data.id}`);

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
    console.error(`[Tools] Recurring event error:`, error);
    return { success: false, error: "Failed to create recurring event" };
  }
}

// ============= Update Single Occurrence =============

interface UpdateSingleOccurrenceArgs {
  event_id: string;
  instance_date: string;
  new_start_time?: string;
  new_end_time?: string;
  new_summary?: string;
}

interface UpdateSingleOccurrenceResult {
  success: boolean;
  event?: {
    id: string;
    summary: string;
    start: string;
    end: string;
  };
  error?: string;
}

async function updateSingleOccurrence(
  userId: string,
  args: UpdateSingleOccurrenceArgs
): Promise<UpdateSingleOccurrenceResult> {
  console.log(`[Tools] update_single_occurrence: event_id="${args.event_id}", instance_date="${args.instance_date}"`);

  const accessToken = await getValidToken(userId, "google");
  if (!accessToken) {
    return { success: false, error: "Google Calendar is not connected or token expired" };
  }

  try {
    // Get the specific instance for this date
    const instanceDate = new Date(args.instance_date);
    const instanceId = `${args.event_id}_${instanceDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;

    // Try to get the instance directly
    let getUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${instanceId}`;
    let response = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // If direct lookup fails, try listing instances
    if (!response.ok) {
      const instancesUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${args.event_id}/instances`);
      instancesUrl.searchParams.set("timeMin", new Date(args.instance_date + "T00:00:00").toISOString());
      instancesUrl.searchParams.set("timeMax", new Date(args.instance_date + "T23:59:59").toISOString());
      instancesUrl.searchParams.set("maxResults", "1");

      const instancesResponse = await fetch(instancesUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!instancesResponse.ok) {
        return { success: false, error: "Could not find event instance" };
      }

      const instancesData = await instancesResponse.json();
      if (!instancesData.items || instancesData.items.length === 0) {
        return { success: false, error: "No instance found for this date" };
      }

      getUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${instancesData.items[0].id}`;
      response = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!response.ok) {
      return { success: false, error: "Event instance not found" };
    }

    const instance = await response.json();

    // Build update
    const updateBody: Record<string, unknown> = {
      summary: args.new_summary ?? instance.summary,
      start: args.new_start_time ? { dateTime: args.new_start_time } : instance.start,
      end: args.new_end_time ? { dateTime: args.new_end_time } : instance.end,
    };

    const patchResponse = await fetch(getUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateBody),
    });

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      console.error(`[Tools] Update instance error: ${patchResponse.status} - ${errorText}`);
      return { success: false, error: `Failed to update instance: ${patchResponse.status}` };
    }

    const data = await patchResponse.json();
    console.log(`[Tools] Updated single occurrence: ${data.id}`);

    return {
      success: true,
      event: {
        id: data.id,
        summary: data.summary,
        start: data.start?.dateTime || data.start?.date || "",
        end: data.end?.dateTime || data.end?.date || "",
      },
    };
  } catch (error) {
    console.error(`[Tools] Update occurrence error:`, error);
    return { success: false, error: "Failed to update occurrence" };
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

// ============= Delete Email =============

interface DeleteEmailArgs {
  message_id: string;
}

interface DeleteEmailResult {
  success: boolean;
  message?: string;
  error?: string;
}

async function deleteEmail(
  userId: string,
  args: DeleteEmailArgs
): Promise<DeleteEmailResult> {
  console.log(`[Tools] delete_email: message_id="${args.message_id}"`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    // Move to trash (soft delete)
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.message_id}/trash`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail delete error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to delete email: ${response.status}` };
    }

    console.log(`[Tools] Deleted email: ${args.message_id}`);
    return { success: true, message: "Email moved to trash" };
  } catch (error) {
    console.error(`[Tools] Gmail delete error:`, error);
    return { success: false, error: "Failed to delete email" };
  }
}

// ============= Archive Email =============

interface ArchiveEmailArgs {
  message_id: string;
}

interface ArchiveEmailResult {
  success: boolean;
  message?: string;
  error?: string;
}

async function archiveEmail(
  userId: string,
  args: ArchiveEmailArgs
): Promise<ArchiveEmailResult> {
  console.log(`[Tools] archive_email: message_id="${args.message_id}"`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    // Remove INBOX label to archive
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.message_id}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail archive error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to archive email: ${response.status}` };
    }

    console.log(`[Tools] Archived email: ${args.message_id}`);
    return { success: true, message: "Email archived" };
  } catch (error) {
    console.error(`[Tools] Gmail archive error:`, error);
    return { success: false, error: "Failed to archive email" };
  }
}

// ============= Create Draft =============

interface CreateDraftArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

interface CreateDraftResult {
  success: boolean;
  draftId?: string;
  error?: string;
  invalidEmails?: string[];
}

async function createDraft(
  userId: string,
  args: CreateDraftArgs
): Promise<CreateDraftResult> {
  console.log(`[Tools] create_draft: to="${args.to}", subject="${args.subject}"`);

  // Validate email addresses
  const toResult = cleanEmailAddress(args.to);
  if (!toResult.valid) {
    return { 
      success: false, 
      error: `Invalid email address: "${args.to}"`,
      invalidEmails: [args.to]
    };
  }

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    // Construct RFC 2822 formatted email
    let emailContent = `To: ${toResult.cleaned}\r\n`;
    if (args.cc) {
      const ccResult = cleanEmailList(args.cc);
      if (ccResult.cleaned) {
        emailContent += `Cc: ${ccResult.cleaned}\r\n`;
      }
    }
    if (args.bcc) {
      const bccResult = cleanEmailList(args.bcc);
      if (bccResult.cleaned) {
        emailContent += `Bcc: ${bccResult.cleaned}\r\n`;
      }
    }
    emailContent += `Subject: ${args.subject}\r\n`;
    emailContent += `Content-Type: text/plain; charset=utf-8\r\n`;
    emailContent += `\r\n`;
    emailContent += args.body;

    // Base64url encode
    const encoder = new TextEncoder();
    const emailBytes = encoder.encode(emailContent);
    const base64Email = btoa(String.fromCharCode(...emailBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: { raw: base64Email },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail draft error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to create draft: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Tools] Created draft: ${data.id}`);
    return { success: true, draftId: data.id };
  } catch (error) {
    console.error(`[Tools] Gmail draft error:`, error);
    return { success: false, error: "Failed to create draft" };
  }
}

// ============= Mark Email Read/Unread =============

interface MarkEmailArgs {
  message_id: string;
}

interface MarkEmailResult {
  success: boolean;
  message?: string;
  error?: string;
}

async function markEmailRead(
  userId: string,
  args: MarkEmailArgs
): Promise<MarkEmailResult> {
  console.log(`[Tools] mark_email_read: message_id="${args.message_id}"`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.message_id}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail modify error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to mark as read: ${response.status}` };
    }

    console.log(`[Tools] Marked email as read: ${args.message_id}`);
    return { success: true, message: "Email marked as read" };
  } catch (error) {
    console.error(`[Tools] Gmail modify error:`, error);
    return { success: false, error: "Failed to mark email as read" };
  }
}

async function markEmailUnread(
  userId: string,
  args: MarkEmailArgs
): Promise<MarkEmailResult> {
  console.log(`[Tools] mark_email_unread: message_id="${args.message_id}"`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.message_id}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ addLabelIds: ["UNREAD"] }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail modify error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to mark as unread: ${response.status}` };
    }

    console.log(`[Tools] Marked email as unread: ${args.message_id}`);
    return { success: true, message: "Email marked as unread" };
  } catch (error) {
    console.error(`[Tools] Gmail modify error:`, error);
    return { success: false, error: "Failed to mark email as unread" };
  }
}

// ============= Reply to Email =============

interface ReplyToEmailArgs {
  message_id: string;
  body: string;
}

interface ReplyToEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function replyToEmail(
  userId: string,
  args: ReplyToEmailArgs
): Promise<ReplyToEmailResult> {
  console.log(`[Tools] reply_to_email: message_id="${args.message_id}"`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    // First, get the original message to get thread info and headers
    const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.message_id}?format=full`;
    const msgResponse = await fetch(msgUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!msgResponse.ok) {
      return { success: false, error: "Original email not found" };
    }

    const originalMsg = await msgResponse.json();
    const headers = originalMsg.payload?.headers || [];

    const getHeader = (name: string): string => {
      const h = headers.find((h: { name: string; value: string }) => 
        h.name.toLowerCase() === name.toLowerCase()
      );
      return h?.value || "";
    };

    const originalFrom = getHeader("From");
    const originalSubject = getHeader("Subject");
    const originalMessageId = getHeader("Message-ID");
    const threadId = originalMsg.threadId;

    // Build reply subject
    const replySubject = originalSubject.toLowerCase().startsWith("re:")
      ? originalSubject
      : `Re: ${originalSubject}`;

    // Extract email from "Name <email@domain.com>" format
    const emailMatch = originalFrom.match(/<(.+?)>/) || [null, originalFrom];
    const replyTo = emailMatch[1] || originalFrom;

    // Fetch signature
    const signatureData = await fetchGmailSignature(accessToken);
    
    let emailBody = args.body;
    let contentType = "text/plain; charset=utf-8";

    const maiBrandingHtml = `<span style="color: #888; font-size: 12px;">Sent via mai, my AI assistant.</span>`;

    if (signatureData && signatureData.signature) {
      const htmlBody = args.body.replace(/\n/g, "<br>");
      emailBody = `${htmlBody}<br><br>${maiBrandingHtml}<br><br>${signatureData.signature}`;
      contentType = "text/html; charset=utf-8";
    } else {
      const htmlBody = args.body.replace(/\n/g, "<br>");
      emailBody = `${htmlBody}<br><br>${maiBrandingHtml}`;
      contentType = "text/html; charset=utf-8";
    }

    // Construct reply email
    let emailContent = `To: ${replyTo}\r\n`;
    emailContent += `Subject: ${replySubject}\r\n`;
    emailContent += `Content-Type: ${contentType}\r\n`;
    if (originalMessageId) {
      emailContent += `In-Reply-To: ${originalMessageId}\r\n`;
      emailContent += `References: ${originalMessageId}\r\n`;
    }
    emailContent += `\r\n`;
    emailContent += emailBody;

    // Base64url encode
    const encoder = new TextEncoder();
    const emailBytes = encoder.encode(emailContent);
    const base64Email = btoa(String.fromCharCode(...emailBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send as reply in same thread
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: base64Email, threadId }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail reply error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to send reply: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Tools] Sent reply: ${data.id}`);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error(`[Tools] Gmail reply error:`, error);
    return { success: false, error: "Failed to send reply" };
  }
}

// ============= Forward Email =============

interface ForwardEmailArgs {
  message_id: string;
  to: string;
  body?: string;
}

interface ForwardEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function forwardEmail(
  userId: string,
  args: ForwardEmailArgs
): Promise<ForwardEmailResult> {
  console.log(`[Tools] forward_email: message_id="${args.message_id}", to="${args.to}"`);

  const toResult = cleanEmailAddress(args.to);
  if (!toResult.valid) {
    return { success: false, error: `Invalid email address: "${args.to}"` };
  }

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    // Get the original message
    const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.message_id}?format=full`;
    const msgResponse = await fetch(msgUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!msgResponse.ok) {
      return { success: false, error: "Original email not found" };
    }

    const originalMsg = await msgResponse.json();
    const headers = originalMsg.payload?.headers || [];

    const getHeader = (name: string): string => {
      const h = headers.find((h: { name: string; value: string }) => 
        h.name.toLowerCase() === name.toLowerCase()
      );
      return h?.value || "";
    };

    const originalFrom = getHeader("From");
    const originalTo = getHeader("To");
    const originalSubject = getHeader("Subject");
    const originalDate = getHeader("Date");

    // Build forward subject
    const fwdSubject = originalSubject.toLowerCase().startsWith("fwd:")
      ? originalSubject
      : `Fwd: ${originalSubject}`;

    // Get original body (snippet for now - full body requires parsing)
    const originalBody = originalMsg.snippet || "";

    // Build forwarded message content
    const forwardHeader = `
---------- Forwarded message ----------
From: ${originalFrom}
Date: ${originalDate}
Subject: ${originalSubject}
To: ${originalTo}

${originalBody}`;

    const additionalMessage = args.body ? `${args.body}\n\n` : "";
    const fullBody = additionalMessage + forwardHeader;

    // Fetch signature
    const signatureData = await fetchGmailSignature(accessToken);
    
    let emailBody = fullBody;
    let contentType = "text/plain; charset=utf-8";

    const maiBrandingHtml = `<span style="color: #888; font-size: 12px;">Sent via mai, my AI assistant.</span>`;

    if (signatureData && signatureData.signature) {
      const htmlBody = fullBody.replace(/\n/g, "<br>");
      emailBody = `${htmlBody}<br><br>${maiBrandingHtml}<br><br>${signatureData.signature}`;
      contentType = "text/html; charset=utf-8";
    } else {
      const htmlBody = fullBody.replace(/\n/g, "<br>");
      emailBody = `${htmlBody}<br><br>${maiBrandingHtml}`;
      contentType = "text/html; charset=utf-8";
    }

    // Construct forward email
    let emailContent = `To: ${toResult.cleaned}\r\n`;
    emailContent += `Subject: ${fwdSubject}\r\n`;
    emailContent += `Content-Type: ${contentType}\r\n`;
    emailContent += `\r\n`;
    emailContent += emailBody;

    // Base64url encode
    const encoder = new TextEncoder();
    const emailBytes = encoder.encode(emailContent);
    const base64Email = btoa(String.fromCharCode(...emailBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

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
      console.error(`[Tools] Gmail forward error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to forward email: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Tools] Forwarded email: ${data.id}`);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error(`[Tools] Gmail forward error:`, error);
    return { success: false, error: "Failed to forward email" };
  }
}

// ============= Get Labels =============

interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

interface GetLabelsResult {
  success: boolean;
  labels?: GmailLabel[];
  error?: string;
}

async function getLabels(userId: string): Promise<GetLabelsResult> {
  console.log(`[Tools] get_labels`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail labels error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to get labels: ${response.status}` };
    }

    const data = await response.json();
    const labels: GmailLabel[] = (data.labels || []).map((l: { id: string; name: string; type: string }) => ({
      id: l.id,
      name: l.name,
      type: l.type,
    }));

    console.log(`[Tools] Found ${labels.length} labels`);
    return { success: true, labels };
  } catch (error) {
    console.error(`[Tools] Gmail labels error:`, error);
    return { success: false, error: "Failed to get labels" };
  }
}

// ============= Apply/Remove Label =============

interface LabelEmailArgs {
  message_id: string;
  label_id: string;
}

interface LabelEmailResult {
  success: boolean;
  message?: string;
  error?: string;
}

async function applyLabel(
  userId: string,
  args: LabelEmailArgs
): Promise<LabelEmailResult> {
  console.log(`[Tools] apply_label: message_id="${args.message_id}", label_id="${args.label_id}"`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.message_id}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ addLabelIds: [args.label_id] }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail label error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to apply label: ${response.status}` };
    }

    console.log(`[Tools] Applied label ${args.label_id} to ${args.message_id}`);
    return { success: true, message: "Label applied" };
  } catch (error) {
    console.error(`[Tools] Gmail label error:`, error);
    return { success: false, error: "Failed to apply label" };
  }
}

async function removeLabel(
  userId: string,
  args: LabelEmailArgs
): Promise<LabelEmailResult> {
  console.log(`[Tools] remove_label: message_id="${args.message_id}", label_id="${args.label_id}"`);

  const accessToken = await getValidToken(userId, "gmail");
  if (!accessToken) {
    return { success: false, error: "Gmail is not connected or token expired" };
  }

  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.message_id}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ removeLabelIds: [args.label_id] }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tools] Gmail label error: ${response.status} - ${errorText}`);
      return { success: false, error: `Failed to remove label: ${response.status}` };
    }

    console.log(`[Tools] Removed label ${args.label_id} from ${args.message_id}`);
    return { success: true, message: "Label removed" };
  } catch (error) {
    console.error(`[Tools] Gmail label error:`, error);
    return { success: false, error: "Failed to remove label" };
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

      case "delete_calendar_event":
        result = await deleteCalendarEvent(userId, args);
        break;

      case "get_calendars":
        result = await getCalendars(userId);
        break;

      case "get_free_busy":
        result = await getFreeBusy(userId, args);
        break;

      case "find_available_slots":
        result = await findAvailableSlots(userId, args);
        break;

      case "create_event_on_calendar":
        result = await createEventOnCalendar(userId, args);
        break;

      case "rsvp_to_event":
        result = await rsvpToEvent(userId, args);
        break;

      case "get_event_attendees":
        result = await getEventAttendees(userId, args);
        break;

      case "create_recurring_event":
        result = await createRecurringEvent(userId, args);
        break;

      case "update_single_occurrence":
        result = await updateSingleOccurrence(userId, args);
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

      case "delete_email":
        result = await deleteEmail(userId, args);
        break;

      case "archive_email":
        result = await archiveEmail(userId, args);
        break;

      case "create_draft":
        result = await createDraft(userId, args);
        break;

      case "mark_email_read":
        result = await markEmailRead(userId, args);
        break;

      case "mark_email_unread":
        result = await markEmailUnread(userId, args);
        break;

      case "reply_to_email":
        result = await replyToEmail(userId, args);
        break;

      case "forward_email":
        result = await forwardEmail(userId, args);
        break;

      case "get_labels":
        result = await getLabels(userId);
        break;

      case "apply_label":
        result = await applyLabel(userId, args);
        break;

      case "remove_label":
        result = await removeLabel(userId, args);
        break;
      
      // Monday.com tools
      case "monday_get_boards":
        result = await executeMondayTool(userId, "get_boards", {});
        break;
      
      case "monday_get_board":
        result = await executeMondayTool(userId, "get_board", args);
        break;
      
      case "monday_get_items":
        result = await executeMondayTool(userId, "get_items", args);
        break;
      
      case "monday_get_item":
        result = await executeMondayTool(userId, "get_item", args);
        break;
      
      case "monday_search_items":
        result = await executeMondayTool(userId, "search_items", args);
        break;
      
      case "monday_get_me":
        result = await executeMondayTool(userId, "get_me", {});
        break;
      
      case "monday_create_item":
        result = await executeMondayTool(userId, "create_item", args);
        break;
      
      case "monday_update_item":
        result = await executeMondayTool(userId, "update_item", args);
        break;
      
      case "monday_change_status":
        result = await executeMondayTool(userId, "change_status", args);
        break;
      
      case "monday_add_update":
        result = await executeMondayTool(userId, "add_update", args);
        break;
      
      case "monday_delete_item":
        result = await executeMondayTool(userId, "delete_item", args);
        break;
      
      case "monday_archive_item":
        result = await executeMondayTool(userId, "archive_item", args);
        break;
      
      // Google Contacts tools
      case "contacts_get_contacts":
        result = await executeContactsTool(userId, "get_contacts", args);
        break;
      
      case "contacts_search":
        result = await executeContactsTool(userId, "search_contacts", args);
        break;
      
      case "contacts_get_contact":
        result = await executeContactsTool(userId, "get_contact", args);
        break;
      
      case "contacts_get_groups":
        result = await executeContactsTool(userId, "get_contact_groups", {});
        break;
      
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

// ============= Monday.com Tool Executor =============

async function executeMondayTool(
  userId: string, 
  action: string, 
  params: Record<string, unknown>
): Promise<unknown> {
  console.log(`[Tools] Executing Monday.com action: ${action}`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/monday-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action,
        user_id: userId,
        params,
      }),
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      if (data.needsAuth) {
        return { 
          success: false, 
          needsAuth: true,
          error: "Monday.com is not connected. Please connect from the Integrations page." 
        };
      }
      return { success: false, error: data.error || 'Monday.com API request failed' };
    }

    return { success: true, ...data.data };
  } catch (error) {
    console.error(`[Tools] Monday.com tool error:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to execute Monday.com action' 
    };
  }
}

// ============= Google Contacts Tool Executor =============

async function executeContactsTool(
  userId: string, 
  action: string, 
  params: Record<string, unknown>
): Promise<unknown> {
  console.log(`[Tools] Executing Google Contacts action: ${action}`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/google-contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action,
        user_id: userId,
        params,
      }),
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      if (data.needsAuth) {
        return { 
          success: false, 
          needsAuth: true,
          error: "Google Contacts is not connected. Please connect from the Integrations page." 
        };
      }
      return { success: false, error: data.error || 'Google Contacts API request failed' };
    }

    return { success: true, ...data.data };
  } catch (error) {
    console.error(`[Tools] Google Contacts tool error:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to execute Google Contacts action' 
    };
  }
}
