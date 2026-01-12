import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MONDAY_CLIENT_ID = Deno.env.get('MONDAY_CLIENT_ID')!;
const APP_BASE_URL = Deno.env.get('APP_BASE_URL');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('monday-oauth function invoked');
    console.log('Request method:', req.method);
    
    // Validate JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing or invalid authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Create a Supabase client with the user's auth token to validate JWT
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const jwtToken = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(jwtToken);

    if (authError || !claimsData?.claims) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Extract user_id from authenticated JWT claims
    const user_id = claimsData.claims.sub as string;
    console.log('Authenticated user:', user_id);
    
    const body = await req.json();
    console.log('Request body received:', JSON.stringify(body));
    
    const { app_redirect_uri } = body;

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
