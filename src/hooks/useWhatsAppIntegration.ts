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

      // Use a timeout to prevent hanging
      const timeoutPromise = new Promise<boolean>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      
      const checkPromise = (async () => {
        // Try to fetch messages - if the table exists and user has access, it's "connected"
        const { error } = await supabase
          .from("whatsapp_messages")
          .select("id")
          .limit(1);
        return !error;
      })();

      return await Promise.race([checkPromise, timeoutPromise]);
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
        const error = "Not authenticated";
        toast({
          title: "Failed to send message",
          description: error,
          variant: "destructive",
        });
        return { success: false, error };
      }

      console.log("[WhatsApp] Sending message to:", to);
      
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          type: "text",
          to,
          message,
        },
      });

      console.log("[WhatsApp] Response:", { data, error });

      if (error) {
        console.error("[WhatsApp] Function invoke error:", error);
        const errorMessage = error.message || "Failed to send message";
        toast({
          title: "Failed to send message",
          description: errorMessage,
          variant: "destructive",
        });
        return { success: false, error: errorMessage };
      }

      if (data?.success) {
        toast({
          title: "Message sent",
          description: `WhatsApp message sent to ${to}`,
        });
        // Refresh messages
        await fetchMessages();
        return { success: true, messageId: data.message_id };
      } else {
        const errorMessage = data?.error || data?.details || "Failed to send message";
        console.error("[WhatsApp] API error:", errorMessage);
        toast({
          title: "Failed to send message",
          description: errorMessage,
          variant: "destructive",
        });
        return { success: false, error: errorMessage };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[WhatsApp] Exception:", err);
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

  // Send a test message using hello_world template (works outside 24hr window)
  const sendTestMessage = useCallback(async (
    to: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    setIsLoading(true);

    try {
      console.log("[WhatsApp] Step 1: Starting sendTestMessage to:", to);

      // For debugging: include explicit headers.
      // - If user is logged in: send their JWT.
      // - If not logged in: still send a Bearer token (anon key) to satisfy callers that expect it.
      //   NOTE: send-whatsapp does NOT require user auth; it uses WHATSAPP_ACCESS_TOKEN on the server.
      const anonKey =
        (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
        (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data.session;

      const headers: Record<string, string> = {};
      if (anonKey) headers.apikey = String(anonKey);
      headers.Authorization = session?.access_token
        ? `Bearer ${session.access_token}`
        : anonKey
          ? `Bearer ${String(anonKey)}`
          : "";

      console.log("[WhatsApp] Step 2: Calling edge function send-whatsapp");
      console.log("[WhatsApp] Has session:", Boolean(session));
      console.log("[WhatsApp] Has anon key:", Boolean(anonKey));
      console.log("[WhatsApp] Request body:", JSON.stringify({ type: "test", to }));
      console.log(
        "[WhatsApp] Request headers:",
        JSON.stringify({
          apikey: headers.apikey ? "[present]" : "[missing]",
          Authorization: headers.Authorization ? "Bearer [present]" : "[missing]",
        })
      );

      const startTime = Date.now();

      const timeoutMs = 30000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      );

      const invokePromise = supabase.functions.invoke("send-whatsapp", {
        body: {
          type: "test",
          to,
        },
        headers,
      });

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      const elapsed = Date.now() - startTime;
      console.log(`[WhatsApp] Step 3: Response received in ${elapsed}ms`);
      console.log("[WhatsApp] Response data:", JSON.stringify(data));
      console.log("[WhatsApp] Response error:", error ? JSON.stringify(error) : "none");

      if (error) {
        console.error("[WhatsApp] Function invoke error:", error);
        const errorMessage = error.message || "Failed to send test message";
        toast({
          title: "Failed to send test message",
          description: errorMessage,
          variant: "destructive",
        });
        return { success: false, error: errorMessage };
      }

      if (data?.success) {
        console.log("[WhatsApp] Step 4: Success! Message ID:", data.message_id);
        toast({
          title: "Test message sent",
          description: `WhatsApp hello_world template sent to ${to}`,
        });
        await fetchMessages();
        return { success: true, messageId: data.message_id };
      } else {
        const errorMessage = data?.error || data?.details || "Failed to send test message";
        console.error("[WhatsApp] API error:", errorMessage);
        toast({
          title: "Failed to send test message",
          description: errorMessage,
          variant: "destructive",
        });
        return { success: false, error: errorMessage };
      }
    } catch (err) {
      if (err instanceof Error && err.message === "Timeout") {
        console.error("[WhatsApp] Request timed out after 30 seconds");
        toast({
          title: "Request timed out",
          description: "The request took too long. Please try again.",
          variant: "destructive",
        });
        return { success: false, error: "Request timed out" };
      }
      
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[WhatsApp] Exception:", err);
      toast({
        title: "Failed to send test message",
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
    templateLanguage = "en_US",
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
    sendTestMessage,
    sendTemplateMessage,
  };
}
