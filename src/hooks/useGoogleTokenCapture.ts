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
      console.log('[GoogleTokenCapture] Token recently captured, skipping');
      return;
    }
  }

  console.log('[GoogleTokenCapture] *** STORING TOKENS ***');
  console.log('[GoogleTokenCapture] Token length:', providerToken.length);
  console.log('[GoogleTokenCapture] Has refresh token:', !!providerRefreshToken);

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
          console.log('[GoogleTokenCapture] Token persisted to localStorage');
        }
      }
    } catch (e) {
      console.error('[GoogleTokenCapture] Failed to persist to localStorage:', e);
    }

    // Store tokens server-side via edge function
    console.log('[GoogleTokenCapture] Calling store-google-tokens edge function...');

    const response = await supabase.functions.invoke('store-google-tokens', {
      body: {
        provider: 'google',
        provider_token: providerToken,
        provider_refresh_token: providerRefreshToken,
        scopes: GOOGLE_WORKSPACE_SCOPES,
      },
    });

    // Detailed error logging
    console.log('[GoogleTokenCapture] Edge function response:', {
      hasData: !!response.data,
      hasError: !!response.error,
      success: response.data?.success,
      errorMessage: response.error?.message,
      errorDetails: response.error,
      dataError: response.data?.error,
    });

    if (response.error) {
      console.error('[GoogleTokenCapture] *** EDGE FUNCTION ERROR ***');
      console.error('[GoogleTokenCapture] Error status:', (response.error as { status?: number }).status);
      console.error('[GoogleTokenCapture] Error message:', response.error.message);
      console.error('[GoogleTokenCapture] Full error:', JSON.stringify(response.error, null, 2));
      toast({ 
        title: "Connection failed: could not save credentials", 
        description: response.error.message || "Database error while storing Google tokens.", 
        variant: "destructive" 
      });
      return;
    }

    if (!response.data?.success) {
      console.error('[GoogleTokenCapture] *** EDGE FUNCTION RETURNED FAILURE ***');
      console.error('[GoogleTokenCapture] Response data:', JSON.stringify(response.data, null, 2));
      toast({ 
        title: "Connection failed: could not save credentials", 
        description: response.data?.error || "Unknown error while storing tokens.", 
        variant: "destructive" 
      });
      return;
    }

    console.log('==============================================');
    console.log('[GoogleTokenCapture] *** TOKEN SAVED TO DATABASE SUCCESSFULLY ***');
    console.log('[GoogleTokenCapture] Provider email:', response.data.provider_email);
    console.log('==============================================');

    // Mark as captured
    sessionStorage.setItem(TOKEN_CAPTURED_KEY, Date.now().toString());

    toast({ 
      title: "Google Connected!", 
      description: `Successfully connected as ${response.data.provider_email}` 
    });

    // Dispatch event so IntegrationsContent can refresh
    window.dispatchEvent(new CustomEvent('google-integration-connected'));
  } catch (e) {
    console.error('[GoogleTokenCapture] *** UNEXPECTED ERROR ***');
    console.error('[GoogleTokenCapture] Error:', e);
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
    console.log('[GoogleTokenCapture] Hook initialized');

    // ============================================================
    // STEP 1: Immediately check for OAuth code in URL and clean it
    // ============================================================
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    console.log('==============================================');
    console.log('[GoogleTokenCapture] PAGE LOADED - Checking for OAuth code...');
    console.log('[GoogleTokenCapture] URL:', window.location.href);
    console.log('[GoogleTokenCapture] Code found:', !!code, code?.substring(0, 20) + '...');
    console.log('==============================================');

    if (code) {
      // IMMEDIATELY clean the URL before doing anything else
      console.log('[GoogleTokenCapture] *** CLEANING URL IMMEDIATELY ***');
      window.history.replaceState({}, '', window.location.pathname);
      
      // Check if we already processed this code
      const processedCode = sessionStorage.getItem(CODE_PROCESSED_KEY);
      if (processedCode === code) {
        console.log('[GoogleTokenCapture] Code already processed, skipping');
        return;
      }
      
      // Mark code as being processed
      sessionStorage.setItem(CODE_PROCESSED_KEY, code);

      // Process the code
      const processCode = async () => {
        if (captureInProgressRef.current) {
          console.log('[GoogleTokenCapture] Capture already in progress, skipping');
          return;
        }
        captureInProgressRef.current = true;

        try {
          console.log('[GoogleTokenCapture] *** EXCHANGING CODE FOR SESSION ***');
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

          console.log('[GoogleTokenCapture] exchangeCodeForSession SUCCESS!');
          console.log('[GoogleTokenCapture] Session user:', data.session?.user?.email);
          console.log('[GoogleTokenCapture] Has provider_token:', !!data.session?.provider_token);
          console.log('[GoogleTokenCapture] Provider token length:', data.session?.provider_token?.length);

          const providerToken = data.session?.provider_token;
          const providerRefreshToken = data.session?.provider_refresh_token;

          if (!providerToken) {
            console.error('[GoogleTokenCapture] No provider_token in session after exchange!');
            toast({ 
              title: "Connection Failed", 
              description: "Could not retrieve Google token after login.", 
              variant: "destructive" 
            });
            return;
          }

          // Store tokens server-side (function is now defined at module level)
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

    // ============================================================
    // STEP 2: Set up auth state listener for token capture
    // ============================================================
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[GoogleTokenCapture] Auth event:', event, {
          hasSession: !!session,
          hasProviderToken: !!session?.provider_token,
          providerTokenLength: session?.provider_token?.length,
          hasRefreshToken: !!session?.provider_refresh_token,
        });

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
      console.log('[GoogleTokenCapture] Cleaning up auth listener');
      subscription.unsubscribe();
    };
  }, []);
}
