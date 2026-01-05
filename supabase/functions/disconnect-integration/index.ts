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

    // Delete encrypted tokens
    const { error: deleteTokensError } = await supabase
      .from('encrypted_integration_tokens')
      .delete()
      .eq('user_id', user_id)
      .eq('provider', provider);

    if (deleteTokensError) {
      console.error('Error deleting tokens:', deleteTokensError);
      // Continue anyway, tokens might not exist
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
