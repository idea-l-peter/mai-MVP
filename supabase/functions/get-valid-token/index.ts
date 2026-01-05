import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt, decrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Token refresh buffer - refresh if expiring within 5 minutes
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, provider } = await req.json();
    
    console.log(`Getting valid token for provider: ${provider}, user: ${user_id}`);

    if (!user_id || !provider) {
      throw new Error('Missing required parameters: user_id, provider');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // Get the integration record
    const { data: integration, error: fetchError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', user_id)
      .eq('provider', provider)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching integration:', fetchError);
      throw new Error('Failed to fetch integration');
    }

    if (!integration) {
      return new Response(
        JSON.stringify({ connected: false, error: 'Integration not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token needs refresh (expires within 5 minutes)
    const expiresAt = new Date(integration.token_expires_at).getTime();
    const now = Date.now();
    const needsRefresh = expiresAt - now < REFRESH_BUFFER_MS;

    console.log(`Token expires at: ${integration.token_expires_at}, needs refresh: ${needsRefresh}`);

    if (needsRefresh) {
      console.log('Token expiring soon, attempting refresh...');
      
      // Get encrypted refresh token
      const { data: refreshTokenRow, error: refreshTokenError } = await supabase
        .from('encrypted_integration_tokens')
        .select('encrypted_value')
        .eq('user_id', user_id)
        .eq('provider', provider)
        .eq('token_type', 'refresh_token')
        .maybeSingle();

      if (refreshTokenError || !refreshTokenRow) {
        console.error('Error getting refresh token:', refreshTokenError);
        throw new Error('Token expired and no refresh token available');
      }

      // Decrypt refresh token
      const refreshToken = await decrypt(refreshTokenRow.encrypted_value);

      // Request new access token from Google
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error('Google refresh error:', tokenData);
        throw new Error(`Token refresh failed: ${tokenData.error_description || tokenData.error}`);
      }

      console.log('Successfully refreshed access token');

      const { access_token, expires_in, refresh_token: new_refresh_token } = tokenData;
      const new_token_expires_at = new Date(Date.now() + (expires_in * 1000)).toISOString();

      // Encrypt and store new access token
      const encryptedAccessToken = await encrypt(access_token);
      await supabase
        .from('encrypted_integration_tokens')
        .upsert({
          user_id,
          provider,
          token_type: 'access_token',
          encrypted_value: encryptedAccessToken,
        }, { onConflict: 'user_id,provider,token_type' });

      // If Google returned a new refresh token, encrypt and store it
      if (new_refresh_token) {
        const encryptedRefreshToken = await encrypt(new_refresh_token);
        await supabase
          .from('encrypted_integration_tokens')
          .upsert({
            user_id,
            provider,
            token_type: 'refresh_token',
            encrypted_value: encryptedRefreshToken,
          }, { onConflict: 'user_id,provider,token_type' });
      }

      // Update integration record with new expiration
      await supabase
        .from('user_integrations')
        .update({ token_expires_at: new_token_expires_at })
        .eq('user_id', user_id)
        .eq('provider', provider);

      return new Response(
        JSON.stringify({
          connected: true,
          access_token,
          expires_at: new_token_expires_at,
          provider_email: integration.provider_email,
          refreshed: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Token is still valid, retrieve and decrypt
    const { data: accessTokenRow, error: accessTokenError } = await supabase
      .from('encrypted_integration_tokens')
      .select('encrypted_value')
      .eq('user_id', user_id)
      .eq('provider', provider)
      .eq('token_type', 'access_token')
      .maybeSingle();

    if (accessTokenError || !accessTokenRow) {
      console.error('Error getting access token:', accessTokenError);
      throw new Error('Failed to retrieve access token');
    }

    const accessToken = await decrypt(accessTokenRow.encrypted_value);

    console.log('Returning valid access token');

    return new Response(
      JSON.stringify({
        connected: true,
        access_token: accessToken,
        expires_at: integration.token_expires_at,
        provider_email: integration.provider_email,
        refreshed: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Get valid token error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ connected: false, error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
