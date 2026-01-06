import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt } from "../_shared/encryption.ts";

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_BASE_URL = Deno.env.get('APP_BASE_URL');

serve(async (req) => {
  try {
    const url = new URL(req.url);
    
    // This is a GET request from Google's redirect
    if (req.method === 'GET') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      
      console.log('Received OAuth callback from Google');
      console.log('Has code:', !!code);
      console.log('Has state:', !!state);
      console.log('Error from Google:', error);

      if (error) {
        console.error('Google OAuth error:', error);
        const errorRedirect = new URL(`${APP_BASE_URL}/integrations`);
        errorRedirect.searchParams.set('error', error);
        return Response.redirect(errorRedirect.toString(), 302);
      }

      if (!code || !state) {
        throw new Error('Missing code or state parameter');
      }

      // Decode state to get user_id, provider, and app redirect URI
      let stateData: { user_id: string; provider: string; app_redirect_uri: string };
      try {
        stateData = JSON.parse(atob(state));
        console.log('Decoded state:', stateData);
      } catch (e) {
        console.error('Failed to decode state:', e);
        throw new Error('Invalid state parameter');
      }

      const { user_id, provider, app_redirect_uri } = stateData;

      if (!user_id || !provider || !app_redirect_uri) {
        throw new Error('Invalid state: missing required fields');
      }

      // The redirect_uri used for token exchange must match what was sent to Google
      const callbackUrl = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;

      // Exchange authorization code for tokens
      console.log('Exchanging code for tokens...');
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        console.error('Google token error:', tokenData);
        const errorRedirect = new URL(app_redirect_uri);
        errorRedirect.searchParams.set('error', tokenData.error_description || tokenData.error);
        return Response.redirect(errorRedirect.toString(), 302);
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

      // Create service role client
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      });

      // Encrypt tokens using application-level encryption
      console.log('Encrypting tokens...');
      const encryptedAccessToken = await encrypt(access_token);
      const encryptedRefreshToken = refresh_token ? await encrypt(refresh_token) : null;

      // Store encrypted tokens
      console.log('Storing encrypted tokens...');
      
      // Upsert access token
      const { error: accessTokenError } = await supabase
        .from('encrypted_integration_tokens')
        .upsert({
          user_id,
          provider,
          token_type: 'access_token',
          encrypted_value: encryptedAccessToken,
        }, { onConflict: 'user_id,provider,token_type' });

      if (accessTokenError) {
        console.error('Error storing access token:', accessTokenError);
        throw new Error('Failed to store access token');
      }

      // Upsert refresh token if provided
      if (encryptedRefreshToken) {
        const { error: refreshTokenError } = await supabase
          .from('encrypted_integration_tokens')
          .upsert({
            user_id,
            provider,
            token_type: 'refresh_token',
            encrypted_value: encryptedRefreshToken,
          }, { onConflict: 'user_id,provider,token_type' });

        if (refreshTokenError) {
          console.error('Error storing refresh token:', refreshTokenError);
          throw new Error('Failed to store refresh token');
        }
      }

      // Upsert integration record (metadata only, no secret IDs)
      const { error: upsertError } = await supabase
        .from('user_integrations')
        .upsert({
          user_id,
          provider,
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

      // Redirect back to the app with success
      const successRedirect = new URL(app_redirect_uri);
      successRedirect.searchParams.set('connected', provider);
      successRedirect.searchParams.set('email', userInfo.email);
      
      return Response.redirect(successRedirect.toString(), 302);

    } else {
      // For any other method, return method not allowed
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: unknown) {
    console.error('OAuth callback error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Redirect back to app with error
    const errorRedirect = new URL(`${APP_BASE_URL}/integrations`);
    errorRedirect.searchParams.set('error', message);
    return Response.redirect(errorRedirect.toString(), 302);
  }
});
