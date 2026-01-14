import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

interface DashboardData {
  gmail: {
    connected: boolean;
    unreadCount: number;
    recentEmails: Email[];
    awaitingResponse: Email[];
  };
  calendar: {
    connected: boolean;
    todayEvents: CalendarEvent[];
    pendingInvites: CalendarEvent[];
  };
  monday: {
    connected: boolean;
    tasksDueToday: MondayTask[];
    overdueTasks: MondayTask[];
  };
  contacts: {
    followupsDue: ContactFollowup[];
    priorityContacts: ContactFollowup[];
  };
}

interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  responseStatus?: string;
  organizer?: string;
  hasVideoCall?: boolean;
}

interface MondayTask {
  id: string;
  name: string;
  boardName: string;
  status?: string;
  dueDate?: string;
}

interface ContactFollowup {
  id: string;
  googleContactId: string;
  email?: string;
  name?: string;
  tier?: number;
  nextFollowupDate?: string;
  lastContactDate?: string;
  notes?: string;
  tags?: { name: string; color: string }[];
}

function getSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Get Google access token with refresh if needed
async function getGoogleToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  
  // Check if Google integration exists
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();

  if (!integration) {
    console.log('[Dashboard] No Google integration found for user');
    return null;
  }

  // Check if token needs refresh (5 min buffer)
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : 0;
  const now = Date.now();
  const needsRefresh = expiresAt - now < 5 * 60 * 1000;

  if (needsRefresh) {
    console.log('[Dashboard] Token needs refresh, attempting...');
    // Get refresh token from encrypted_integration_tokens
    const { data: refreshTokenRow } = await supabase
      .from('encrypted_integration_tokens')
      .select('encrypted_value')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('token_type', 'refresh_token')
      .maybeSingle();

    if (refreshTokenRow?.encrypted_value) {
      try {
        const refreshToken = await decrypt(refreshTokenRow.encrypted_value);
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
        const tokenData = await tokenResponse.json();
        
        if (tokenData.access_token) {
          console.log('[Dashboard] Token refreshed successfully');
          
          // Store the new access token
          const { encrypt } = await import("../_shared/encryption.ts");
          const encryptedNewToken = await encrypt(tokenData.access_token);
          
          await supabase
            .from('encrypted_integration_tokens')
            .upsert({
              user_id: userId,
              provider: 'google',
              token_type: 'access_token',
              encrypted_value: encryptedNewToken,
            }, { onConflict: 'user_id,provider,token_type' });
          
          // Update expiry
          const newExpiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
          await supabase
            .from('user_integrations')
            .update({ token_expires_at: newExpiresAt })
            .eq('user_id', userId)
            .eq('provider', 'google');
          
          return tokenData.access_token;
        }
      } catch (e) {
        console.error('[Dashboard] Token refresh failed:', e);
      }
    }
  }

  // Get current access token from encrypted_integration_tokens
  const { data: accessTokenRow } = await supabase
    .from('encrypted_integration_tokens')
    .select('encrypted_value')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('token_type', 'access_token')
    .maybeSingle();

  if (!accessTokenRow?.encrypted_value) {
    console.log('[Dashboard] No access token found for user');
    return null;
  }
  
  try {
    const token = await decrypt(accessTokenRow.encrypted_value);
    console.log('[Dashboard] Access token retrieved successfully');
    return token;
  } catch (e) {
    console.error('[Dashboard] Failed to decrypt access token:', e);
    return null;
  }
}

// Get Monday.com token
async function getMondayToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  
  // Check if Monday integration exists
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'monday')
    .maybeSingle();

  if (!integration) return null;

  // Get access token from encrypted_integration_tokens
  const { data: tokenRow } = await supabase
    .from('encrypted_integration_tokens')
    .select('encrypted_value')
    .eq('user_id', userId)
    .eq('provider', 'monday')
    .eq('token_type', 'access_token')
    .maybeSingle();

  if (!tokenRow?.encrypted_value) return null;
  
  try {
    return await decrypt(tokenRow.encrypted_value);
  } catch {
    return null;
  }
}

