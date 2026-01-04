import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Google OAuth flow');
    
    const { redirect_uri, scopes, state } = await req.json();
    
    if (!redirect_uri) {
      throw new Error('redirect_uri is required');
    }

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    
    if (!GOOGLE_CLIENT_ID) {
      console.error('GOOGLE_CLIENT_ID is not configured');
      throw new Error('Google OAuth is not configured. Please set GOOGLE_CLIENT_ID secret.');
    }

    console.log('Building OAuth URL with client ID:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');
    console.log('Redirect URI:', redirect_uri);
    console.log('Scopes:', scopes);
    console.log('State:', state);

    // Build Google OAuth URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes?.join(' ') || 'openid email profile');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    
    if (state) {
      authUrl.searchParams.set('state', state);
    }

    const oauthUrl = authUrl.toString();
    console.log('Generated OAuth URL successfully');

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
    console.error('Error in google-oauth function:', errorMessage);
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
