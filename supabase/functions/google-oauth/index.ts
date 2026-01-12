import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[GoogleOAuth] Starting Google OAuth flow');
    
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[GoogleOAuth] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Create auth client to validate JWT
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    
    if (authError || !claimsData?.claims) {
      console.error('[GoogleOAuth] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Use authenticated user's ID from JWT - ignore any user_id from request body
    const user_id = claimsData.claims.sub as string;
    console.log('[GoogleOAuth] Authenticated user:', user_id);
    
    const { scopes, app_redirect_uri, provider } = await req.json();

    if (!app_redirect_uri) {
      throw new Error('app_redirect_uri is required');
    }

    if (!provider) {
      throw new Error('provider is required');
    }

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    
    if (!GOOGLE_CLIENT_ID) {
      console.error('GOOGLE_CLIENT_ID is not configured');
      throw new Error('Google OAuth is not configured. Please set GOOGLE_CLIENT_ID secret.');
    }

    // The redirect_uri for Google must be our callback edge function
    const callbackUrl = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;
    
    // Encode state with user_id, provider, and app redirect URI
    const stateData = {
      user_id,
      provider,
      app_redirect_uri,
    };
    const state = btoa(JSON.stringify(stateData));

    console.log('[GoogleOAuth] Building OAuth URL with client ID:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');
    console.log('[GoogleOAuth] Callback URL (redirect_uri):', callbackUrl);
    console.log('[GoogleOAuth] App redirect URI:', app_redirect_uri);
    console.log('[GoogleOAuth] Scopes:', scopes);

    // Build Google OAuth URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

    // Ensure required scopes are always requested for certain providers
    const requestedScopes: string[] = Array.isArray(scopes) ? scopes : [];
    const requiredScopesByProvider: Record<string, string[]> = {
      gmail: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.settings.basic',
      ],
    };

    const requiredScopes = requiredScopesByProvider[provider] || [];
    const baseScopes = requestedScopes.length ? requestedScopes : ['openid', 'email', 'profile'];
    const finalScopes = Array.from(new Set([...baseScopes, ...requiredScopes]));

    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', finalScopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    const oauthUrl = authUrl.toString();
    console.log('[GoogleOAuth] Generated OAuth URL successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        oauth_url: oauthUrl 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to initiate OAuth';
    console.error('[GoogleOAuth] Error:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});