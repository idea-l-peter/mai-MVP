import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { WhatsAppLogo } from "@/components/icons";
import { 
  Send, 
  ArrowLeft,
  Phone,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface WhatsAppMessage {
  id: string;
  phone_number: string;
  message_id: string | null;
  direction: string;
  content: string | null;
  message_type: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface ConversationThread {
  phoneNumber: string;
  lastMessage: WhatsAppMessage;
  unreadCount: number;
}

export function WhatsAppConversations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { sendMessage, fetchMessages, isLoading } = useWhatsAppIntegration();
  
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages on mount
  useEffect(() => {
    loadMessages();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedPhone]);

  const loadMessages = async () => {
    setIsLoadingMessages(true);
    try {
      const data = await fetchMessages(200);
      setMessages(data);
      
      // Group messages by phone number
      const threadMap = new Map<string, ConversationThread>();
      for (const msg of data) {
        const existing = threadMap.get(msg.phone_number);
        if (!existing || new Date(msg.created_at) > new Date(existing.lastMessage.created_at)) {
          threadMap.set(msg.phone_number, {
            phoneNumber: msg.phone_number,
            lastMessage: msg,
            unreadCount: msg.direction === "inbound" && msg.status !== "read" ? 1 : 0,
          });
        }
      }
      
      // Sort by most recent
      const sortedThreads = Array.from(threadMap.values()).sort(
        (a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
      );
      setThreads(sortedThreads);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const phone = selectedPhone || newPhoneNumber.trim();
    if (!phone || !newMessage.trim()) {
      toast({
        title: "Missing fields",
        description: "Please enter phone number and message",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    const result = await sendMessage(phone, newMessage.trim());
    setIsSending(false);

    if (result.success) {
      setNewMessage("");
      setNewPhoneNumber("");
      loadMessages();
    }
  };

  const getThreadMessages = () => {
    if (!selectedPhone) return [];
    return messages
      .filter(m => m.phone_number === selectedPhone)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatPhoneNumber = (phone: string) => {
    // Basic formatting for display
    if (phone.length === 12) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
    }
    return `+${phone}`;
  };

  // Thread list view
  const ThreadList = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WhatsAppLogo className="h-6 w-6" />
          <h2 className="font-semibold">WhatsApp</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={loadMessages} disabled={isLoadingMessages}>
          <RefreshCw className={`h-4 w-4 ${isLoadingMessages ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      {/* New conversation input */}
      <div className="p-3 border-b">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            placeholder="Phone number..."
            value={newPhoneNumber}
            onChange={(e) => setNewPhoneNumber(e.target.value)}
            className="text-sm"
          />
          <Button type="button" size="sm" onClick={() => {
            if (newPhoneNumber.trim()) {
              setSelectedPhone(newPhoneNumber.replace(/[^\d]/g, ''));
              setNewPhoneNumber("");
            }
          }}>
            <Phone className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <ScrollArea className="flex-1">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-12 px-4 text-muted-foreground">
            <WhatsAppLogo className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No conversations yet</p>
            <p className="text-sm mt-1">Enter a phone number above to start</p>
          </div>
        ) : (
          <div className="divide-y">
            {threads.map((thread) => (
              <button
                key={thread.phoneNumber}
                onClick={() => setSelectedPhone(thread.phoneNumber)}
                className="w-full p-3 hover:bg-muted/50 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="h-5 w-5 text-[#25D366]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">
                      {formatPhoneNumber(thread.phoneNumber)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(thread.lastMessage.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {thread.lastMessage.direction === "outbound" && "You: "}
                    {thread.lastMessage.content || "[Media]"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  // Chat view for selected conversation
  const ChatView = () => {
    const threadMessages = getThreadMessages();
    
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-3 border-b flex items-center gap-3 bg-card">
          <button
            onClick={() => setSelectedPhone(null)}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center">
            <Phone className="h-5 w-5 text-[#25D366]" />
          </div>
          <div>
            <p className="font-medium">{formatPhoneNumber(selectedPhone!)}</p>
            <p className="text-xs text-muted-foreground">WhatsApp Business</p>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {threadMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    msg.direction === "outbound"
                      ? "bg-[#DCF8C6] dark:bg-[#005C4B] text-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content || "[Media]"}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(msg.created_at)}
                    </span>
                    {msg.direction === "outbound" && (
                      msg.status === "delivered" || msg.status === "read" ? (
                        <CheckCircle className="h-3 w-3 text-[#53BDEB]" />
                      ) : msg.status === "sent" ? (
                        <CheckCircle className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t bg-background">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={isSending}
              className="flex-1"
            />
            <Button type="submit" disabled={isSending || !newMessage.trim()}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full border rounded-lg overflow-hidden bg-card">
      {selectedPhone ? <ChatView /> : <ThreadList />}
    </div>
  );
}
