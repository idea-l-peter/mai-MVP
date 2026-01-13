import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

interface StoreTokensResult {
  success: boolean;
  error?: string;
  userEmail?: string;
}

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, label: string): Promise<T> {
  const promise = Promise.resolve(promiseLike);

  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => {
      reject(new Error(`TIMEOUT:${label}`));
    }, ms);

    promise
      .then((v) => {
        window.clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        window.clearTimeout(id);
        reject(e);
      });
  });
}

/**
 * Stores Google OAuth tokens from a Supabase session.
 * This should be called immediately after OAuth redirect because
 * provider_token is only available in the session right after OAuth.
 */
export async function storeGoogleTokensFromSession(session: Session): Promise<StoreTokensResult> {
  // CRITICAL: Log immediately at function entry
  console.warn('=== [storeGoogleTokens] FUNCTION CALLED ===');
  console.warn('[storeGoogleTokens] Session user:', session.user?.email);
  console.warn('[storeGoogleTokens] provider_token exists:', !!session.provider_token);
  console.warn('[storeGoogleTokens] provider_refresh_token exists:', !!session.provider_refresh_token);

  const userId = session.user?.id;
  const userEmail = session.user?.email;

  if (!userId) {
    console.warn('[storeGoogleTokens] No user ID in session');
    return { success: false, error: 'No user ID in session' };
  }

  if (!session.provider_token) {
    console.warn('[storeGoogleTokens] No provider_token in session - nothing to store');
    return { success: false, error: 'No provider token available' };
  }

  const STEP_TIMEOUT_MS = 10_000;

  try {
    // Step 1: Store the new access token
    console.warn('[storeGoogleTokens] Step 1: BEFORE RPC store_integration_token (access_token)');
    const { data: accessTokenSecretId, error: accessTokenError } = await withTimeout(
      supabase.rpc('store_integration_token', {
        p_provider: 'google',
        p_token_type: 'access_token',
        p_token_value: session.provider_token,
        p_user_id: userId,
      }),
      STEP_TIMEOUT_MS,
      'rpc_store_access_token'
    );
    console.warn('[storeGoogleTokens] Step 1: AFTER RPC store_integration_token (access_token)');

    if (accessTokenError) {
      console.warn('[storeGoogleTokens] RPC store_integration_token failed:', accessTokenError);
      return { success: false, error: accessTokenError.message };
    }

    console.warn('[storeGoogleTokens] ✅ Access token stored, secret ID:', accessTokenSecretId);

    // Step 2: Handle refresh token - only store if we have a NEW one
    let refreshTokenSecretId: string | null = null;

    if (session.provider_refresh_token) {
      // We have a new refresh token - store it
      console.warn('[storeGoogleTokens] Step 2: BEFORE RPC store_integration_token (refresh_token)');
      const { data: newRefreshTokenId, error: refreshTokenError } = await withTimeout(
        supabase.rpc('store_integration_token', {
          p_provider: 'google',
          p_token_type: 'refresh_token',
          p_token_value: session.provider_refresh_token,
          p_user_id: userId,
        }),
        STEP_TIMEOUT_MS,
        'rpc_store_refresh_token'
      );
      console.warn('[storeGoogleTokens] Step 2: AFTER RPC store_integration_token (refresh_token)');

      if (refreshTokenError) {
        console.warn('[storeGoogleTokens] Failed to store refresh token:', refreshTokenError);
        // Continue anyway - access token was stored
      } else {
        refreshTokenSecretId = newRefreshTokenId;
        console.warn('[storeGoogleTokens] ✅ Refresh token stored, secret ID:', refreshTokenSecretId);
      }
    } else {
      // No new refresh token - check if we have an existing one in the database
      console.warn('[storeGoogleTokens] Step 2: No new refresh token, checking for existing one...');
      console.warn('[storeGoogleTokens] Step 2: BEFORE SELECT user_integrations (refresh_token_secret_id)');

      const { data: existingIntegration, error: fetchError } = await withTimeout(
        supabase
          .from('user_integrations')
          .select('refresh_token_secret_id')
          .eq('user_id', userId)
          .eq('provider', 'google')
          .maybeSingle(),
        STEP_TIMEOUT_MS,
        'select_existing_integration'
      );

      console.warn('[storeGoogleTokens] Step 2: AFTER SELECT user_integrations (refresh_token_secret_id)');

      if (fetchError) {
        console.warn('[storeGoogleTokens] Error fetching existing integration:', fetchError);
      } else if (existingIntegration?.refresh_token_secret_id) {
        refreshTokenSecretId = existingIntegration.refresh_token_secret_id;
        console.warn('[storeGoogleTokens] ✅ Found existing refresh token, keeping ID:', refreshTokenSecretId);
      } else {
        console.warn('[storeGoogleTokens] ⚠️ No existing refresh token found - user may need to re-authorize');
      }
    }

    // Step 3: Calculate token expiry (1 hour for Google access tokens)
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    // Step 4: Upsert the user_integrations record
    const upsertData = {
      user_id: userId,
      provider: 'google',
      provider_email: userEmail,
      access_token_secret_id: accessTokenSecretId,
      refresh_token_secret_id: refreshTokenSecretId, // existing ID, new ID, or null
      token_expires_at: expiresAt,
      scopes: GOOGLE_SCOPES,
      updated_at: new Date().toISOString(),
    };

    console.warn('[storeGoogleTokens] Step 3: BEFORE UPSERT user_integrations');
    console.warn('[storeGoogleTokens] Upsert data (redacted):', {
      ...upsertData,
      access_token_secret_id: upsertData.access_token_secret_id ? 'SET' : 'NULL',
      refresh_token_secret_id: upsertData.refresh_token_secret_id ? 'SET' : 'NULL',
    });

    const { error: upsertError } = await withTimeout(
      supabase.from('user_integrations').upsert(upsertData, { onConflict: 'user_id,provider' }),
      STEP_TIMEOUT_MS,
      'upsert_user_integrations'
    );

    console.warn('[storeGoogleTokens] Step 3: AFTER UPSERT user_integrations');

    if (upsertError) {
      console.warn('[storeGoogleTokens] Upsert failed:', upsertError);
      return { success: false, error: upsertError.message };
    }

    console.warn('[storeGoogleTokens] ✅✅✅ Integration stored successfully!');

    // Dispatch event to notify IntegrationsContent to refresh
    window.dispatchEvent(new CustomEvent('google-integration-connected'));
    console.warn('[storeGoogleTokens] Dispatched google-integration-connected event');

    return { success: true, userEmail };
  } catch (error) {
    console.warn('[storeGoogleTokens] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store tokens',
    };
  }
}
