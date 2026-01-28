import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { WhatsAppLogo } from "@/components/icons";
import { 
  ArrowLeft, 
  Send, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2
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

export default function DevTools() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sendMessage, fetchMessages, isLoading } = useWhatsAppIntegration();
  
  // Test message form state
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  // Messages state
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  // Load messages on mount
  useEffect(() => {
    loadMessages();
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
    
    if (!testPhone.trim() || !testMessage.trim()) {
      toast({
        title: "Missing fields",
        description: "Please enter both phone number and message",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    const result = await sendMessage(testPhone.trim(), testMessage.trim());
    setIsSending(false);

    if (result.success) {
      setTestMessage("");
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-md">
        <div className="container flex h-14 items-center gap-4 px-4">
          <button 
            onClick={() => navigate("/dashboard")}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-lg">Dev Tools</h1>
        </div>
      </header>

      <main className="container px-4 py-6">
        <Tabs defaultValue="whatsapp" className="space-y-4">
          <TabsList>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <WhatsAppLogo className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Send Test Message */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Send Test Message
                  </CardTitle>
                  <CardDescription>
                    Send a WhatsApp message to test the integration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSendTestMessage} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Phone Number</label>
                      <Input
                        placeholder="e.g., 971567659090"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        disabled={isSending}
                      />
                      <p className="text-xs text-muted-foreground">
                        International format without + or spaces
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Message</label>
                      <Textarea
                        placeholder="Type your test message..."
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        disabled={isSending}
                        rows={3}
                      />
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
                          Send Message
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
                    <Badge className="bg-green-100 text-green-700">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Message Storage</span>
                    <Badge className="bg-green-100 text-green-700">Active</Badge>
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
