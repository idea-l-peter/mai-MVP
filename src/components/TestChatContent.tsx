import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Zap, Clock, RotateCcw } from "lucide-react";

type Provider = "groq" | "openai" | "gemini";

interface Message {
  role: "user" | "assistant";
  content: string;
  metadata?: {
    model_used: string;
    provider_used: Provider;
    latency_ms: number;
    fallback_used: boolean;
  };
}

const PROVIDER_INFO: Record<Provider, { name: string; model: string; color: string }> = {
  groq: { name: "Groq", model: "Llama 3.3 70B", color: "bg-orange-500" },
  openai: { name: "OpenAI", model: "GPT-4o-mini", color: "bg-green-500" },
  gemini: { name: "Gemini", model: "gemini-1.5-flash", color: "bg-blue-500" },
};

export function TestChatContent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>("groq");

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: [
            { role: "system", content: "You are a helpful AI assistant. Keep responses concise." },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userMessage.content },
          ],
          temperature: 0.7,
          max_tokens: 1024,
          stream: false,
          provider: selectedProvider,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.content || data.error || "No response",
        metadata: data.error
          ? undefined
          : {
              model_used: data.model_used,
              provider_used: data.provider_used,
              latency_ms: data.latency_ms,
              fallback_used: data.fallback_used,
            },
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Failed to get response"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              LLM Router Test
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as Provider)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${info.color}`} />
                        {info.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={clearChat}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Testing: {PROVIDER_INFO[selectedProvider].name} → {PROVIDER_INFO[selectedProvider].model}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Messages */}
          <div className="min-h-[300px] max-h-[500px] overflow-y-auto space-y-4 p-2 border rounded-lg bg-muted/30">
            {messages.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Send a message to test the LLM router
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  {msg.metadata && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-xs">
                        <span
                          className={`w-1.5 h-1.5 rounded-full mr-1 ${
                            PROVIDER_INFO[msg.metadata.provider_used]?.color || "bg-gray-500"
                          }`}
                        />
                        {msg.metadata.provider_used}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {msg.metadata.model_used}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {msg.metadata.latency_ms}ms
                      </Badge>
                      {msg.metadata.fallback_used && (
                        <Badge variant="destructive" className="text-xs">
                          Fallback
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-card border rounded-lg p-3">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button onClick={sendMessage} disabled={isLoading || !input.trim()} className="h-auto">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Provider Legend */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            {Object.entries(PROVIDER_INFO).map(([key, info]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${info.color}`} />
                <span className="font-medium">{info.name}:</span>
                <span className="text-muted-foreground">{info.model}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
