import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import maiLogo from "@/assets/mai-logo.png";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const MAI_SYSTEM_PROMPT = `You are mai, an executive assistant.

Voice: Warm, professional, and capable. Think of a trusted colleague who's genuinely helpful without being servile. You have quiet confidence and treat the person you work with as an intelligent peer.

You have access to tools that let you interact with the user's calendar, email, and tasks.
- When the user asks about their calendar or schedule, you MUST call the get_calendar_events tool. Do not say you don't have access.
- When the user asks to create, schedule, or add a calendar event or meeting, you MUST call the create_calendar_event tool.
- When the user asks about their emails, inbox, or messages, you MUST call the get_emails tool. Do not say you don't have access.
- When the user asks to send, compose, or email someone, you MUST first compose the email but DO NOT call send_email yet.
- Always prefer using an appropriate tool over asking the user for information you can retrieve yourself.

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

You have access to:
- Google Calendar (read events, create events with optional Google Meet)
- Gmail (read emails, send emails with your signature)
- monday.com

You can also answer general questions knowledgeably. For questions outside your core EA functions (calendar, email, monday.com tasks), provide a brief, helpful answer in 1-3 sentences, then offer to elaborate OR gently steer back to how you can assist with their schedule, communications, or tasks. Don't write essays unless specifically asked for detailed information.

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
- "I don't have access to current news, so I can't help with that one."`;

export function ConversationsContent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // Ensure user is authenticated so the edge function can enable tools (calendar, gmail, monday)
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Please sign in so I can access your connected integrations.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      console.log("[Chat] Session:", {
        hasSession: !!sessionData.session,
        userEmail: sessionData.session?.user?.email,
        accessTokenPresent: !!accessToken,
        accessTokenPrefix: accessToken ? accessToken.substring(0, 12) + "..." : null,
      });

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: [
            { role: "system", content: MAI_SYSTEM_PROMPT },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userMessage.content },
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
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };


  return (
    <div className="flex flex-col h-[calc(100dvh-12rem)] md:h-[calc(100dvh-14rem)] -mx-4 md:mx-0">
      <div className="flex-1 overflow-y-auto py-4 flex flex-col px-4 md:px-0">
        <div className="max-w-3xl w-full mx-auto flex flex-col flex-1">
          <div className="flex-1 min-h-0" />
          
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex items-center justify-center mb-4">
                <img src={maiLogo} alt="mai" className="h-16 w-auto" />
              </div>
              <p className="text-muted-foreground text-lg">
                What do you need?
              </p>
            </div>
          )}

          {messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 md:gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center">
                      <img src={maiLogo} alt="mai" className="h-7 md:h-8 w-auto" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-3 py-2 md:px-4 md:py-2.5 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex gap-2 md:gap-3 justify-start mt-4">
              <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 flex items-center justify-center">
                <img src={maiLogo} alt="mai" className="h-7 md:h-8 w-auto" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2.5 md:px-4 md:py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex-shrink-0 border-t bg-background pt-3 pb-2 px-4 md:px-0 md:pt-4 md:pb-0">
        <div className="max-w-3xl w-full mx-auto">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              placeholder="Message mai..."
              className="min-h-[44px] max-h-[120px] resize-none rounded-2xl py-3 flex-1"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              size="icon"
              className="h-11 w-11 rounded-full flex-shrink-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
