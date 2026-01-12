import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Integration {
  provider: string;
  provider_email: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  connected: boolean;
}

interface UseGoogleIntegrationReturn {
  isConnecting: boolean;
  isDisconnecting: boolean;
  initiateOAuth: (provider: string, scopes: string[]) => void;
  disconnect: (provider: string) => Promise<boolean>;
  getValidToken: (provider: string) => Promise<string | null>;
  checkConnection: (provider: string) => Promise<Integration | null>;
}

export function useGoogleIntegration(): UseGoogleIntegrationReturn {
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

  const [isConnecting, setIsConnecting] = useState(false);

  const initiateOAuth = useCallback(async (provider: string, scopes: string[]) => {
    console.log('[GoogleOAuth] initiateOAuth called with provider:', provider, 'scopes:', scopes);
    
    // This is where the user will be redirected back after the server-side OAuth completes
    const appRedirectUri = `${window.location.origin}/integrations`;

    setIsConnecting(true);

    try {
      // Mark OAuth as in-progress (best-effort) so we can avoid stuck UI after redirects
      try {
        sessionStorage.setItem(OAUTH_STORAGE_KEY, provider);
      } catch {
        // ignore
      }

      console.log('[GoogleOAuth] Getting current user...');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      console.log('[GoogleOAuth] User authenticated:', user.id);

      // Call edge function to get OAuth URL
      console.log('[GoogleOAuth] Calling google-oauth edge function...');
      const { data, error } = await supabase.functions.invoke('google-oauth', {
        body: {
          scopes,
          app_redirect_uri: appRedirectUri,
          provider,
        },
      });

      console.log('[GoogleOAuth] Edge function response:', { data, error });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Redirect to Google OAuth - the callback will happen at the edge function
      console.log('[GoogleOAuth] Redirecting to:', data.oauth_url);
      window.location.href = data.oauth_url;
    } catch (error) {
      console.error('[GoogleOAuth] Failed to initiate OAuth:', error);
      setIsConnecting(false);
      // Clear in-progress flag on error
      try {
        sessionStorage.removeItem(OAUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
      toast({
        title: 'OAuth Error',
        description: error instanceof Error ? error.message : 'Failed to start OAuth flow',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const disconnect = useCallback(async (provider: string): Promise<boolean> => {
    setIsDisconnecting(true);
    
    try {
      // Only pass provider - user_id is derived from auth token on server
      const { data, error } = await supabase.functions.invoke('disconnect-integration', {
        body: { provider },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: 'Disconnected',
        description: `Successfully disconnected from ${provider}`,
      });

      return true;
    } catch (error) {
      console.error('Disconnect error:', error);
      toast({
        title: 'Disconnect failed',
        description: error instanceof Error ? error.message : 'Failed to disconnect',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsDisconnecting(false);
    }
  }, [toast]);

  const getValidToken = useCallback(async (provider: string): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // No need to send user_id - the edge function extracts it from JWT
      const { data, error } = await supabase.functions.invoke('get-valid-token', {
        body: { provider },
      });

      if (error) throw error;
      if (!data.connected) {
        console.log('Integration not connected:', data.error);
        return null;
      }

      if (data.refreshed) {
        console.log('Token was automatically refreshed');
      }

      return data.access_token;
    } catch (error) {
      console.error('Get valid token error:', error);
      return null;
    }
  }, []);

  const checkConnection = useCallback(async (provider: string): Promise<Integration | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_integrations')
        .select('provider, provider_email, token_expires_at, scopes')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        connected: true,
      };
    } catch (error) {
      console.error('Check connection error:', error);
      return null;
    }
  }, []);

  return {
    isConnecting,
    isDisconnecting,
    initiateOAuth,
    disconnect,
    getValidToken,
    checkConnection,
  };
}
