import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useMondayIntegration() {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { toast } = useToast();

  const OAUTH_STORAGE_KEY = 'oauth_in_progress_provider';

  // Clear any stale OAuth-in-progress flag when the page loads (OAuth returns via full redirect)
  useEffect(() => {
    try {
      sessionStorage.removeItem(OAUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const initiateOAuth = async () => {
    try {
      // Mark OAuth as in-progress (best-effort)
      try {
        sessionStorage.setItem(OAUTH_STORAGE_KEY, 'monday');
      } catch {
        // ignore
      }

      console.log('[MondayOAuth] Getting current user...');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be logged in to connect Monday.com");
      }
      console.log('[MondayOAuth] User found:', user.id.slice(0, 8) + '...');

      const appRedirectUri = `${window.location.origin}/integrations`;
      console.log('[MondayOAuth] App redirect URI:', appRedirectUri);

      // Wrap the edge function call in a timeout
      console.log('[MondayOAuth] Calling monday-oauth edge function with 10s timeout...');
      const timeoutMs = 10000;
      
      const invokePromise = supabase.functions.invoke("monday-oauth", {
        body: {
          app_redirect_uri: appRedirectUri,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Connection timed out. Please check if Edge Functions are deployed.'));
        }, timeoutMs);
      });

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      if (error) {
        console.error('[MondayOAuth] Edge function error:', error);
        throw error;
      }

      console.log('[MondayOAuth] Edge function response:', data);

      if (data?.oauth_url) {
        console.log('[MondayOAuth] Redirecting to Monday.com OAuth...');
        window.location.href = data.oauth_url;
      } else {
        throw new Error("No OAuth URL returned from edge function");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start OAuth";
      console.error('[MondayOAuth] OAuth initiation failed:', message);
      
      // Clear in-progress flag on error
      try {
        sessionStorage.removeItem(OAUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
      toast({
        title: "Connection failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const disconnect = async (): Promise<boolean> => {
    setIsDisconnecting(true);
    try {
      // Only pass provider - user_id is derived from auth token on server
      const { error } = await supabase.functions.invoke("disconnect-integration", {
        body: { provider: "monday" },
      });

      if (error) throw error;

      toast({
        title: "Disconnected",
        description: "Monday.com has been disconnected",
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disconnect";
      toast({
        title: "Disconnection failed",
        description: message,
        variant: "destructive",
      });
      return false;
    } finally {
      setIsDisconnecting(false);
    }
  };

  /**
   * Check if user has a valid Monday.com integration in the database.
   * Queries both user_integrations and encrypted_integration_tokens to verify connection.
   */
  const checkConnection = async (): Promise<{ connected: boolean; provider_email?: string } | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[MondayOAuth] checkConnection: No user logged in');
        return null;
      }

      console.log('[MondayOAuth] Checking database for user:', user.id.slice(0, 8));

      // Query user_integrations table for monday provider
      const { data, error } = await supabase
        .from("user_integrations")
        .select("provider_email")
        .eq("user_id", user.id)
        .eq("provider", "monday")
        .maybeSingle();

      if (error) {
        console.error("[MondayOAuth] Database query error:", error);
        return null;
      }

      if (!data) {
        console.log('[MondayOAuth] No integration found in database');
        return { connected: false };
      }

      console.log('[MondayOAuth] Integration found in database:', { email: data.provider_email });

      // Also verify that encrypted tokens exist
      const { data: tokenData, error: tokenError } = await supabase
        .from('encrypted_integration_tokens')
        .select('token_type')
        .eq('user_id', user.id)
        .eq('provider', 'monday');

      if (tokenError) {
        console.error('[MondayOAuth] Token check error:', tokenError);
      } else {
        const tokenTypes = tokenData?.map(t => t.token_type) || [];
        console.log('[MondayOAuth] Token types found:', tokenTypes);
        
        if (!tokenTypes.includes('access_token')) {
          console.log('[MondayOAuth] No access_token found - integration incomplete');
          return { connected: false };
        }
      }

      console.log('[MondayOAuth] Token captured successfully - connection verified');
      return { connected: true, provider_email: data.provider_email || undefined };
    } catch (error) {
      console.error("[MondayOAuth] Error checking connection:", error);
      return null;
    }
  };

  return {
    isConnecting: false,
    isDisconnecting,
    initiateOAuth,
    disconnect,
    checkConnection,
  };
}
