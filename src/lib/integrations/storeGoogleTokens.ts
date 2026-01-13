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
  console.log('[storeGoogleTokens] Starting token storage...');
  
  const userId = session.user?.id;
  const userEmail = session.user?.email;

  if (!userId) {
    console.error('[storeGoogleTokens] No user ID in session');
    return { success: false, error: 'No user ID in session' };
  }

  if (!session.provider_token) {
    console.log('[storeGoogleTokens] No provider_token in session');
    return { success: false, error: 'No provider token available' };
  }

  try {
    // Log what we're about to send
    console.log('[storeGoogleTokens] Storing access token with params:', {
      p_provider: 'google',
      p_token_type: 'access_token',
      p_token_value: session.provider_token ? `${session.provider_token.substring(0, 20)}...` : 'MISSING',
      p_user_id: userId,
    });

    // Store the access token using RPC
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
      console.error('[storeGoogleTokens] RPC store_integration_token failed:', {
        error: accessTokenError,
        code: accessTokenError.code,
        message: accessTokenError.message,
        details: accessTokenError.details,
        hint: accessTokenError.hint,
      });
      return { success: false, error: accessTokenError.message };
    }

    console.log('[storeGoogleTokens] Access token stored successfully, secret ID:', accessTokenData);

    // Store refresh token if available
    let refreshTokenId = null;
    if (session.provider_refresh_token) {
      console.log('[storeGoogleTokens] Storing refresh token...');
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
        console.error('[storeGoogleTokens] Failed to store refresh token:', {
          error: refreshTokenError,
          code: refreshTokenError.code,
          message: refreshTokenError.message,
        });
      } else {
        refreshTokenId = refreshTokenData;
        console.log('[storeGoogleTokens] Refresh token stored, secret ID:', refreshTokenId);
      }
    } else {
      console.log('[storeGoogleTokens] No refresh token in session');
    }

    // Calculate token expiry (typically 1 hour from now for Google)
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    // Log the upsert data
    const upsertData = {
      user_id: userId,
      provider: 'google',
      provider_email: userEmail,
      access_token_secret_id: accessTokenData,
      refresh_token_secret_id: refreshTokenId,
      token_expires_at: expiresAt,
      scopes: GOOGLE_SCOPES,
      updated_at: new Date().toISOString(),
    };
    console.log('[storeGoogleTokens] Upserting user_integrations with:', upsertData);

    // Upsert the user_integrations record
    const { error: upsertError } = await supabase
      .from('user_integrations')
      .upsert(upsertData, { 
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      console.error('[storeGoogleTokens] Upsert failed:', {
        error: upsertError,
        code: upsertError.code,
        message: upsertError.message,
        details: upsertError.details,
        hint: upsertError.hint,
      });
      return { success: false, error: upsertError.message };
    }

    console.log('[storeGoogleTokens] ✅ Integration stored successfully!');
    
    // Dispatch a custom event so IntegrationsContent can refresh
    window.dispatchEvent(new CustomEvent('google-integration-connected'));
    console.log('[storeGoogleTokens] Dispatched google-integration-connected event');
    
    return { success: true, userEmail };
  } catch (error) {
    console.error('[storeGoogleTokens] Token storage error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to store tokens' 
    };
  }
}
