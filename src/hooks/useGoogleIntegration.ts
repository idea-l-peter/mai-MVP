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
  handleOAuthCallback: () => Promise<boolean>;
}

export function useGoogleIntegration(): UseGoogleIntegrationReturn {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();
  const callbackHandledRef = useRef(false);

  const OAUTH_STORAGE_KEY = 'oauth_in_progress_provider';

  // Clear any stale OAuth-in-progress flag when the page loads (OAuth returns via full redirect)
  useEffect(() => {
    try {
      sessionStorage.removeItem(OAUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Handle OAuth callback - store provider tokens in user_integrations
  const handleOAuthCallback = useCallback(async (): Promise<boolean> => {
    // Prevent duplicate handling
    if (callbackHandledRef.current) {
      console.log('[GoogleOAuth] Callback already handled, skipping');
      return false;
    }

    console.log('[GoogleOAuth] Checking for OAuth callback...');
    
    try {
      // Get the current session - Supabase should have processed the OAuth return
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('[GoogleOAuth] Session check:', { 
        hasSession: !!session, 
        hasProviderToken: !!session?.provider_token,
        hasProviderRefreshToken: !!session?.provider_refresh_token,
        error: sessionError 
      });

      if (sessionError || !session) {
        console.log('[GoogleOAuth] No session found');
        return false;
      }

      // Check if we have provider tokens (indicates OAuth just completed)
      if (!session.provider_token) {
        console.log('[GoogleOAuth] No provider_token in session - not an OAuth callback');
        return false;
      }

      callbackHandledRef.current = true;
      console.log('[GoogleOAuth] Provider tokens found, storing integration...');

      // Get user email from session
      const userEmail = session.user?.email;
      const userId = session.user?.id;

      if (!userId) {
        console.error('[GoogleOAuth] No user ID in session');
        return false;
      }

      // Store the tokens in user_integrations using encrypted_integration_tokens pattern
      // First, encrypt and store the access token
      const { data: accessTokenData, error: accessTokenError } = await supabase.rpc(
        'store_integration_token',
        {
          p_provider: 'google',
          p_token_type: 'access_token',
          p_token_value: session.provider_token,
          p_user_id: userId,
        }
      );

      if (accessTokenError) {
        console.error('[GoogleOAuth] Failed to store access token:', accessTokenError);
        throw accessTokenError;
      }

      console.log('[GoogleOAuth] Access token stored, ID:', accessTokenData);

      // Store refresh token if available
      let refreshTokenId = null;
      if (session.provider_refresh_token) {
        const { data: refreshTokenData, error: refreshTokenError } = await supabase.rpc(
          'store_integration_token',
          {
            p_provider: 'google',
            p_token_type: 'refresh_token',
            p_token_value: session.provider_refresh_token,
            p_user_id: userId,
          }
        );

        if (refreshTokenError) {
          console.error('[GoogleOAuth] Failed to store refresh token:', refreshTokenError);
        } else {
          refreshTokenId = refreshTokenData;
          console.log('[GoogleOAuth] Refresh token stored, ID:', refreshTokenId);
        }
      }

      // Calculate token expiry (typically 1 hour from now for Google)
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

      // Upsert the user_integrations record
      const { error: upsertError } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: userId,
          provider: 'google',
          provider_email: userEmail,
          access_token_secret_id: accessTokenData,
          refresh_token_secret_id: refreshTokenId,
          token_expires_at: expiresAt,
          scopes: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/contacts',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
          ],
          updated_at: new Date().toISOString(),
        }, { 
          onConflict: 'user_id,provider',
        });

      if (upsertError) {
        console.error('[GoogleOAuth] Failed to upsert integration:', upsertError);
        throw upsertError;
      }

      console.log('[GoogleOAuth] Integration stored successfully!');
      
      toast({
        title: 'Connected!',
        description: `Successfully connected Google Workspace${userEmail ? ` as ${userEmail}` : ''}`,
      });

      // Clear the hash/params from URL
      if (window.location.hash || window.location.search.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      return true;
    } catch (error) {
      console.error('[GoogleOAuth] Callback handling error:', error);
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Failed to store connection',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // isConnecting state is declared above

  const initiateOAuth = useCallback(async (provider: string, scopes: string[]) => {
    console.log('1. [GoogleOAuth] initiateOAuth called with provider:', provider, 'scopes:', scopes);
    
    setIsConnecting(true);

    try {
      // Mark OAuth as in-progress (best-effort) so we can avoid stuck UI after redirects
      try {
        sessionStorage.setItem(OAUTH_STORAGE_KEY, provider);
      } catch {
        // ignore
      }

      console.log('2. [GoogleOAuth] About to call signInWithOAuth');
      
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
      
      console.log('3. [GoogleOAuth] signInWithOAuth returned:', { data, error });

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
      console.error('4. [GoogleOAuth] Caught exception:', err);
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
    handleOAuthCallback,
  };
}