// Fetch Gmail data
async function fetchGmailData(token: string): Promise<DashboardData['gmail']> {
  try {
    // Get unread count
    const unreadResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=1',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const unreadData = await unreadResponse.json();
    const unreadCount = unreadData.resultSizeEstimate || 0;

    // Get recent emails
    const recentResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const recentData = await recentResponse.json();
    
    const recentEmails: Email[] = [];
    const messageIds = (recentData.messages || []).slice(0, 5);
    
    for (const msg of messageIds) {
      const detailResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const detail = await detailResponse.json();
      
      const headers = detail.payload?.headers || [];
      const from = headers.find((h: { name: string }) => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value || '(No subject)';
      const date = headers.find((h: { name: string }) => h.name === 'Date')?.value || '';
      
      recentEmails.push({
        id: msg.id,
        from: from.replace(/<.*>/, '').trim(),
        subject,
        snippet: detail.snippet || '',
        date,
        isUnread: detail.labelIds?.includes('UNREAD') || false,
      });
    }

    // Get emails older than 24hrs awaiting response (inbox, not sent, older than 24hrs)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const beforeDate = yesterday.toISOString().split('T')[0].replace(/-/g, '/');
    const awaitingResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox is:unread before:${beforeDate}&maxResults=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const awaitingData = await awaitingResponse.json();
    
    const awaitingEmails: Email[] = [];
    for (const msg of (awaitingData.messages || []).slice(0, 5)) {
      const detailResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const detail = await detailResponse.json();
      
      const headers = detail.payload?.headers || [];
      awaitingEmails.push({
        id: msg.id,
        from: (headers.find((h: { name: string }) => h.name === 'From')?.value || 'Unknown').replace(/<.*>/, '').trim(),
        subject: headers.find((h: { name: string }) => h.name === 'Subject')?.value || '(No subject)',
        snippet: detail.snippet || '',
        date: headers.find((h: { name: string }) => h.name === 'Date')?.value || '',
        isUnread: true,
      });
    }

    return { connected: true, unreadCount, recentEmails, awaitingResponse: awaitingEmails };
  } catch (e) {
    console.error('[Dashboard] Gmail fetch error:', e);
    return { connected: true, unreadCount: 0, recentEmails: [], awaitingResponse: [] };
  }
}

// Fetch Calendar data
async function fetchCalendarData(token: string): Promise<DashboardData['calendar']> {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const eventsUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    eventsUrl.searchParams.set('timeMin', startOfDay.toISOString());
    eventsUrl.searchParams.set('timeMax', endOfDay.toISOString());
    eventsUrl.searchParams.set('singleEvents', 'true');
    eventsUrl.searchParams.set('orderBy', 'startTime');
    eventsUrl.searchParams.set('maxResults', '20');

    const response = await fetch(eventsUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    const todayEvents: CalendarEvent[] = [];
    const pendingInvites: CalendarEvent[] = [];

    for (const event of data.items || []) {
      const calEvent: CalendarEvent = {
        id: event.id,
        summary: event.summary || '(No title)',
        start: event.start?.dateTime || event.start?.date || '',
        end: event.end?.dateTime || event.end?.date || '',
        location: event.location,
        responseStatus: event.attendees?.find((a: { self?: boolean }) => a.self)?.responseStatus,
        organizer: event.organizer?.email,
        hasVideoCall: !!event.hangoutLink || !!event.conferenceData,
      };

      todayEvents.push(calEvent);
      
      if (calEvent.responseStatus === 'needsAction') {
        pendingInvites.push(calEvent);
      }
    }

    return { connected: true, todayEvents, pendingInvites };
  } catch (e) {
    console.error('[Dashboard] Calendar fetch error:', e);
    return { connected: true, todayEvents: [], pendingInvites: [] };
  }
}

// Fetch Monday.com data
async function fetchMondayData(token: string): Promise<DashboardData['monday']> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get boards and items
    const query = `
      query {
        boards(limit: 10) {
          id
          name
          items_page(limit: 50) {
            items {
              id
              name
              column_values {
                id
                text
                type
              }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    
    const tasksDueToday: MondayTask[] = [];
    const overdueTasks: MondayTask[] = [];

    for (const board of data.data?.boards || []) {
      for (const item of board.items_page?.items || []) {
        const dateCol = item.column_values?.find((c: { type: string }) => c.type === 'date');
        const statusCol = item.column_values?.find((c: { type: string }) => c.type === 'status');
        
        if (dateCol?.text) {
          const dueDate = dateCol.text;
          const task: MondayTask = {
            id: item.id,
            name: item.name,
            boardName: board.name,
            status: statusCol?.text,
            dueDate,
          };
          
          if (dueDate === today) {
            tasksDueToday.push(task);
          } else if (dueDate < today && statusCol?.text !== 'Done') {
            overdueTasks.push(task);
          }
        }
      }
    }

    return { connected: true, tasksDueToday, overdueTasks: overdueTasks.slice(0, 5) };
  } catch (e) {
    console.error('[Dashboard] Monday fetch error:', e);
    return { connected: true, tasksDueToday: [], overdueTasks: [] };
  }
}

// Fetch contact intelligence data
async function fetchContactData(userId: string): Promise<DashboardData['contacts']> {
  const supabase = getSupabaseClient();
  
  try {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Get overdue and upcoming followups
    const { data: followups } = await supabase
      .from('contact_profiles')
      .select(`
        id, google_contact_id, email, tier, notes, 
        next_followup_date, last_contact_date,
        contact_profile_tags (
          contact_tags (name, color)
        )
      `)
      .eq('user_id', userId)
      .not('next_followup_date', 'is', null)
      .lte('next_followup_date', weekAhead.toISOString())
      .order('next_followup_date', { ascending: true })
      .limit(10);

    // Get tier 1 priority contacts
    const { data: priorityContacts } = await supabase
      .from('contact_profiles')
      .select(`
        id, google_contact_id, email, tier, notes,
        next_followup_date, last_contact_date,
        contact_profile_tags (
          contact_tags (name, color)
        )
      `)
      .eq('user_id', userId)
      .eq('tier', 1)
      .order('updated_at', { ascending: false })
      .limit(5);

    // deno-lint-ignore no-explicit-any
    const mapContact = (c: any): ContactFollowup => ({
      id: c.id,
      googleContactId: c.google_contact_id,
      email: c.email,
      tier: c.tier,
      nextFollowupDate: c.next_followup_date,
      lastContactDate: c.last_contact_date,
      notes: c.notes,
      tags: c.contact_profile_tags?.map((pt: { contact_tags: { name: string; color: string } }) => pt.contact_tags) || [],
    });

    return {
      followupsDue: (followups || []).map(mapContact),
      priorityContacts: (priorityContacts || []).map(mapContact),
    };
  } catch (e) {
    console.error('[Dashboard] Contact fetch error:', e);
    return { followupsDue: [], priorityContacts: [] };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Create auth client to validate JWT
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    
    if (authError || !claimsData?.claims) {
      console.error('[Dashboard] Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Invalid or expired token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Use authenticated user's ID - ignore any user_id from request body
    const user_id = claimsData.claims.sub as string;
    console.log(`[Dashboard] Fetching data for authenticated user: ${user_id}`);

    // Fetch all data in parallel
    const [googleToken, mondayToken] = await Promise.all([
      getGoogleToken(user_id),
      getMondayToken(user_id),
    ]);

    const [gmailData, calendarData, mondayData, contactData] = await Promise.all([
      googleToken ? fetchGmailData(googleToken) : { connected: false, unreadCount: 0, recentEmails: [], awaitingResponse: [] },
      googleToken ? fetchCalendarData(googleToken) : { connected: false, todayEvents: [], pendingInvites: [] },
      mondayToken ? fetchMondayData(mondayToken) : { connected: false, tasksDueToday: [], overdueTasks: [] },
      fetchContactData(user_id),
    ]);

    const dashboardData: DashboardData = {
      gmail: gmailData,
      calendar: calendarData,
      monday: mondayData,
      contacts: contactData,
    };

    console.log(`[Dashboard] Data fetched successfully`);

    return new Response(
      JSON.stringify({ success: true, data: dashboardData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Dashboard] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});