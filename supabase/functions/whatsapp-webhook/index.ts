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

// Send a quick "thinking" message to the user
async function sendThinkingMessage(phoneNumber: string): Promise<void> {
  try {
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    if (!WHATSAPP_ACCESS_TOKEN) return;

    const whatsappUrl = 'https://graph.facebook.com/v22.0/959289807270027/messages';
    
    await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: '⏳ MAI is thinking...' }
      })
    });
  } catch (error) {
    console.error('[WhatsApp Webhook] Failed to send thinking message:', error);
  }
}

// Send WhatsApp reply using the send-whatsapp function
async function sendWhatsAppReply(phoneNumber: string, message: string): Promise<void> {
  try {
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    if (!WHATSAPP_ACCESS_TOKEN) {
      console.error('[WhatsApp Webhook] No WHATSAPP_ACCESS_TOKEN configured');
      return;
    }

    const whatsappUrl = 'https://graph.facebook.com/v22.0/959289807270027/messages';
    
    // Truncate message if too long (WhatsApp limit is 4096)
    const truncatedMessage = message.length > 4000 
      ? message.substring(0, 3997) + '...'
      : message;

    const response = await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: truncatedMessage }
      })
    });

    const result = await response.text();
    console.log('[WhatsApp Webhook] Reply sent:', response.status, result.substring(0, 200));
  } catch (error) {
    console.error('[WhatsApp Webhook] Failed to send reply:', error);
  }
}

// Call the AI assistant and get a response
async function callAIAssistant(
  userMessage: string,
  userId: string
): Promise<string> {
  try {
    const aiUrl = `${SUPABASE_URL}/functions/v1/ai-assistant`;
    
    // Build conversation with system context
    const messages = [
      {
        role: 'system',
        content: `You are MAI, a helpful AI assistant responding via WhatsApp. Keep responses concise and mobile-friendly. 
Use short paragraphs and emojis sparingly for clarity. The user is authenticated and you have access to their tools.
Current time: ${new Date().toISOString()}`
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    // Create a service role client to generate a valid token for the user
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // For now, we'll call without auth token since ai-assistant can decode JWT
    // The AI will operate with limited permissions without a real user token
    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[WhatsApp Webhook] AI assistant error:', response.status, errorText);
      return "I'm having trouble processing your request right now. Please try again in a moment.";
    }

    const result = await response.json();
    return result.content || "I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error('[WhatsApp Webhook] AI assistant call failed:', error);
    return "Something went wrong. Please try again later.";
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
          
          // Look up user_id from user_phone_mappings table
          const normalizedPhone = phoneNumber.replace(/[^\d]/g, '');
          const { data: phoneMapping, error: mappingError } = await supabase
            .from('user_phone_mappings')
            .select('user_id')
            .or(`phone_number.eq.${normalizedPhone},phone_number.eq.+${normalizedPhone}`)
            .limit(1)
            .single();
          
          if (mappingError) {
            console.log('[WhatsApp Webhook] No phone mapping found:', mappingError.message);
          }

          const userId = phoneMapping?.user_id || null;
          
          // Store the inbound message
          const { error: insertError } = await supabase
            .from('whatsapp_messages')
            .insert({
              user_id: userId || '00000000-0000-0000-0000-000000000000',
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

          // If we found a registered user and this is a text message, process with AI
          if (userId && messageType === 'text' && content.trim()) {
            console.log('[WhatsApp Webhook] Processing AI response for user:', userId);
            
            // Send "thinking" message immediately for user feedback
            // Don't await - fire and forget so we respond quickly
            sendThinkingMessage(phoneNumber);
            
            // Call AI assistant
            const aiResponse = await callAIAssistant(content, userId);
            
            // Send the AI response back via WhatsApp
            await sendWhatsAppReply(phoneNumber, aiResponse);
            
            // Store the outbound message
            await supabase
              .from('whatsapp_messages')
              .insert({
                user_id: userId,
                phone_number: phoneNumber,
                direction: 'outbound',
                content: aiResponse,
                message_type: 'text',
                status: 'sent',
                metadata: { source: 'ai-assistant' }
              });
            
            console.log('[WhatsApp Webhook] AI response sent and stored');
          } else if (!userId && messageType === 'text') {
            // No registered user - send helpful message
            await sendWhatsAppReply(
              phoneNumber, 
              "👋 Hi! I'm MAI. To use me via WhatsApp, please link your phone number in the MAI app settings first."
            );
          }
        }
      }
      
      // Process status updates
      if (value?.statuses) {
        for (const status of value.statuses) {
          console.log('[WhatsApp Webhook] Processing status update:', status.id, status.status);
          
          const { error: updateError } = await supabase
            .from('whatsapp_messages')
            .update({ status: status.status })
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
