import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WHATSAPP_VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN');

// Create HMAC signature for webhook verification
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    
    const expectedSignature = "sha256=" + Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return signature === expectedSignature;
  } catch (error) {
    console.error('[WhatsApp Webhook] Signature verification error:', error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // GET request: Webhook verification from Meta
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      
      console.log('[WhatsApp Webhook] Verification request:', { mode, token: token?.substring(0, 10) + '...' });
      
      if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
        console.log('[WhatsApp Webhook] Webhook verified successfully');
        return new Response(challenge, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        });
      } else {
        console.error('[WhatsApp Webhook] Verification failed - token mismatch');
        return new Response('Forbidden', { 
          status: 403, 
          headers: corsHeaders 
        });
      }
    }
    
    // POST request: Incoming message webhook
    if (req.method === 'POST') {
      const body = await req.text();
      const payload = JSON.parse(body);
      
      console.log('[WhatsApp Webhook] Received webhook:', JSON.stringify(payload, null, 2));
      
      // Verify webhook signature (optional but recommended)
      const signature = req.headers.get('x-hub-signature-256');
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
      
      if (signature && appSecret) {
        const isValid = await verifyWebhookSignature(body, signature, appSecret);
        if (!isValid) {
          console.error('[WhatsApp Webhook] Invalid signature');
          return new Response(JSON.stringify({ error: 'Invalid signature' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Initialize Supabase client with service role
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      });
      
      // Process incoming messages
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      if (value?.messages) {
        for (const message of value.messages) {
          console.log('[WhatsApp Webhook] Processing message:', message.id);
          
          const phoneNumber = message.from;
          const messageId = message.id;
          const messageType = message.type;
          let content = '';
          
          // Extract content based on message type
          if (messageType === 'text') {
            content = message.text?.body || '';
          } else if (messageType === 'image' || messageType === 'video' || messageType === 'audio' || messageType === 'document') {
            content = `[${messageType.toUpperCase()}] ${message[messageType]?.caption || ''}`;
          } else if (messageType === 'location') {
            content = `[LOCATION] Lat: ${message.location?.latitude}, Lng: ${message.location?.longitude}`;
          } else if (messageType === 'contacts') {
            content = `[CONTACTS] ${message.contacts?.length || 0} contact(s) shared`;
          }
          
          // Find user by phone number in contacts or create a placeholder
          // For now, we'll store with a null user_id and the phone number
          // The user mapping can be enhanced later
          const { data: contactProfile, error: contactError } = await supabase
            .from('contact_profiles')
            .select('user_id')
            .ilike('email', `%${phoneNumber.slice(-10)}%`)
            .limit(1)
            .single();
          
          // Store the message
          const { error: insertError } = await supabase
            .from('whatsapp_messages')
            .insert({
              user_id: contactProfile?.user_id || '00000000-0000-0000-0000-000000000000', // Placeholder if no user found
              phone_number: phoneNumber,
              message_id: messageId,
              direction: 'inbound',
              content: content,
              message_type: messageType,
              status: 'delivered',
              metadata: {
                timestamp: message.timestamp,
                context: message.context,
                raw: message
              }
            });
          
          if (insertError) {
            console.error('[WhatsApp Webhook] Error storing message:', insertError);
          } else {
            console.log('[WhatsApp Webhook] Message stored successfully:', messageId);
          }
        }
      }
      
      // Process status updates
      if (value?.statuses) {
        for (const status of value.statuses) {
          console.log('[WhatsApp Webhook] Processing status update:', status.id, status.status);
          
          const { error: updateError } = await supabase
            .from('whatsapp_messages')
            .update({ 
              status: status.status
            })
            .eq('message_id', status.id);
          if (updateError) {
            console.error('[WhatsApp Webhook] Error updating status:', updateError);
          }
        }
      }
      
      // Always return 200 OK to acknowledge receipt
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
    
  } catch (error: unknown) {
    console.error('[WhatsApp Webhook] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Still return 200 to prevent Meta from retrying
    return new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
