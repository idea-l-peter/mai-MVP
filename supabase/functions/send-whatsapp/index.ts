import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');

interface TextMessageRequest {
  type: 'text';
  to: string;
  message: string;
}

interface TemplateMessageRequest {
  type: 'template';
  to: string;
  template_name?: string;
  template_language?: string;
  template_components?: any[];
}

interface TestMessageRequest {
  type: 'test';
  to: string;
}

type SendMessageRequest = TextMessageRequest | TemplateMessageRequest | TestMessageRequest;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    
    console.log('[Send WhatsApp] Auth check:', { hasUser: !!claimsData?.user, error: claimsError?.message });
    
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;

    // Validate required environment variables
    if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
      console.error('[Send WhatsApp] Missing configuration');
      return new Response(
        JSON.stringify({ error: 'WhatsApp integration not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: SendMessageRequest = await req.json();
    
    // Validate phone number format (should be in international format without + or spaces)
    const phoneNumber = body.to.replace(/[^\d]/g, '');
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Send WhatsApp] Sending message to:', phoneNumber);

    // Build WhatsApp API payload
    let whatsappPayload: any;
    let messageContent: string;
    
    if (body.type === 'test') {
      // Use hello_world template for testing - this works outside 24hr window
      console.log('[Send WhatsApp] Using hello_world template for test message');
      whatsappPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
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
    } else if (body.type === 'text') {
      if (!body.message || body.message.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Message content is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Text messages only work within 24hr conversation window
      console.log('[Send WhatsApp] Sending text message (requires active conversation window)');
      whatsappPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: body.message.substring(0, 4096) // WhatsApp message limit
        }
      };
      messageContent = body.message;
    } else if (body.type === 'template') {
      const templateName = body.template_name || 'hello_world';
      const templateLang = body.template_language || 'en_US';
      
      console.log(`[Send WhatsApp] Using template: ${templateName}`);
      whatsappPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: templateLang
          },
          components: body.template_components || []
        }
      };
      messageContent = `[TEMPLATE] ${templateName}`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid message type. Must be "text", "template", or "test"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send message via WhatsApp Cloud API
    const whatsappUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const whatsappResponse = await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(whatsappPayload)
    });

    const whatsappResult = await whatsappResponse.json();
    
    if (!whatsappResponse.ok) {
      console.error('[Send WhatsApp] API error:', whatsappResult);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send WhatsApp message',
          details: whatsappResult.error?.message || 'Unknown error'
        }),
        { status: whatsappResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Send WhatsApp] Message sent successfully:', whatsappResult);

    // Store outbound message in database
    const messageId = whatsappResult.messages?.[0]?.id;
    
    const { error: insertError } = await supabase
      .from('whatsapp_messages')
      .insert({
        user_id: userId,
        phone_number: phoneNumber,
        message_id: messageId,
        direction: 'outbound',
        content: messageContent,
        message_type: body.type === 'test' ? 'template' : body.type,
        status: 'sent',
        metadata: {
          whatsapp_response: whatsappResult,
          template_name: body.type === 'template' ? (body.template_name || 'hello_world') : (body.type === 'test' ? 'hello_world' : undefined)
        }
      });

    if (insertError) {
      console.error('[Send WhatsApp] Error storing message:', insertError);
      // Don't fail the request - message was sent successfully
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
