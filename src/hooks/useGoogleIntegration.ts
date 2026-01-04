import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Integration {
  provider: string;
  provider_email: string | null;
  token_expires_at: string | null;
  connected: boolean;
}

interface UseGoogleIntegrationReturn {
  isConnecting: boolean;
  isDisconnecting: boolean;
  initiateOAuth: (provider: string, scopes: string[]) => void;
  handleOAuthCallback: (code: string, provider: string) => Promise<boolean>;
  disconnect: (provider: string) => Promise<boolean>;
  getValidToken: (provider: string) => Promise<string | null>;
  checkConnection: (provider: string) => Promise<Integration | null>;
}

// Note: This needs to be replaced with your actual Google OAuth Client ID
// Get this from Google Cloud Console > APIs & Services > Credentials
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function useGoogleIntegration(): UseGoogleIntegrationReturn {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { toast } = useToast();

  const initiateOAuth = useCallback((provider: string, scopes: string[]) => {
    const redirectUri = `${window.location.origin}/dashboard/integrations`;
    const scopeString = scopes.join(' ');
    
    // Store provider in sessionStorage for callback handling
    sessionStorage.setItem('oauth_provider', provider);
    
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopeString);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', provider);
    
    window.location.href = authUrl.toString();
  }, []);

  const handleOAuthCallback = useCallback(async (code: string, provider: string): Promise<boolean> => {
    setIsConnecting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const redirectUri = `${window.location.origin}/dashboard/integrations`;
      
      const { data, error } = await supabase.functions.invoke('google-oauth-callback', {
        body: {
          code,
          redirect_uri: redirectUri,
          user_id: user.id,
          provider,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: 'Connected!',
        description: `Successfully connected to ${provider} as ${data.provider_email}`,
      });

      return true;
    } catch (error) {
      console.error('OAuth callback error:', error);
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Failed to connect',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const disconnect = useCallback(async (provider: string): Promise<boolean> => {
    setIsDisconnecting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('disconnect-integration', {
        body: {
          user_id: user.id,
          provider,
        },
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
        body: {
          user_id: user.id,
          provider,
        },
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
        .select('provider, provider_email, token_expires_at')
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
    handleOAuthCallback,
    disconnect,
    getValidToken,
    checkConnection,
  };
}
