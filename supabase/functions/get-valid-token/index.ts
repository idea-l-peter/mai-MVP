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
      
      if (!integration.refresh_token_secret_id) {
        throw new Error('Token expired and no refresh token available');
      }

      // Get refresh token from vault
      const { data: refreshToken, error: refreshTokenError } = await supabase
        .rpc('get_integration_token', {
          p_user_id: user_id,
          p_secret_id: integration.refresh_token_secret_id,
        });

      if (refreshTokenError || !refreshToken) {
        console.error('Error getting refresh token:', refreshTokenError);
        throw new Error('Failed to retrieve refresh token');
      }

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

      // Store new access token in vault
      const { data: newAccessTokenSecretId, error: storeAccessError } = await supabase
        .rpc('store_integration_token', {
          p_user_id: user_id,
          p_provider: provider,
          p_token_type: 'access_token',
          p_token_value: access_token,
        });

      if (storeAccessError) {
        console.error('Error storing new access token:', storeAccessError);
        throw new Error('Failed to store new access token');
      }

      // If Google returned a new refresh token, store it
      let newRefreshTokenSecretId = integration.refresh_token_secret_id;
      if (new_refresh_token) {
        const { data, error: storeRefreshError } = await supabase
          .rpc('store_integration_token', {
            p_user_id: user_id,
            p_provider: provider,
            p_token_type: 'refresh_token',
            p_token_value: new_refresh_token,
          });

        if (!storeRefreshError) {
          newRefreshTokenSecretId = data;
        }
      }

      // Update integration record
      await supabase
        .from('user_integrations')
        .update({
          access_token_secret_id: newAccessTokenSecretId,
          refresh_token_secret_id: newRefreshTokenSecretId,
          token_expires_at: new_token_expires_at,
        })
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

    // Token is still valid, retrieve from vault
    const { data: accessToken, error: accessTokenError } = await supabase
      .rpc('get_integration_token', {
        p_user_id: user_id,
        p_secret_id: integration.access_token_secret_id,
      });

    if (accessTokenError || !accessToken) {
      console.error('Error getting access token:', accessTokenError);
      throw new Error('Failed to retrieve access token');
    }

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
