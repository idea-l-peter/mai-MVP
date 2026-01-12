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
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const jwtToken = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(jwtToken);

    if (authError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract user_id from JWT - NEVER trust request body
    const user_id = claimsData.claims.sub as string;
    
    const { provider } = await req.json();
    
    console.log(`Refreshing token for provider: ${provider}, user: ${user_id}`);

    if (!provider) {
      throw new Error('Missing required parameter: provider');
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

    if (fetchError || !integration) {
      console.error('Error fetching integration:', fetchError);
      throw new Error('Integration not found');
    }

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
      throw new Error('No refresh token available for this integration');
    }

    // Decrypt refresh token
    const refreshToken = await decrypt(refreshTokenRow.encrypted_value);

    console.log('Retrieved and decrypted refresh token, requesting new access token...');

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
      throw new Error(`Google refresh error: ${tokenData.error_description || tokenData.error}`);
    }

    console.log('Successfully refreshed access token');

    const { access_token, expires_in, refresh_token: new_refresh_token } = tokenData;
    const token_expires_at = new Date(Date.now() + (expires_in * 1000)).toISOString();

    // Encrypt and store new access token
    const encryptedAccessToken = await encrypt(access_token);
    const { error: storeAccessError } = await supabase
      .from('encrypted_integration_tokens')
      .upsert({
        user_id,
        provider,
        token_type: 'access_token',
        encrypted_value: encryptedAccessToken,
      }, { onConflict: 'user_id,provider,token_type' });

    if (storeAccessError) {
      console.error('Error storing new access token:', storeAccessError);
      throw new Error('Failed to store new access token');
    }

    // If Google returned a new refresh token, encrypt and store it
    if (new_refresh_token) {
      const encryptedRefreshToken = await encrypt(new_refresh_token);
      const { error: storeRefreshError } = await supabase
        .from('encrypted_integration_tokens')
        .upsert({
          user_id,
          provider,
          token_type: 'refresh_token',
          encrypted_value: encryptedRefreshToken,
        }, { onConflict: 'user_id,provider,token_type' });

      if (storeRefreshError) {
        console.error('Error storing new refresh token:', storeRefreshError);
      }
    }

    // Update integration record with new expiration
    const { error: updateError } = await supabase
      .from('user_integrations')
      .update({ token_expires_at })
      .eq('user_id', user_id)
      .eq('provider', provider);

    if (updateError) {
      console.error('Error updating integration:', updateError);
      throw new Error('Failed to update integration');
    }

    console.log(`Successfully refreshed and stored tokens for ${provider}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        expires_at: token_expires_at,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Token refresh error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
