import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { 
  Send, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  AlertTriangle
} from "lucide-react";

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

const STORAGE_KEY = "whatsapp_recent_numbers";
const DEFAULT_NUMBERS = ["971567659090"];

export function DevToolsContent() {
  const { toast } = useToast();
  const { sendTestMessage, fetchMessages } = useWhatsAppIntegration();
  
  // Test message form state
  const [testPhone, setTestPhone] = useState("");
  const [recentNumbers, setRecentNumbers] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  
  // Messages state
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  // Load recent numbers from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        // Merge with defaults, remove duplicates
        const merged = [...new Set([...DEFAULT_NUMBERS, ...parsed])];
        setRecentNumbers(merged);
      } catch {
        setRecentNumbers(DEFAULT_NUMBERS);
      }
    } else {
      setRecentNumbers(DEFAULT_NUMBERS);
    }
  }, []);

  // Load messages on mount
  useEffect(() => {
    loadMessages();
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

  const loadMessages = async () => {
    setIsLoadingMessages(true);
    try {
      const data = await fetchMessages(100);
      setMessages(data);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!testPhone.trim()) {
      toast({
        title: "Missing phone number",
        description: "Please enter a phone number",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    const result = await sendTestMessage(testPhone.trim());
    setIsSending(false);

    if (result.success) {
      saveRecentNumber(testPhone.trim());
      loadMessages();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <CheckCircle className="h-3 w-3 text-blue-500" />;
      case "delivered":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "read":
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getDirectionIcon = (direction: string) => {
    return direction === "inbound" ? (
      <ArrowDownLeft className="h-4 w-4 text-green-600" />
    ) : (
      <ArrowUpRight className="h-4 w-4 text-blue-600" />
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Token Expiry Warning */}
      <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-5 w-5" />
            WhatsApp Token Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            The WhatsApp Access Token stored in Supabase secrets may be expired. 
            Meta access tokens typically expire after 60 days. If sending fails with 
            "Session has expired", you need to generate a new token from the 
            <a 
              href="https://developers.facebook.com/apps" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline ml-1 font-medium"
            >
              Meta Developer Console
            </a>
            {" "}and update the WHATSAPP_ACCESS_TOKEN secret.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Send Test Message */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send Test Message
            </CardTitle>
            <CardDescription>
              Send a WhatsApp test message using the pre-approved "hello_world" template
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendTestMessage} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Recent Numbers</label>
                <Select
                  value=""
                  onValueChange={(value) => setTestPhone(value)}
                  disabled={isSending}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select a saved number..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {recentNumbers.map((num) => (
                      <SelectItem key={num} value={num}>
                        {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number</label>
                <Input
                  placeholder="e.g., 971567659090"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  disabled={isSending}
                />
                <p className="text-xs text-muted-foreground">
                  International format without + or spaces. Select from dropdown or type manually.
                </p>
              </div>
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium mb-1">Template: hello_world</p>
                <p className="text-muted-foreground text-xs">
                  This is a pre-approved Meta template that works outside the 24-hour conversation window.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isSending}>
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Test Message
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Webhook Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Webhook Status
            </CardTitle>
            <CardDescription>
              WhatsApp Business API webhook configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Webhook URL</span>
                <Badge variant="outline" className="font-mono text-xs">
                  Active
                </Badge>
              </div>
              <code className="block bg-muted p-2 rounded text-xs break-all">
                https://vqunxhjgpdgpzkjescvb.supabase.co/functions/v1/whatsapp-webhook
              </code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Signature Verification</span>
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Message Storage</span>
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Message History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Message History</CardTitle>
              <CardDescription>
                Recent WhatsApp messages (inbound and outbound)
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadMessages}
              disabled={isLoadingMessages}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingMessages ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No messages yet</p>
              <p className="text-sm">Send a test message or wait for incoming messages</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`p-3 rounded-lg border ${
                      msg.direction === "inbound" 
                        ? "bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900" 
                        : "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getDirectionIcon(msg.direction)}
                        <span className="font-mono text-sm">{msg.phone_number}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {getStatusIcon(msg.status)}
                        <span className="text-xs text-muted-foreground">{msg.status}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm">{msg.content || "[No content]"}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{msg.message_type}</span>
                      <span>{formatDate(msg.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
