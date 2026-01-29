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

  // Token refresh logic - runs on mount and every 45 minutes
  useEffect(() => {
    const refreshGoogleToken = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.provider_refresh_token) {
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            console.error('[GoogleOAuth] Token refresh failed:', error);
          } else if (session.provider_token) {
            // Store refreshed token to database
            const { error: storeError } = await supabase.functions.invoke('store-google-tokens', {
              body: {
                provider: 'google',
                provider_token: session.provider_token,
                provider_refresh_token: session.provider_refresh_token,
              },
            });
            
            if (storeError) {
              console.error('[GoogleOAuth] Failed to store refreshed token:', storeError);
            }
          }
        }
      } catch (err) {
        console.error('[GoogleOAuth] Token refresh error:', err);
      }
    };

    // Refresh on mount
    refreshGoogleToken();
    
    // Set up interval for every 45 minutes (tokens expire after 1 hour)
    const interval = setInterval(refreshGoogleToken, 45 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Default scopes for full Google Workspace access
  const DEFAULT_GOOGLE_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/contacts.readonly',
  ];

  const initiateOAuth = useCallback(async (provider: string, scopes?: string[]) => {
    setIsConnecting(true);

    // Use provided scopes or fall back to defaults for all-in-one access
    const finalScopes = scopes && scopes.length > 0 ? scopes : DEFAULT_GOOGLE_SCOPES;

    try {
      try {
        sessionStorage.setItem(OAUTH_STORAGE_KEY, provider);
      } catch {
        // ignore
      }

      // Use 'select_account' for a friendlier UX while still getting all permissions
      // Combined with access_type: 'offline' to get refresh token on first auth
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/integrations`,
          scopes: finalScopes.join(' '),
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
            include_granted_scopes: 'true',
          },
        },
      });

      if (error) {
        console.error('[GoogleOAuth] Error:', error);
        toast({
          title: 'Connection Failed',
          description: 'Failed to connect to Google: ' + error.message,
          variant: 'destructive',
        });
        setIsConnecting(false);
        return;
      }

      // Explicitly redirect if URL is returned
      if (data?.url) {
        window.location.href = data.url;
      } else {
        console.error('[GoogleOAuth] No redirect URL returned');
        toast({
          title: 'Connection Failed',
          description: 'Failed to get Google authorization URL',
          variant: 'destructive',
        });
        setIsConnecting(false);
      }
    } catch (err) {
      console.error('[GoogleOAuth] Unexpected error:', err);
      toast({
        title: 'Connection Failed',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
      setIsConnecting(false);
      try {
        sessionStorage.removeItem(OAUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
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
      console.error('[GoogleOAuth] Disconnect error:', error);
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
        return null;
      }

      return data.access_token;
    } catch (error) {
      console.error('[GoogleOAuth] Get valid token error:', error);
      return null;
    }
  }, []);

  /**
   * Check if user has a valid integration in the database.
   * This queries user_integrations table to check if tokens exist.
   */
  const checkConnection = useCallback(async (provider: string): Promise<Integration | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return null;
      }

      // Query user_integrations table for this provider
      const { data, error } = await supabase
        .from('user_integrations')
        .select('provider, provider_email, token_expires_at, scopes')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .maybeSingle();

      if (error) {
        console.error('[GoogleOAuth] Database query error:', error);
        throw error;
      }

      if (!data) {
        return null;
      }

      // Also verify that encrypted tokens exist
      const { data: tokenData, error: tokenError } = await supabase
        .from('encrypted_integration_tokens')
        .select('token_type')
        .eq('user_id', user.id)
        .eq('provider', provider);

      if (tokenError) {
        console.error('[GoogleOAuth] Token check error:', tokenError);
      } else {
        const tokenTypes = tokenData?.map(t => t.token_type) || [];
        if (!tokenTypes.includes('access_token')) {
          return null;
        }
      }

      return {
        ...data,
        connected: true,
      };
    } catch (error) {
      console.error('[GoogleOAuth] Check connection error:', error);
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
