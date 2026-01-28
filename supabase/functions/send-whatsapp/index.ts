import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[Send WhatsApp] No auth header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData?.user) {
      console.log('[Send WhatsApp] Auth failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.user.id;
    console.log('[Send WhatsApp] Authenticated user:', userId);

    // Read WhatsApp token from environment
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    
    // Debug: Log first 20 chars of token
    if (WHATSAPP_ACCESS_TOKEN) {
      console.log('[Send WhatsApp] Token first 20 chars:', WHATSAPP_ACCESS_TOKEN.substring(0, 20));
      console.log('[Send WhatsApp] Token length:', WHATSAPP_ACCESS_TOKEN.length);
    } else {
      console.log('[Send WhatsApp] ERROR: WHATSAPP_ACCESS_TOKEN is not set!');
      return new Response(
        JSON.stringify({ error: 'WhatsApp token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const phoneNumber = body.to?.replace(/[^\d]/g, '');
    
    if (!phoneNumber || phoneNumber.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Send WhatsApp] Sending to phone:', phoneNumber);

    // Build the exact payload that works via curl
    const whatsappUrl = 'https://graph.facebook.com/v22.0/959289807270027/messages';
    
    let whatsappPayload: Record<string, unknown>;
    let messageContent: string;

    if (body.type === 'text' && body.message) {
      // Text message (requires 24hr window)
      whatsappPayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: body.message.substring(0, 4096)
        }
      };
      messageContent = body.message;
    } else {
      // Default: hello_world template (works anytime)
      whatsappPayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: 'hello_world',
          language: {
            code: 'en_US'
          }
        }
      };
      messageContent = '[TEMPLATE] hello_world';
    }

    console.log('[Send WhatsApp] Request URL:', whatsappUrl);
    console.log('[Send WhatsApp] Payload:', JSON.stringify(whatsappPayload));

    // Make the request to Meta API
    const whatsappResponse = await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(whatsappPayload)
    });

    const responseText = await whatsappResponse.text();
    console.log('[Send WhatsApp] Response status:', whatsappResponse.status);
    console.log('[Send WhatsApp] Response body:', responseText);

    let whatsappResult;
    try {
      whatsappResult = JSON.parse(responseText);
    } catch {
      whatsappResult = { raw: responseText };
    }

    if (!whatsappResponse.ok) {
      return new Response(
        JSON.stringify({ 
          error: 'WhatsApp API error',
          status: whatsappResponse.status,
          details: whatsappResult
        }),
        { status: whatsappResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store message in database
    const messageId = whatsappResult.messages?.[0]?.id;
    
    await supabase.from('whatsapp_messages').insert({
      user_id: userId,
      phone_number: phoneNumber,
      message_id: messageId,
      direction: 'outbound',
      content: messageContent,
      message_type: body.type === 'text' ? 'text' : 'template',
      status: 'sent',
      metadata: { whatsapp_response: whatsappResult }
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message_id: messageId,
        status: 'sent'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Send WhatsApp] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
