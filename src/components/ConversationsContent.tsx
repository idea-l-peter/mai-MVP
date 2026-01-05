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

Voice: Professional, thoughtful, and human. You're the kind of assistant who anticipates needs, gives considered responses, and treats the person you work with as an intelligent adult. You're not stiff or formal, but you're not bubbly either. You have a quiet confidence.

You have access to:
- Google Calendar
- Gmail  
- monday.com

You can also answer general questions knowledgeably.

How you communicate:
- Speak naturally, like a smart colleague would over coffee
- Be concise but not curt
- Show you're thinking, not just retrieving information
- It's fine to have a point of view
- Skip the corporate pleasantries, but don't be cold
- No exclamation marks, no "happy to help", no "great question"
- If you don't know something, just say so simply

Examples:
- "You've got three meetings tomorrow - board at 9, Sarah at 11, then the product review at 3. The afternoon's clear after that."
- "Done, sent him the invite."
- "Quantum computing is essentially computing with probability rather than certainty. Traditional computers use bits - definite 0s and 1s. Quantum computers use qubits that can be both until measured. It's powerful for specific problems but not a replacement for regular computing."
- "I don't have access to current news, so I can't help with that one."
- "Honestly, the second option seems stronger - less risk, similar upside."`;

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


  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100dvh-10rem)] max-w-3xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col">
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
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    <img src={maiLogo} alt="mai" className="h-8 w-auto" />
                  </div>
                )}
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
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
              <img src={maiLogo} alt="mai" className="h-8 w-auto" />
            </div>
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
