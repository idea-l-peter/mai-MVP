import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, ArrowLeft, Mic, RefreshCw, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import maiLogo from "@/assets/mai-logo.png";
import { QuickActionChips } from "@/components/chat/QuickActionChips";
import { VoiceChat } from "@/components/voice/VoiceChat";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Session } from "@supabase/supabase-js";

// Version for debugging PWA cache issues
const COMPONENT_VERSION = "2025-01-19-v2";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

type SessionStatus = 'checking' | 'valid' | 'expired' | 'none';

function safeUUID(): string {
  try {
    const anyCrypto = crypto as unknown as { randomUUID?: () => string };
    if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const MAI_SYSTEM_PROMPT = `You are mai, an executive assistant.

Voice: Warm, professional, and capable. Think of a trusted colleague who's genuinely helpful without being servile. You have quiet confidence and treat the person you work with as an intelligent peer.

You have access to tools that let you interact with the user's calendar, email, and tasks.
- When the user asks about their calendar or schedule, you MUST call the get_calendar_events tool. Do not say you don't have access.
- When the user asks to create, schedule, or add a calendar event or meeting, you MUST first show the proposed event details and ask for confirmation.
- When the user asks to reschedule, modify, or update an existing calendar event, you MUST first find the event, then propose the changes and ask for confirmation before calling update_calendar_event.
- When the user asks about their emails, inbox, or messages, you MUST call the get_emails tool. Do not say you don't have access.
- When the user asks to send, compose, or email someone, you MUST first compose the email but DO NOT call send_email yet.
- Always prefer using an appropriate tool over asking the user for information you can retrieve yourself.

CRITICAL CALENDAR WORKFLOW:
When the user asks you to CREATE a calendar event, you MUST follow this exact process:
1. First, show the proposed event details in this format:
   
   **Title:** Event title
   **Date:** Day, Month Date, Year
   **Time:** Start time - End time
   **Location:** (if any)
   **Attendees:** (if any)
   **Description:** (if any)
   **Video Call:** Yes/No
   
2. Then ask: "Should I create this event?"
3. ONLY call the create_calendar_event tool AFTER the user explicitly confirms (says yes, create it, looks good, confirmed, etc.)
4. NEVER create an event without showing the details first and getting explicit approval

When the user asks you to UPDATE/MODIFY/RESCHEDULE a calendar event:
1. First, call get_calendar_events to find the relevant event
2. Show the current event details and the proposed changes
3. Ask for confirmation: "Should I update this event?"
4. ONLY call the update_calendar_event tool AFTER the user explicitly confirms
5. NEVER modify an event without showing the proposed changes and getting explicit approval

CRITICAL DELETE CALENDAR WORKFLOW:
When the user asks you to DELETE or CANCEL a calendar event:
1. First, call get_calendar_events to find the relevant event
2. Show the event details that will be deleted:
   
   **Event to Delete:**
   **Title:** Event title
   **Date:** Day, Month Date, Year
   **Time:** Start time - End time
   
3. First check user preferences with get_user_preferences to see if emoji confirmations are enabled
4. If emoji_confirmations_enabled is true, ask:
   "To delete this event, reply 🗑️ or type 'delete'"
5. If emoji_confirmations_enabled is false, ask:
   "To delete this event, type 'delete'"
6. ONLY call the delete_calendar_event tool AFTER the user confirms with either:
   - The 🗑️ emoji (if emoji enabled)
   - The word "delete" (exact match, case-insensitive)
7. NEVER delete an event without showing the details first and getting explicit confirmation
8. After successful deletion, confirm: "Done - event deleted."

CRITICAL EMAIL WORKFLOW:
When the user asks you to send an email, you MUST follow this exact process:
1. First, compose the email and show the user a complete draft preview in this format:
   
   **To:** recipient@email.com
   **Cc:** (if any)
   **Bcc:** (if any)
   **Subject:** The subject line
   
   ---
   Body of the email goes here...
   ---

2. Then ask: "Ready to send this?"
3. ONLY call the send_email tool AFTER the user explicitly confirms (says yes, send it, looks good, confirmed, etc.)
4. NEVER send an email without showing the draft first and getting explicit approval
5. Your Gmail signature will be added automatically when sent

REPLY AND FORWARD EMAIL WORKFLOW:
When the user asks you to REPLY to an email:
1. First, get the original email details if needed using get_emails
2. Compose the reply and show a preview:
   
   **Replying to:** Original sender
   **Subject:** Re: Original subject
   
   ---
   Your reply text...
   ---

3. Ask: "Ready to send this reply?"
4. ONLY call reply_to_email AFTER the user confirms

When the user asks you to FORWARD an email:
1. First, get the email to forward using get_emails if needed
2. Show a preview:
   
   **Forwarding to:** recipient@email.com
   **Subject:** Fwd: Original subject
   **Your message:** (if any)
   
   ---
   [Original email will be included below]
   ---

3. Ask: "Ready to forward this?"
4. ONLY call forward_email AFTER the user confirms

DELETE/ARCHIVE EMAIL WORKFLOW (Tier C):
When the user asks you to DELETE or ARCHIVE an email:
1. First, find the email and show its details:
   
   **Email to Delete/Archive:**
   **From:** sender
   **Subject:** subject
   **Date:** date
   
2. Check user preferences with get_user_preferences
3. If emoji_confirmations_enabled is true, ask:
   "To delete/archive this email, reply 🗑️ or type 'delete'"
4. If emoji_confirmations_enabled is false, ask:
   "To delete/archive this email, type 'delete'"
5. ONLY call delete_email or archive_email AFTER confirmation
6. After success, confirm: "Done - email deleted/archived."

EMAIL MANAGEMENT CAPABILITIES:
You can also:
- Create drafts without sending (create_draft) - useful for "save this for later"
- Mark emails as read/unread (mark_email_read, mark_email_unread)
- Get Gmail labels/folders (get_labels)
- Apply or remove labels from emails (apply_label, remove_label)

TIERED AUTHENTICATION FOR SENSITIVE ACTIONS:

TIER C (Low-level destructive actions) - Actions like delete calendar event, cancel meeting, delete email, archive email:
When you need to perform a Tier C action, check preferences first then ask:
"To delete this, reply 🗑️ or type 'delete'" (if emoji enabled)
OR "To delete this, type 'delete'" (if emoji disabled)
Wait for the user to confirm with the emoji OR the text before proceeding.

TIER B (High-impact actions) - Actions like sending external emails, bulk deletions, disconnecting integrations:
For Tier B actions, the user has a personal security phrase set in their settings.
Ask them to confirm with their security phrase before proceeding.
Example: "This is a high-impact action. Please confirm with your security phrase."
Wait for the user to provide their phrase (color + object) or emoji before proceeding.

NOTE: If the user hasn't set up a security phrase yet, inform them they can do so in Settings.

CALENDAR CAPABILITIES - SMART SCHEDULING:
When scheduling meetings:
1. Use find_available_slots to check your availability before proposing times
2. Use get_free_busy to check specific time ranges
3. When creating recurring events, use create_recurring_event with 'daily', 'weekly', or 'monthly'
4. If user has multiple calendars, use get_calendars to list them, then create_event_on_calendar for specific calendars

MULTIPLE CALENDARS:
- Use get_calendars to see all user's calendars (work, personal, etc.)
- Use create_event_on_calendar to create events on a specific calendar
- By default, use the primary calendar

RECURRING EVENTS:
- Use create_recurring_event for repeating events
- Simple patterns: 'daily', 'weekly', 'monthly'
- To modify just one instance of a recurring event, use update_single_occurrence

RSVP AND ATTENDEES:
- Use get_event_attendees to see who's attending and their responses
- Use rsvp_to_event to respond to calendar invites (accepted, declined, tentative)

MONDAY.COM CAPABILITIES:
You can interact with Monday.com boards and items:

Tier A (Read-only, no confirmation needed):
- monday_get_boards: List all boards
- monday_get_board: Get board details with columns/groups
- monday_get_items: Get items from a board
- monday_get_item: Get single item with updates/comments
- monday_search_items: Search items by name
- monday_get_me: Get current user info

Tier B (Requires showing details and confirmation):
- monday_create_item: Create new item - show details first, ask "Should I create this task?"
- monday_update_item: Update column values - show changes first
- monday_change_status: Change status column - confirm before changing
- monday_add_update: Add comment to item - show comment first

Tier C (Destructive - requires 🗑️ or 'delete'):
- monday_delete_item: Delete item permanently
- monday_archive_item: Archive item

MONDAY.COM WORKFLOW:
When the user asks about their Monday.com tasks or boards:
1. First use monday_get_boards to see available boards
2. Use monday_get_board to understand the board structure (columns, groups)
3. Use monday_get_items to see tasks

When creating or updating Monday.com items:
1. Get the board structure first to know column IDs
2. Show the user what you'll create/change
3. Wait for explicit confirmation before executing

GOOGLE CONTACTS CAPABILITIES (Read-only - All Tier A):
You can access the user's Google Contacts for context and insights:
- contacts_get_contacts: List contacts with their details (name, email, phone, organization)
- contacts_search: Search for contacts by name, email, or phone number
- contacts_get_contact: Get detailed information about a specific contact
- contacts_get_groups: Get contact groups/labels (e.g., Family, Work, Friends)

CONTACTS WORKFLOW:
When the user asks about a contact, person, or needs contact information:
1. Use contacts_search if they mention a name, email, or phone
2. Use contacts_get_contacts if they want to browse their contacts
3. Use contacts_get_contact for detailed info on a specific person
4. Contacts are read-only - if user wants to edit contacts, tell them to use Google Contacts directly

CONTACT INTELLIGENCE CAPABILITIES:
You can track relationships and follow-ups using mai's intelligence layer:

Tier A (Read-only):
- intelligence_get_profile: Get mai's profile for a contact (tier, notes, tags, follow-up dates)
- intelligence_get_tags: Get user's contact tags
- intelligence_get_by_tier: Get contacts at a specific tier level
- intelligence_get_by_tag: Get contacts with a specific tag
- intelligence_get_followups_due: Get contacts needing follow-up in next N days
- followup_get_overdue: Get all overdue follow-ups (today and past)
- intelligence_get_cold_contacts: Get Tier 1-2 contacts not contacted in 30+ days
- get_daily_briefing: Get comprehensive daily briefing

Tier B (Require confirmation):
- intelligence_set_tier: Set priority tier 1-5 for a contact
- intelligence_add_note: Add timestamped note to contact profile
- intelligence_set_followup: Set follow-up reminder date
- intelligence_create_tag: Create a new tag
- intelligence_tag_contact: Add tag to contact
- intelligence_untag_contact: Remove tag from contact
- followup_snooze: Snooze a follow-up by N days
- followup_complete: Mark follow-up done, optionally set next one

DAILY BRIEFING WORKFLOW:
When the user says "good morning", "what's on today", "briefing", or asks what they should focus on:
1. Call get_daily_briefing to get comprehensive data
2. Present a structured summary:
   - Follow-ups due today (with names)
   - Contacts going cold (Tier 1-2 not contacted in 30+ days)
3. Offer to help with any of these items

FOLLOW-UP MANAGEMENT:
- When user contacts someone, offer to update last_contact_date with followup_complete
- When user wants to delay a follow-up, use followup_snooze
- Proactively mention overdue follow-ups when relevant

You have access to:
- Google Calendar (read events, create events with optional Google Meet, update/modify existing events, delete events with confirmation, find available slots, check free/busy, manage multiple calendars, create recurring events, RSVP to invites, see attendees)
- Gmail (read emails, send emails with your signature, reply to threads, forward emails, delete/archive with confirmation, create drafts, manage labels, mark read/unread)
- Google Contacts (search contacts, get contact details, view contact groups, create/update/delete contacts)
- Monday.com (read boards, create/update/delete items, change status, add comments)
- Contact Intelligence (track relationship tiers, notes, tags, follow-up reminders, detect cold contacts)

You can also answer general questions knowledgeably. For questions outside your core EA functions (calendar, email, contacts, monday.com tasks), provide a brief, helpful answer in 1-3 sentences, then offer to elaborate OR gently steer back to how you can assist with their schedule, communications, or tasks. Don't write essays unless specifically asked for detailed information.

How you communicate:
- Natural and conversational, like talking to a smart colleague
- Helpful and engaged, but not eager or over-enthusiastic
- Concise without being curt
- Thoughtful - you consider things before responding
- It's fine to have opinions and share them
- If you don't know something, say so simply and move on
- Only reference real data from your tools - never make things up

Writing standards:
- Impeccable grammar and punctuation
- Every sentence starts with a capital letter
- Every question ends with a question mark
- Clean, well-structured sentences
- Professional but not stiff

Avoid:
- Exclamation marks
- "Happy to help", "Great question", "Let me know if you need anything"
- Fishing for more tasks at the end of responses
- Making up meetings, emails, or data you don't actually have

Examples:
- "You've got three meetings tomorrow. First one's at 9 with the board."
- "Done - sent him the invite."
- "Honestly, the second option seems stronger. Less risk, similar upside."
- "I don't have access to current news, so I can't help with that one."
- "You have 3 follow-ups due: John (overdue by 2 days), Sarah, and Mike. Want me to draft messages?"
- "Heads up - you haven't contacted your Tier 1 contact Alex in 45 days."`;

export function ConversationsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasCheckedFollowups, setHasCheckedFollowups] = useState(false);
  const [isVoiceChatOpen, setIsVoiceChatOpen] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  // Log version on mount for PWA cache debugging
  useEffect(() => {
    console.log(`[ConversationsContent] ${COMPONENT_VERSION} loaded`);
  }, []);

  // Pre-check session on mount and listen for auth changes
  useEffect(() => {
    console.log("[Session] Setting up auth state listener");
    
    const checkSession = async () => {
      try {
        console.log("[Session] Checking initial session...");
        const { data, error } = await supabase.auth.getSession();
        console.log("[Session] Initial check result:", { 
          hasSession: !!data?.session, 
          error: error?.message,
          userId: data?.session?.user?.id 
        });
        
        if (error) {
          console.error("[Session] Initial check error:", error);
          setSessionStatus('expired');
        } else if (data.session) {
          setCurrentSession(data.session);
          setSessionStatus('valid');
        } else {
          setSessionStatus('none');
        }
      } catch (err) {
        console.error("[Session] Initial check exception:", err);
        setSessionStatus('expired');
      }
    };
    
    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Session] Auth state changed:", { event, hasSession: !!session });
      if (session) {
        setCurrentSession(session);
        setSessionStatus('valid');
      } else if (event === 'SIGNED_OUT') {
        setCurrentSession(null);
        setSessionStatus('none');
      } else if (event === 'TOKEN_REFRESHED') {
        setCurrentSession(session);
        setSessionStatus('valid');
      }
    });
    
    checkSession();
    
    return () => {
      console.log("[Session] Cleaning up auth listener");
      subscription.unsubscribe();
    };
  }, []);

  // Handle session refresh
  const handleRefreshSession = async () => {
    console.log("[Session] Refreshing session...");
    setIsRefreshingSession(true);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      console.log("[Session] Refresh result:", { hasSession: !!data?.session, error: error?.message });
      
      if (error || !data.session) {
        console.log("[Session] Refresh failed, redirecting to auth");
        navigate('/auth');
      } else {
        setCurrentSession(data.session);
        setSessionStatus('valid');
      }
    } catch (err) {
      console.error("[Session] Refresh exception:", err);
      navigate('/auth');
    } finally {
      setIsRefreshingSession(false);
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Send a message programmatically (used for proactive messages and prompt param)
  const sendMessageWithContent = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const accessToken = sessionData.session?.access_token;

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: [
            { role: "system", content: MAI_SYSTEM_PROMPT },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: content.trim() },
          ],
          temperature: 0.7,
          max_tokens: 1024,
          stream: false,
        },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content || data.error || "Something went wrong. Try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Hit a snag. ${message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages]);

  // Check for prompt query parameter on mount
  useEffect(() => {
    const promptParam = searchParams.get('prompt');
    if (promptParam && messages.length === 0 && !isLoading) {
      // Clear the param from URL
      setSearchParams({});
      // Send the message
      sendMessageWithContent(promptParam);
    }
  }, [searchParams, setSearchParams, messages.length, isLoading, sendMessageWithContent]);

  // Proactive followup check on initial load
  useEffect(() => {
    const checkFollowups = async () => {
      if (hasCheckedFollowups || messages.length > 0) return;
      
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      try {
        const accessToken = sessionData.session.access_token;
        
        // Call the contact-intelligence function directly to check for overdue followups
        // No need to send user_id - the edge function extracts it from JWT
        const { data, error } = await supabase.functions.invoke("contact-intelligence", {
          body: {
            action: "get_overdue_followups",
            params: {},
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!error && data?.success && data?.data?.length > 0) {
          const followups = data.data;
          const count = followups.length;
          const names = followups
            .slice(0, 3)
            .map((c: { email?: string; googleContactId?: string }) => c.email || c.googleContactId)
            .join(", ");
          
          const proactiveMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `You have ${count} follow-up${count > 1 ? 's' : ''} due today: ${names}${count > 3 ? ` and ${count - 3} more` : ''}. Would you like me to draft messages for them?`,
            timestamp: new Date(),
          };
          
          setMessages([proactiveMessage]);
        }
      } catch (err) {
        console.error("Failed to check followups:", err);
      } finally {
        setHasCheckedFollowups(true);
      }
    };

    checkFollowups();
  }, [hasCheckedFollowups, messages.length]);

  const sendMessage = async () => {
    console.log("[sendMessage] Called!", { sessionStatus, hasSession: !!currentSession, version: COMPONENT_VERSION });

    try {
      const trimmedInput = input.trim();
      console.log("[sendMessage] Input:", { length: trimmedInput.length, isLoading });

      if (!trimmedInput || isLoading) {
        console.log("[sendMessage] Early return - empty or loading");
        return;
      }

      // Use pre-checked session status instead of calling getSession()
      console.log("[sendMessage] Checking session status:", sessionStatus);
      
      if (sessionStatus === 'checking') {
        console.log("[sendMessage] Session still checking - waiting...");
        setMessages((prev) => [
          ...prev,
          {
            id: safeUUID(),
            role: "assistant",
            content: "Still verifying your session. Please wait a moment and try again.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (sessionStatus === 'none') {
        console.log("[sendMessage] No session - prompting sign in");
        setMessages((prev) => [
          ...prev,
          {
            id: safeUUID(),
            role: "assistant",
            content: "Please sign in so I can access your connected integrations.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (sessionStatus === 'expired' || !currentSession) {
        console.log("[sendMessage] Session expired");
        setMessages((prev) => [
          ...prev,
          {
            id: safeUUID(),
            role: "assistant",
            content: "Your session has expired. Tap the refresh button above to continue.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      console.log("[sendMessage] Session valid, proceeding...");

      const messageId = safeUUID();
      const userMessage: Message = {
        id: messageId,
        role: "user",
        content: trimmedInput,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      const apiMessages = [
        { role: "system", content: MAI_SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: trimmedInput },
      ];
      console.log("[sendMessage] API messages built:", { count: apiMessages.length });

      const accessToken = currentSession.access_token;
      console.log("[sendMessage] Access token extracted:", { hasToken: !!accessToken });

      console.log("[sendMessage] Invoking ai-assistant...");
      const invokeStart = Date.now();
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 1024,
          stream: false,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log("[sendMessage] Invoke complete:", { 
        elapsedMs: Date.now() - invokeStart, 
        hasData: !!data, 
        hasError: !!error 
      });

      if (error) {
        console.error("[sendMessage] Invoke error:", error);
        throw error;
      }

      if (!data) {
        throw new Error("No response from assistant");
      }

      const assistantContent =
        (data as { content?: string; error?: string }).content ||
        (data as { content?: string; error?: string }).error ||
        "Something went wrong. Try again.";

      const assistantMessage: Message = {
        id: safeUUID(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      console.log("[sendMessage] Success!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[sendMessage] Error:", err);

      setMessages((prev) => [
        ...prev,
        {
          id: safeUUID(),
          role: "assistant",
          content: `Hit a snag. ${errorMessage}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
      console.log("[sendMessage] Complete");
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    // Auto-focus the textarea after selecting
    textareaRef.current?.focus();
  };

  const handleVoiceTranscript = (transcript: string) => {
    setInput((prev) => prev + (prev ? " " : "") + transcript);
    textareaRef.current?.focus();
  };

  return (
    <>
      <VoiceChat
        isOpen={isVoiceChatOpen}
        onClose={() => setIsVoiceChatOpen(false)}
        conversationHistory={messages.map(m => ({ role: m.role, content: m.content }))}
        systemPrompt={MAI_SYSTEM_PROMPT}
      />
      
      <div className="flex flex-col h-[100dvh] md:h-[calc(100dvh-4rem)] w-full max-w-[800px] mx-auto">
      {/* Mobile header with back button */}
      {isMobile && (
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card/95 backdrop-blur-md px-4">
          <button 
            onClick={() => navigate("/dashboard")} 
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <img src={maiLogo} alt="mai" className="h-7 w-auto" />
            <span className="font-semibold text-foreground">Chat</span>
          </div>
        </header>
      )}

      {/* Messages area with bottom padding for input on mobile */}
      <div className="flex-1 overflow-y-auto py-4 pb-36 md:pb-4 flex flex-col px-3 md:px-4">
        <div className="flex flex-col flex-1">
          <div className="flex-1 min-h-0" />
          
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
              <div className="flex items-center justify-center mb-4">
                <img src={maiLogo} alt="mai" className="h-16 w-auto" />
              </div>
              <p className="text-muted-foreground text-lg mb-2">
                What do you need?
              </p>
              <p className="text-muted-foreground/70 text-sm max-w-xs">
                Try saying "Show me my calendar" or "What emails need my attention?"
              </p>
            </div>
          )}

          {messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 md:gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  style={{ animationDelay: `${Math.min(idx * 0.05, 0.3)}s` }}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center ml-1 md:ml-2">
                      <img src={maiLogo} alt="mai" className="h-7 md:h-8 w-auto" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 md:px-4 md:py-2.5 break-words transition-all ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md mr-1 md:mr-2"
                        : "bg-muted rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex gap-2 md:gap-3 justify-start mt-4 animate-fade-in">
              <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center ml-1 md:ml-2">
                <img src={maiLogo} alt="mai" className="h-7 md:h-8 w-auto animate-pulse-soft" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2.5 md:px-4 md:py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area - fixed on mobile with keyboard-aware positioning */}
      <div 
        className="fixed bottom-0 left-0 right-0 md:static border-t bg-background/95 backdrop-blur-md z-50"
        style={{
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          paddingTop: '0.5rem',
          paddingLeft: 'calc(0.75rem + env(safe-area-inset-left))',
          paddingRight: 'calc(0.75rem + env(safe-area-inset-right))',
        }}
      >
        <div className="w-full max-w-[800px] mx-auto space-y-2">
          {/* Session status banner */}
          {sessionStatus === 'checking' && (
            <div className="text-sm text-muted-foreground text-center py-1">
              Verifying session...
            </div>
          )}
          
          {sessionStatus === 'expired' && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>Session expired</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefreshSession}
                disabled={isRefreshingSession}
                className="h-8"
              >
                {isRefreshingSession ? (
                  <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Refresh
              </Button>
            </div>
          )}
          
          {sessionStatus === 'none' && (
            <div className="bg-muted border border-border rounded-lg p-2 flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Please sign in to chat</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/auth')}
                className="h-8"
              >
                Sign In
              </Button>
            </div>
          )}

          {/* Quick action chips - only show when no messages and session is valid */}
          {messages.length === 0 && sessionStatus === 'valid' && (
            <QuickActionChips onSelect={handleQuickAction} disabled={isLoading} />
          )}
          
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              console.log("[Form] onSubmit triggered");
              sendMessage();
            }}
            className="flex gap-2 items-end"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsVoiceChatOpen(true)}
              disabled={sessionStatus !== 'valid'}
              className="h-11 w-11 min-w-[44px] rounded-full flex-shrink-0"
              aria-label="Open voice mode"
            >
              <Mic className="h-5 w-5" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              placeholder={sessionStatus === 'valid' ? "Message mai..." : "Sign in to chat..."}
              disabled={sessionStatus !== 'valid'}
              className="min-h-[44px] max-h-[120px] resize-none rounded-2xl py-3 flex-1 min-w-0"
              style={{ fontSize: '16px' }}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim() || sessionStatus !== 'valid'}
              size="icon"
              className="h-11 w-11 min-w-[44px] rounded-full flex-shrink-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
    </>
  );
}
