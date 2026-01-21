import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Global hook to capture Google OAuth provider_token immediately when it appears
 * in the auth session. This MUST run at the app level (App.tsx) to catch the token
 * before Supabase consumes it.
 * 
 * The provider_token is only available briefly after OAuth redirect in the
 * SIGNED_IN event. We capture it immediately and:
 * 1. Store it in localStorage for client-side access
 * 2. Send it to the edge function for encrypted server-side storage
 */

const SUPABASE_AUTH_KEY = 'sb-vqunxhjgpdgpzkjescvb-auth-token';
const TOKEN_CAPTURED_KEY = 'google_provider_token_captured';

// Google Workspace scopes we request
const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function useGoogleTokenCapture() {
  const captureInProgressRef = useRef(false);

  useEffect(() => {
    console.log('[GoogleTokenCapture] Setting up auth state listener');

    const captureAndStore = async (args: {
      providerToken: string;
      providerRefreshToken: string | null;
      userId: string;
      source: string;
    }) => {
      // Prevent duplicate processing
      if (captureInProgressRef.current) {
        console.log('[GoogleTokenCapture] Capture already in progress, skipping');
        return;
      }

      // Check if we already captured this token recently (within 30 seconds)
      const lastCaptured = sessionStorage.getItem(TOKEN_CAPTURED_KEY);
      if (lastCaptured) {
        const elapsed = Date.now() - parseInt(lastCaptured, 10);
        if (elapsed < 30000) {
          console.log('[GoogleTokenCapture] Token recently captured, skipping');
          return;
        }
      }

      captureInProgressRef.current = true;
      console.log('[GoogleTokenCapture] *** CAPTURING PROVIDER TOKEN ***', {
        source: args.source,
        providerTokenLength: args.providerToken.length,
        hasRefreshToken: !!args.providerRefreshToken,
      });

      try {
        // Step 1: Immediately persist to localStorage for client-side access
        try {
          const authData = localStorage.getItem(SUPABASE_AUTH_KEY);
          if (authData) {
            const parsed = JSON.parse(authData);
            console.log('[GoogleTokenCapture] localStorage auth token snapshot', {
              has_provider_token: !!parsed?.provider_token,
              has_provider_refresh_token: !!parsed?.provider_refresh_token,
              keys: parsed ? Object.keys(parsed) : [],
            });

            // Ensure the token is in localStorage
            if (!parsed.provider_token) {
              parsed.provider_token = args.providerToken;
              if (args.providerRefreshToken) {
                parsed.provider_refresh_token = args.providerRefreshToken;
              }
              localStorage.setItem(SUPABASE_AUTH_KEY, JSON.stringify(parsed));
              console.log('[GoogleTokenCapture] Token persisted to localStorage');
            }
          } else {
            console.log('[GoogleTokenCapture] No localStorage auth key found:', SUPABASE_AUTH_KEY);
          }
        } catch (e) {
          console.error('[GoogleTokenCapture] Failed to persist to localStorage:', e);
        }

        // Step 2: Store tokens server-side via edge function
        console.log('[GoogleTokenCapture] Calling store-google-tokens edge function...');

        const { data, error } = await supabase.functions.invoke('store-google-tokens', {
          body: {
            provider: 'google',
            provider_token: args.providerToken,
            provider_refresh_token: args.providerRefreshToken,
            scopes: GOOGLE_WORKSPACE_SCOPES,
          },
        });

        if (error) {
          console.error('[GoogleTokenCapture] Edge function error:', error);
        } else if (data?.success) {
          console.log('[GoogleTokenCapture] *** TOKEN STORED SUCCESSFULLY ***', {
            email: data.provider_email,
          });

          // Mark as captured
          sessionStorage.setItem(TOKEN_CAPTURED_KEY, Date.now().toString());

          // Dispatch event so IntegrationsContent can refresh
          window.dispatchEvent(new CustomEvent('google-integration-connected'));
        } else {
          console.error('[GoogleTokenCapture] Edge function returned error:', data?.error);
        }
      } catch (e) {
        console.error('[GoogleTokenCapture] Unexpected error:', e);
      } finally {
        captureInProgressRef.current = false;
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[GoogleTokenCapture] Auth event:', event, {
          hasSession: !!session,
          hasProviderToken: !!session?.provider_token,
          providerTokenLength: session?.provider_token?.length,
          hasRefreshToken: !!session?.provider_refresh_token,
        });

        // The provider_token is only present for OAuth sign-ins (and may not always
        // be present even if the user is signed in). We capture when we see it.
        if (event === 'SIGNED_IN' && session?.provider_token && session.user?.id) {
          await captureAndStore({
            providerToken: session.provider_token,
            providerRefreshToken: session.provider_refresh_token ?? null,
            userId: session.user.id,
            source: 'onAuthStateChange:SIGNED_IN',
          });
        }
      }
    );

    // Fallback: on initial load, the SIGNED_IN event may have already happened.
    // Attempt to capture from the hydrated session or localStorage.
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        console.log('[GoogleTokenCapture] Initial getSession()', {
          hasSession: !!data?.session,
          hasProviderToken: !!data?.session?.provider_token,
          providerTokenLength: data?.session?.provider_token?.length,
          error: error?.message,
        });

        const session = data?.session;
        if (session?.provider_token && session.user?.id) {
          await captureAndStore({
            providerToken: session.provider_token,
            providerRefreshToken: session.provider_refresh_token ?? null,
            userId: session.user.id,
            source: 'getSession()',
          });
          return;
        }

        // last resort: parse localStorage directly (some environments hydrate later)
        const raw = localStorage.getItem(SUPABASE_AUTH_KEY);
        if (!raw) {
          console.log('[GoogleTokenCapture] No localStorage auth token found during fallback');
          return;
        }

        const parsed = JSON.parse(raw);
        console.log('[GoogleTokenCapture] Fallback localStorage parse', {
          has_provider_token: !!parsed?.provider_token,
          provider_token_length: parsed?.provider_token?.length,
          has_provider_refresh_token: !!parsed?.provider_refresh_token,
          keys: parsed ? Object.keys(parsed) : [],
        });

        // We still need a user id to store server-side; if session is missing, we can't.
        if (parsed?.provider_token && session?.user?.id) {
          await captureAndStore({
            providerToken: parsed.provider_token,
            providerRefreshToken: parsed.provider_refresh_token ?? null,
            userId: session.user.id,
            source: 'localStorage+session.user',
          });
        }
      } catch (e) {
        console.error('[GoogleTokenCapture] Initial capture fallback failed:', e);
      }
    })();

    return () => {
      console.log('[GoogleTokenCapture] Cleaning up auth listener');
      subscription.unsubscribe();
    };
  }, []);
}
