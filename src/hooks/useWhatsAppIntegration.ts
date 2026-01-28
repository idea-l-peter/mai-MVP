import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

export function useWhatsAppIntegration() {
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const { toast } = useToast();

  // Check if WhatsApp is configured (we check if we can fetch messages)
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      // Try to fetch messages - if the table exists and user has access, it's "connected"
      const { error } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .limit(1);

      return !error;
    } catch {
      return false;
    }
  }, []);

  // Fetch WhatsApp messages
  const fetchMessages = useCallback(async (limit = 50): Promise<WhatsAppMessage[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const typedMessages = (data || []) as WhatsAppMessage[];
      setMessages(typedMessages);
      return typedMessages;
    } catch (err) {
      console.error("[WhatsApp] Failed to fetch messages:", err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Send a WhatsApp message
  const sendMessage = useCallback(async (
    to: string,
    message: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          type: "text",
          to,
          message,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Message sent",
          description: `WhatsApp message sent to ${to}`,
        });
        // Refresh messages
        await fetchMessages();
        return { success: true, messageId: data.message_id };
      } else {
        throw new Error(data?.error || "Failed to send message");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Failed to send message",
        description: errorMessage,
        variant: "destructive",
      });
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [toast, fetchMessages]);

  // Send a template message
  const sendTemplateMessage = useCallback(async (
    to: string,
    templateName: string,
    templateLanguage = "en",
    templateComponents: unknown[] = []
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          type: "template",
          to,
          template_name: templateName,
          template_language: templateLanguage,
          template_components: templateComponents,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Template sent",
          description: `WhatsApp template sent to ${to}`,
        });
        await fetchMessages();
        return { success: true, messageId: data.message_id };
      } else {
        throw new Error(data?.error || "Failed to send template");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Failed to send template",
        description: errorMessage,
        variant: "destructive",
      });
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [toast, fetchMessages]);

  return {
    isLoading,
    messages,
    checkConnection,
    fetchMessages,
    sendMessage,
    sendTemplateMessage,
  };
}
