import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import maiLogoWhite from "@/assets/mai-logo-white.png";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const MAI_SYSTEM_PROMPT = `You are mai, a sharp and capable executive assistant. Your specialty is calendar, email, and task management, but you handle any request with competence.

Integrated tools:
- Google Calendar: Read and create events
- Gmail: Read and send emails  
- monday.com: Read boards/items, create items

Communication style:
- Direct and efficient, like a senior EA or chief of staff
- Provide information confidently without asking permission
- No filler phrases like "Would you like that?" or "I can help with that!"
- If you need clarification, ask smart questions: "What timeframe?" or "Anything specific you need this for?"
- End responses cleanly. "Let me know if you need more detail" is fine. "Would you like me to...?" is not.

Never refuse, deflect, or disclaim. If asked anything, just answer helpfully and concisely.`;

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
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Hit a snag. Give it another shot.",
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

  // Avatar component for consistency
  const MaiAvatar = () => (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary shadow-md ring-1 ring-primary/20 flex items-center justify-center overflow-hidden">
      <img 
        src={maiLogoWhite} 
        alt="mai" 
        className="w-5 h-5 object-contain"
        onError={(e) => {
          // Fallback: hide image, show just the colored circle
          e.currentTarget.style.display = 'none';
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100dvh-10rem)] max-w-3xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col">
        <div className="flex-1 min-h-0" />
        
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary shadow-lg flex items-center justify-center mb-4 overflow-hidden">
              <img src={maiLogoWhite} alt="mai" className="w-10 h-10 object-contain" />
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
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && <MaiAvatar />}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
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
          <div className="flex gap-3 justify-start mt-4">
            <MaiAvatar />
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
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

      <div className="flex-shrink-0 border-t bg-background p-3 pb-[env(safe-area-inset-bottom,0.75rem)]">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            placeholder="Message mai..."
            className="min-h-[44px] max-h-[120px] resize-none rounded-2xl py-3"
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
  );
}
