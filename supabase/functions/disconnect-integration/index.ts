import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authenticated user from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's auth context to verify identity
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get provider from request body (user_id is now derived from verified auth)
    const { provider } = await req.json();
    const user_id = user.id; // Use verified user ID, not from request body
    
    console.log(`Disconnecting integration for provider: ${provider}, user: ${user_id}`);

    if (!provider) {
      throw new Error('Missing required parameter: provider');
    }

    // Use service role for deletion operations (RLS would also work here, but service role ensures cleanup)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // Delete encrypted tokens
    const { error: deleteTokensError } = await supabaseAdmin
      .from('encrypted_integration_tokens')
      .delete()
      .eq('user_id', user_id)
      .eq('provider', provider);

    if (deleteTokensError) {
      console.error('Error deleting tokens:', deleteTokensError);
      // Continue anyway, tokens might not exist
    }

    // Delete the integration record
    const { error: deleteError } = await supabaseAdmin
      .from('user_integrations')
      .delete()
      .eq('user_id', user_id)
      .eq('provider', provider);

    if (deleteError) {
      console.error('Error deleting integration:', deleteError);
      throw new Error('Failed to delete integration');
    }

    console.log(`Successfully disconnected ${provider} integration`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Disconnect integration error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
