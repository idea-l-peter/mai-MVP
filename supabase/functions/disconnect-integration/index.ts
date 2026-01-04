import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, provider } = await req.json();
    
    console.log(`Disconnecting integration for provider: ${provider}, user: ${user_id}`);

    if (!user_id || !provider) {
      throw new Error('Missing required parameters: user_id, provider');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // Get the integration record first
    const { data: integration, error: fetchError } = await supabase
      .from('user_integrations')
      .select('access_token_secret_id, refresh_token_secret_id')
      .eq('user_id', user_id)
      .eq('provider', provider)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching integration:', fetchError);
      throw new Error('Failed to fetch integration');
    }

    if (!integration) {
      console.log('Integration not found, nothing to disconnect');
      return new Response(
        JSON.stringify({ success: true, message: 'Integration not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete tokens from vault
    if (integration.access_token_secret_id) {
      await supabase.rpc('delete_integration_token', {
        p_user_id: user_id,
        p_secret_id: integration.access_token_secret_id,
      });
    }

    if (integration.refresh_token_secret_id) {
      await supabase.rpc('delete_integration_token', {
        p_user_id: user_id,
        p_secret_id: integration.refresh_token_secret_id,
      });
    }

    // Delete the integration record
    const { error: deleteError } = await supabase
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
