import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const MONDAY_CLIENT_ID = '9c6239a90707ff2f471aef766cc7cf6e';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Monday.com OAuth flow');
    
    const { user_id, app_redirect_uri } = await req.json();
    
    if (!user_id) {
      throw new Error('user_id is required');
    }

    if (!app_redirect_uri) {
      throw new Error('app_redirect_uri is required');
    }

    // The redirect_uri for Monday must be our callback edge function
    const callbackUrl = `${SUPABASE_URL}/functions/v1/monday-oauth-callback`;
    
    // Encode state with user_id, provider, and app redirect URI
    const stateData = {
      user_id,
      provider: 'monday',
      app_redirect_uri,
    };
    const state = btoa(JSON.stringify(stateData));

    console.log('Callback URL (redirect_uri):', callbackUrl);
    console.log('App redirect URI:', app_redirect_uri);

    // Build Monday.com OAuth URL
    const authUrl = new URL('https://auth.monday.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', MONDAY_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('state', state);

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
    console.error('Error in monday-oauth function:', errorMessage);
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
