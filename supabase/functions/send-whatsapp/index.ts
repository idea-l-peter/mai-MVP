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
    console.log('[Send WhatsApp] Request received, method:', req.method);
    
    // Try to get user from auth header (optional - for tracking purposes)
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } }
        });
        const token = authHeader.replace('Bearer ', '');
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        
        if (!userError && userData?.user) {
          userId = userData.user.id;
          console.log('[Send WhatsApp] Authenticated user:', userId);
        } else {
          console.log('[Send WhatsApp] Auth optional - continuing without user:', userError?.message);
        }
      } catch (authErr) {
        console.log('[Send WhatsApp] Auth check failed, continuing anyway:', authErr);
      }
    } else {
      console.log('[Send WhatsApp] No auth header - continuing as anonymous');
    }

    // Read WhatsApp token from environment - THIS is the real auth for Meta API
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    
    // Debug: Log token info
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

    // Store message in database (only if we have a user)
    const messageId = whatsappResult.messages?.[0]?.id;
    
    if (userId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
      console.log('[Send WhatsApp] Message stored in database');
    } else {
      console.log('[Send WhatsApp] Skipping database storage - no authenticated user');
    }

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
