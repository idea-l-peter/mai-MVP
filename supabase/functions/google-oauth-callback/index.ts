import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, redirect_uri, user_id, provider } = await req.json();
    
    console.log(`Processing OAuth callback for provider: ${provider}, user: ${user_id}`);

    if (!code || !redirect_uri || !user_id || !provider) {
      throw new Error('Missing required parameters: code, redirect_uri, user_id, provider');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Google token error:', tokenData);
      throw new Error(`Google OAuth error: ${tokenData.error_description || tokenData.error}`);
    }

    console.log('Successfully obtained tokens from Google');

    const { access_token, refresh_token, expires_in, scope } = tokenData;
    
    // Calculate token expiration time
    const token_expires_at = new Date(Date.now() + (expires_in * 1000)).toISOString();

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    
    console.log(`Got user info for: ${userInfo.email}`);

    // Create service role client to store tokens in vault
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // Store access token in vault
    const { data: accessTokenSecretId, error: accessTokenError } = await supabase
      .rpc('store_integration_token', {
        p_user_id: user_id,
        p_provider: provider,
        p_token_type: 'access_token',
        p_token_value: access_token,
      });

    if (accessTokenError) {
      console.error('Error storing access token:', accessTokenError);
      throw new Error('Failed to store access token');
    }

    // Store refresh token in vault (if provided)
    let refreshTokenSecretId = null;
    if (refresh_token) {
      const { data, error: refreshTokenError } = await supabase
        .rpc('store_integration_token', {
          p_user_id: user_id,
          p_provider: provider,
          p_token_type: 'refresh_token',
          p_token_value: refresh_token,
        });

      if (refreshTokenError) {
        console.error('Error storing refresh token:', refreshTokenError);
        throw new Error('Failed to store refresh token');
      }
      refreshTokenSecretId = data;
    }

    // Upsert integration record
    const { error: upsertError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id,
        provider,
        access_token_secret_id: accessTokenSecretId,
        refresh_token_secret_id: refreshTokenSecretId,
        token_expires_at,
        scopes: scope ? scope.split(' ') : [],
        provider_user_id: userInfo.id,
        provider_email: userInfo.email,
      }, {
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      console.error('Error upserting integration:', upsertError);
      throw new Error('Failed to save integration');
    }

    console.log(`Successfully saved ${provider} integration for user ${user_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        provider_email: userInfo.email,
        expires_at: token_expires_at,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('OAuth callback error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
