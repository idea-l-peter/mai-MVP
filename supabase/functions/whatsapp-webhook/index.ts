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

// [REMOVED in v5.0] sendThinkingMessage - no longer sending "Processing..." noise

// Fetch recent conversation history for context
async function fetchConversationHistory(
  supabase: any,
  phoneNumber: string,
  limit: number = 5
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  try {
    const { data: messages, error } = await supabase
      .from('whatsapp_messages')
      .select('direction, content, created_at')
      .eq('phone_number', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !messages) {
      console.error('[WhatsApp Webhook] Failed to fetch history:', error);
      return [];
    }

    const typedMessages = messages as Array<{ direction: string; content: string | null; created_at: string }>;
    return typedMessages
      .reverse()
      .filter(m => m.content && m.content.trim())
      .map(m => ({
        role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
        content: m.content as string
      }));
  } catch (error) {
    console.error('[WhatsApp Webhook] Error fetching history:', error);
    return [];
  }
}

// Send WhatsApp reply using the Graph API
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

// Sanitize AI response to remove any internal processing noise
function sanitizeResponse(content: string): string {
  // Remove any bracket-wrapped status messages the LLM might have generated
  const patterns = [
    /\[EXECUTING[^\]]*\]/gi,
    /\[TOOL[^\]]*\]/gi,
    /\[STATUS[^\]]*\]/gi,
    /\[BRIEFING[^\]]*\]/gi,
    /\[NEXT STEP[^\]]*\]/gi,
    /\[ACTION[^\]]*\]/gi,
    /\[PROCESSING[^\]]*\]/gi,
    /\[CALLING[^\]]*\]/gi,
    /\[SEARCHING[^\]]*\]/gi,
    /\[FETCHING[^\]]*\]/gi,
    /\[RETRIEVING[^\]]*\]/gi,
    /\[QUERYING[^\]]*\]/gi,
    /---+/g, // Remove divider lines
  ];
  
  let cleaned = content;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Clean up extra whitespace/newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  
  return cleaned;
}

// Call the AI assistant and get a response with conversation context
async function callAIAssistant(
  userMessage: string,
  userId: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  try {
    const aiUrl = `${SUPABASE_URL}/functions/v1/ai-assistant`;
    
    const messages = [
      {
        role: 'system',
        content: `You are MAI, an executive AI assistant responding via WhatsApp.

RESPONSE FORMAT - CRITICAL:
- Respond in plain, natural text ONLY
- STRICTLY FORBIDDEN: Square brackets [ ], pipe characters |, markers like STATUS:, BRIEFING:, NEXT STEP:
- STRICTLY FORBIDDEN: Announcing tool calls (no "I will check...", "Let me look...", "Executing...", "Searching...")
- Never describe what you are doing internally - just do it and report results
- Professional, concise, executive-level tone
- ABSOLUTELY NO EMOJIS
- Keep responses brief but complete

ANTI-HALLUCINATION RULES:
- NEVER invent or hallucinate data
- If a tool returns an error or no data, say: "I was unable to retrieve that data due to a technical issue."
- STRICTLY FORBIDDEN: Placeholder names like "John Doe" or made-up data
- Only report what tools actually returned

EXECUTION RULES:
- For Tier 5 read-only actions (get emails, check calendar, view contacts), execute immediately without any preamble
- For confirmations (yes, ok, go ahead, yalla), execute the pending action
- For greetings, respond naturally without asking "Should I proceed?"

Current time: ${new Date().toISOString()}`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage
      }
    ];

    console.log(`[WhatsApp Webhook] Calling AI with ${messages.length} messages (${conversationHistory.length} history)`);

    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({
        messages,
        temperature: 0.5,
        max_tokens: 1500,
        user_id: userId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[WhatsApp Webhook] AI assistant error:', response.status, errorText);
      return "I was unable to process your request at this time. Please try again shortly.";
    }

    const result = await response.json();
    
    if (!result.content || result.content.trim() === '') {
      console.error('[WhatsApp Webhook] Empty AI response:', result);
      return "I was unable to complete that action. Please rephrase your request.";
    }
    
    // Sanitize response to remove any internal processing noise
    return sanitizeResponse(result.content);
  } catch (error) {
    console.error('[WhatsApp Webhook] AI assistant call failed:', error);
    return "An error occurred while processing your request. Please try again.";
  }
}

// Async function to process webhook payload AFTER returning 200
async function processWebhookAsync(payload: any): Promise<void> {
  console.log('[WhatsApp Webhook] Processing payload async:', JSON.stringify(payload, null, 2).substring(0, 500));
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  
  const entry = payload.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  
  // Process incoming messages
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
        
        // Fetch conversation history for context (last 5 messages)
        const conversationHistory = await fetchConversationHistory(supabase, phoneNumber, 5);
        console.log(`[WhatsApp Webhook] Fetched ${conversationHistory.length} messages for context`);
        
        // Call AI assistant with conversation context (no "thinking" message - v5.0 clean UX)
        const aiResponse = await callAIAssistant(content, userId, conversationHistory);
        
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
        // No registered user - send helpful message (professional, no emoji)
        await sendWhatsAppReply(
          phoneNumber, 
          "Hello. I'm MAI. To use me via WhatsApp, please link your phone number in the MAI app settings first."
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
      let payload: any;
      
      try {
        payload = JSON.parse(body);
      } catch {
        console.error('[WhatsApp Webhook] Invalid JSON payload');
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log('[WhatsApp Webhook] Received webhook, returning 200 immediately');
      
      // Verify webhook signature if configured (quick check)
      const signature = req.headers.get('x-hub-signature-256');
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
      
      if (signature && appSecret) {
        const isValid = await verifyWebhookSignature(body, signature, appSecret);
        if (!isValid) {
          console.error('[WhatsApp Webhook] Invalid signature - ignoring payload');
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Process webhook asynchronously - don't await
      // This allows us to return 200 immediately while processing continues
      processWebhookAsync(payload).catch(err => {
        console.error('[WhatsApp Webhook] Async processing error:', err);
      });
      
      // Return 200 OK immediately to prevent WhatsApp from retrying
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
    
    // Still return 200 to prevent Meta from retrying
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
