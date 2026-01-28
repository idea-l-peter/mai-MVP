import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  RefreshCw,
  Plus,
  MessageSquare
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

const STORAGE_KEY = "whatsapp_recent_numbers";
const DEFAULT_NUMBERS = ["971567659090"];

export function WhatsAppConversations() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { sendMessage, fetchMessages } = useWhatsAppIntegration();
  
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [recentNumbers, setRecentNumbers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load recent numbers from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        const merged = [...new Set([...DEFAULT_NUMBERS, ...parsed])];
        setRecentNumbers(merged);
      } catch {
        setRecentNumbers(DEFAULT_NUMBERS);
      }
    } else {
      setRecentNumbers(DEFAULT_NUMBERS);
    }
  }, []);

  const saveRecentNumber = useCallback((phone: string) => {
    const cleaned = phone.replace(/[^\d]/g, "");
    if (!cleaned || cleaned.length < 10) return;
    
    setRecentNumbers((prev) => {
      const updated = [cleaned, ...prev.filter((n) => n !== cleaned)].slice(0, 10);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Load messages on mount and set up realtime subscription
  useEffect(() => {
    loadMessages();
    
    // Subscribe to realtime changes
    const channel = supabase
      .channel('whatsapp_messages_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        () => {
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedPhone]);

  const loadMessages = async () => {
    setIsLoadingMessages(true);
    try {
      const data = await fetchMessages(500);
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
    
    const phone = selectedPhone || newPhoneNumber.replace(/[^\d]/g, '');
    const messageText = newMessage.trim();
    
    if (!phone) {
      toast({
        title: "Missing phone number",
        description: "Please enter or select a phone number",
        variant: "destructive",
      });
      return;
    }
    
    if (!messageText) {
      toast({
        title: "Missing message",
        description: "Please enter a message",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    const result = await sendMessage(phone, messageText);
    setIsSending(false);

    if (result.success) {
      setNewMessage("");
      saveRecentNumber(phone);
      if (!selectedPhone) {
        // New conversation started
        setSelectedPhone(phone);
        setNewPhoneNumber("");
        setShowNewConversation(false);
      }
      loadMessages();
    }
  };

  const handleStartNewConversation = () => {
    const phone = newPhoneNumber.replace(/[^\d]/g, '');
    if (phone.length >= 10) {
      setSelectedPhone(phone);
      setNewPhoneNumber("");
      setShowNewConversation(false);
    } else {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number with country code",
        variant: "destructive",
      });
    }
  };

  const handleSelectRecentNumber = (value: string) => {
    setNewPhoneNumber(value);
    setSelectedPhone(value);
    setShowNewConversation(false);
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
    if (phone.length === 12) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
    }
    return `+${phone}`;
  };

  const threadMessages = getThreadMessages();

  // Thread list panel content
  const threadListContent = (
    <div className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between bg-card">
        <div className="flex items-center gap-2">
          <WhatsAppLogo className="h-6 w-6" />
          <h2 className="font-semibold">Messages</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowNewConversation(true)}
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={loadMessages} disabled={isLoadingMessages}>
            <RefreshCw className={`h-4 w-4 ${isLoadingMessages ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* New conversation input with dropdown */}
      {showNewConversation && (
        <div className="p-3 border-b bg-muted/30 space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Recent Numbers</label>
            <Select value="" onValueChange={handleSelectRecentNumber}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select a saved number..." />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {recentNumbers.map((num) => (
                  <SelectItem key={num} value={num}>
                    {formatPhoneNumber(num)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Or enter phone number..."
              value={newPhoneNumber}
              onChange={(e) => setNewPhoneNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartNewConversation()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleStartNewConversation}>
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Example: 971567659090 (no + or spaces)
          </p>
        </div>
      )}

      {/* Thread list */}
      <ScrollArea className="flex-1">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-12 px-4 text-muted-foreground">
            <WhatsAppLogo className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No conversations yet</p>
            <p className="text-sm mt-1">Click + to start a new conversation</p>
          </div>
        ) : (
          <div className="divide-y">
            {threads.map((thread) => (
              <button
                key={thread.phoneNumber}
                onClick={() => {
                  setSelectedPhone(thread.phoneNumber);
                  setShowNewConversation(false);
                }}
                className={`w-full p-3 hover:bg-muted/50 transition-colors text-left flex items-center gap-3 ${
                  selectedPhone === thread.phoneNumber ? 'bg-muted' : ''
                }`}
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

  // Chat panel content
  const chatPanelContent = !selectedPhone ? (
    <div className="flex-1 flex items-center justify-center bg-muted/20">
      <div className="text-center text-muted-foreground">
        <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Select a conversation</p>
        <p className="text-sm mt-1">or start a new one using the + button</p>
      </div>
    </div>
  ) : (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-3 bg-card flex-shrink-0">
        {isMobile && (
          <button
            onClick={() => setSelectedPhone(null)}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center">
          <Phone className="h-5 w-5 text-[#25D366]" />
        </div>
        <div className="flex-1">
          <p className="font-medium">{formatPhoneNumber(selectedPhone)}</p>
          <p className="text-xs text-muted-foreground">WhatsApp Business</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {threadMessages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">Send a message to start the conversation</p>
            </div>
          ) : (
            threadMessages.map((msg) => (
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
                  {msg.message_type === "template" && (
                    <p className="text-xs text-muted-foreground mb-1 italic">[Template]</p>
                  )}
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
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message input */}
      <div className="p-3 border-t bg-background flex-shrink-0">
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
        <p className="text-xs text-muted-foreground mt-2">
          Free-form messages require the recipient to have messaged you within 24 hours
        </p>
      </div>
    </div>
  );

  // Mobile view: show one panel at a time
  if (isMobile) {
    return (
      <div className="h-[calc(100vh-8rem)] border rounded-lg overflow-hidden bg-card">
        {selectedPhone ? chatPanelContent : threadListContent}
      </div>
    );
  }

  // Desktop view: side-by-side panels
  return (
    <div className="h-[calc(100vh-12rem)] border rounded-lg overflow-hidden bg-card flex">
      <div className="w-80 flex-shrink-0">
        {threadListContent}
      </div>
      {chatPanelContent}
    </div>
  );
}
