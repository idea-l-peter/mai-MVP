import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Global hook to capture Google OAuth authorization code and provider_token.
 * This MUST run at the app level (App.tsx) to catch the code/token before
 * other components try to process it.
 * 
 * This is the ONLY place that handles Google OAuth code exchange.
 */

const SUPABASE_AUTH_KEY = 'sb-vqunxhjgpdgpzkjescvb-auth-token';
const TOKEN_CAPTURED_KEY = 'google_provider_token_captured';
const CODE_PROCESSED_KEY = 'google_oauth_code_processed';

// Full Google Workspace scopes
const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// ============================================================
// STORE TOKENS FUNCTION - Defined at module level to avoid hoisting issues
// ============================================================
async function storeTokens(providerToken: string, providerRefreshToken: string | null): Promise<void> {
  // Check if we already captured this token recently (within 30 seconds)
  const lastCaptured = sessionStorage.getItem(TOKEN_CAPTURED_KEY);
  if (lastCaptured) {
    const elapsed = Date.now() - parseInt(lastCaptured, 10);
    if (elapsed < 30000) {
      return;
    }
  }

  try {
    // Persist to localStorage for client-side access
    try {
      const authData = localStorage.getItem(SUPABASE_AUTH_KEY);
      if (authData) {
        const parsed = JSON.parse(authData);
        if (!parsed.provider_token) {
          parsed.provider_token = providerToken;
          if (providerRefreshToken) {
            parsed.provider_refresh_token = providerRefreshToken;
          }
          localStorage.setItem(SUPABASE_AUTH_KEY, JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.error('[GoogleTokenCapture] Failed to persist to localStorage:', e);
    }

    // Store tokens server-side via edge function
    const response = await supabase.functions.invoke('store-google-tokens', {
      body: {
        provider: 'google',
        provider_token: providerToken,
        provider_refresh_token: providerRefreshToken,
        scopes: GOOGLE_WORKSPACE_SCOPES,
      },
    });

    if (response.error) {
      console.error('[GoogleTokenCapture] Edge function error:', response.error.message);
      toast({ 
        title: "Connection failed: could not save credentials", 
        description: response.error.message || "Database error while storing Google tokens.", 
        variant: "destructive" 
      });
      return;
    }

    if (!response.data?.success) {
      console.error('[GoogleTokenCapture] Edge function returned failure:', response.data?.error);
      toast({ 
        title: "Connection failed: could not save credentials", 
        description: response.data?.error || "Unknown error while storing tokens.", 
        variant: "destructive" 
      });
      return;
    }

    // Mark as captured
    sessionStorage.setItem(TOKEN_CAPTURED_KEY, Date.now().toString());

    toast({ 
      title: "Google Connected!", 
      description: `Successfully connected as ${response.data.provider_email}` 
    });

    // Dispatch event so IntegrationsContent can refresh
    window.dispatchEvent(new CustomEvent('google-integration-connected'));
  } catch (e) {
    console.error('[GoogleTokenCapture] Unexpected error:', e);
    toast({ 
      title: "Connection failed", 
      description: "An unexpected error occurred while saving credentials.", 
      variant: "destructive" 
    });
  }
}

export function useGoogleTokenCapture() {
  const captureInProgressRef = useRef(false);

  useEffect(() => {
    // Check for OAuth code in URL and clean it
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      // IMMEDIATELY clean the URL before doing anything else
      window.history.replaceState({}, '', window.location.pathname);
      
      // Check if we already processed this code
      const processedCode = sessionStorage.getItem(CODE_PROCESSED_KEY);
      if (processedCode === code) {
        return;
      }
      
      // Mark code as being processed
      sessionStorage.setItem(CODE_PROCESSED_KEY, code);

      // Process the code
      const processCode = async () => {
        if (captureInProgressRef.current) {
          return;
        }
        captureInProgressRef.current = true;

        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            console.error('[GoogleTokenCapture] exchangeCodeForSession error:', error);
            toast({ 
              title: "Google connection failed", 
              description: error.message, 
              variant: "destructive" 
            });
            sessionStorage.removeItem(CODE_PROCESSED_KEY);
            return;
          }

          const providerToken = data.session?.provider_token;
          const providerRefreshToken = data.session?.provider_refresh_token;

          if (!providerToken) {
            console.error('[GoogleTokenCapture] No provider_token in session after exchange');
            toast({ 
              title: "Connection Failed", 
              description: "Could not retrieve Google token after login.", 
              variant: "destructive" 
            });
            return;
          }

          // Store tokens server-side
          await storeTokens(providerToken, providerRefreshToken ?? null);
        } catch (e) {
          console.error('[GoogleTokenCapture] Unexpected error processing code:', e);
          toast({ 
            title: "Connection failed", 
            description: "An unexpected error occurred", 
            variant: "destructive" 
          });
          sessionStorage.removeItem(CODE_PROCESSED_KEY);
        } finally {
          captureInProgressRef.current = false;
        }
      };

      void processCode();
      return; // Don't set up other listeners if we're processing a code
    }

    // Set up auth state listener for token capture
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Capture provider_token when it appears in SIGNED_IN event
        if (event === 'SIGNED_IN' && session?.provider_token && session.user?.id) {
          if (!captureInProgressRef.current) {
            captureInProgressRef.current = true;
            await storeTokens(session.provider_token, session.provider_refresh_token ?? null);
            captureInProgressRef.current = false;
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);
}
