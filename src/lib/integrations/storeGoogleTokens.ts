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

/**
 * Stores Google OAuth tokens from a Supabase session.
 * This should be called immediately after OAuth redirect because
 * provider_token is only available in the session right after OAuth.
 */
export async function storeGoogleTokensFromSession(session: Session): Promise<StoreTokensResult> {
  // CRITICAL: Log immediately at function entry
  console.log('=== [storeGoogleTokens] FUNCTION CALLED ===');
  console.log('[storeGoogleTokens] Session user:', session.user?.email);
  console.log('[storeGoogleTokens] provider_token exists:', !!session.provider_token);
  console.log('[storeGoogleTokens] provider_refresh_token exists:', !!session.provider_refresh_token);
  
  const userId = session.user?.id;
  const userEmail = session.user?.email;

  if (!userId) {
    console.error('[storeGoogleTokens] No user ID in session');
    return { success: false, error: 'No user ID in session' };
  }

  if (!session.provider_token) {
    console.log('[storeGoogleTokens] No provider_token in session - nothing to store');
    return { success: false, error: 'No provider token available' };
  }

  try {
    // Step 1: Store the new access token
    console.log('[storeGoogleTokens] Step 1: Storing access token via RPC...');
    const { data: accessTokenSecretId, error: accessTokenError } = await supabase.rpc(
      'store_integration_token',
      {
        p_provider: 'google',
        p_token_type: 'access_token',
        p_token_value: session.provider_token,
        p_user_id: userId,
      }
    );

    if (accessTokenError) {
      console.error('[storeGoogleTokens] RPC store_integration_token failed:', accessTokenError);
      return { success: false, error: accessTokenError.message };
    }

    console.log('[storeGoogleTokens] ✅ Access token stored, secret ID:', accessTokenSecretId);

    // Step 2: Handle refresh token - only store if we have a NEW one
    let refreshTokenSecretId: string | null = null;
    
    if (session.provider_refresh_token) {
      // We have a new refresh token - store it
      console.log('[storeGoogleTokens] Step 2: Storing NEW refresh token via RPC...');
      const { data: newRefreshTokenId, error: refreshTokenError } = await supabase.rpc(
        'store_integration_token',
        {
          p_provider: 'google',
          p_token_type: 'refresh_token',
          p_token_value: session.provider_refresh_token,
          p_user_id: userId,
        }
      );

      if (refreshTokenError) {
        console.error('[storeGoogleTokens] Failed to store refresh token:', refreshTokenError);
        // Continue anyway - access token was stored
      } else {
        refreshTokenSecretId = newRefreshTokenId;
        console.log('[storeGoogleTokens] ✅ Refresh token stored, secret ID:', refreshTokenSecretId);
      }
    } else {
      // No new refresh token - check if we have an existing one in the database
      console.log('[storeGoogleTokens] Step 2: No new refresh token, checking for existing one...');
      const { data: existingIntegration, error: fetchError } = await supabase
        .from('user_integrations')
        .select('refresh_token_secret_id')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle();

      if (fetchError) {
        console.error('[storeGoogleTokens] Error fetching existing integration:', fetchError);
      } else if (existingIntegration?.refresh_token_secret_id) {
        refreshTokenSecretId = existingIntegration.refresh_token_secret_id;
        console.log('[storeGoogleTokens] ✅ Found existing refresh token, keeping ID:', refreshTokenSecretId);
      } else {
        console.log('[storeGoogleTokens] ⚠️ No existing refresh token found - user may need to re-authorize');
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
      refresh_token_secret_id: refreshTokenSecretId, // Will be existing ID or new ID or null
      token_expires_at: expiresAt,
      scopes: GOOGLE_SCOPES,
      updated_at: new Date().toISOString(),
    };
    
    console.log('[storeGoogleTokens] Step 3: Upserting user_integrations...');
    console.log('[storeGoogleTokens] Upsert data:', {
      ...upsertData,
      access_token_secret_id: upsertData.access_token_secret_id ? 'SET' : 'NULL',
      refresh_token_secret_id: upsertData.refresh_token_secret_id ? 'SET' : 'NULL',
    });

    const { error: upsertError } = await supabase
      .from('user_integrations')
      .upsert(upsertData, { 
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      console.error('[storeGoogleTokens] Upsert failed:', upsertError);
      return { success: false, error: upsertError.message };
    }

    console.log('[storeGoogleTokens] ✅✅✅ Integration stored successfully!');
    
    // Dispatch event to notify IntegrationsContent to refresh
    window.dispatchEvent(new CustomEvent('google-integration-connected'));
    console.log('[storeGoogleTokens] Dispatched google-integration-connected event');
    
    return { success: true, userEmail };
  } catch (error) {
    console.error('[storeGoogleTokens] Unexpected error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to store tokens' 
    };
  }
}
