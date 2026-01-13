import { useState, useCallback, useEffect, useRef } from 'react';
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
  initiateOAuth: (provider: string, scopes: string[]) => Promise<void>;
  disconnect: (provider: string) => Promise<boolean>;
  getValidToken: (provider: string) => Promise<string | null>;
  checkConnection: (provider: string) => Promise<Integration | null>;
}

export function useGoogleIntegration(): UseGoogleIntegrationReturn {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const OAUTH_STORAGE_KEY = 'oauth_in_progress_provider';

  // Clear any stale OAuth-in-progress flag when the hook loads
  useEffect(() => {
    try {
      sessionStorage.removeItem(OAUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const initiateOAuth = useCallback(async (provider: string, scopes: string[]) => {
    console.log('[GoogleOAuth] initiateOAuth called with provider:', provider, 'scopes:', scopes);
    
    setIsConnecting(true);

    try {
      try {
        sessionStorage.setItem(OAUTH_STORAGE_KEY, provider);
      } catch {
        // ignore
      }

      console.log('[GoogleOAuth] About to call signInWithOAuth');
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/integrations`,
          scopes: scopes.join(' '),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      console.log('[GoogleOAuth] signInWithOAuth returned:', { data, error });

      if (error) {
        console.error('[GoogleOAuth] OAuth error:', error);
        toast({
          title: 'OAuth Error',
          description: error.message,
          variant: 'destructive',
        });
        setIsConnecting(false);
        try {
          sessionStorage.removeItem(OAUTH_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
      // If successful, browser will redirect - no need to setIsConnecting(false)
    } catch (err) {
      console.error('[GoogleOAuth] Caught exception:', err);
      setIsConnecting(false);
      try {
        sessionStorage.removeItem(OAUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
      toast({
        title: 'OAuth Error',
        description: err instanceof Error ? err.message : 'Failed to start OAuth flow',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const disconnect = useCallback(async (provider: string): Promise<boolean> => {
    setIsDisconnecting(true);
    
    try {
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
