import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const PEOPLE_API_URL = 'https://people.googleapis.com/v1';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,biographies,memberships,photos';

interface ContactsApiRequest {
  action: string;
  user_id: string;
  params?: Record<string, unknown>;
}

// Helper to get Google access token for a user (with refresh if needed)
async function getGoogleToken(userId: string): Promise<{ token: string | null; error?: string }> {
  console.log(`[GoogleContacts] Getting token for user: ${userId}`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Get the user's Google Contacts integration
  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('access_token_secret_id, refresh_token_secret_id, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google-contacts')
    .maybeSingle();

  if (integrationError) {
    console.error(`[GoogleContacts] Error fetching integration:`, integrationError);
    return { token: null, error: 'Failed to fetch Google Contacts integration' };
  }

  if (!integration?.access_token_secret_id) {
    console.log(`[GoogleContacts] No Google Contacts integration found for user`);
    return { token: null, error: 'Google Contacts not connected. Please connect from Integrations.' };
  }

  // Check if token needs refresh
  const expiresAt = new Date(integration.token_expires_at).getTime();
  const now = Date.now();
  const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  const needsRefresh = expiresAt - now < REFRESH_BUFFER_MS;

  if (needsRefresh && integration.refresh_token_secret_id) {
    console.log(`[GoogleContacts] Token needs refresh`);
    
    // Get the refresh token
    const { data: refreshTokenRow } = await supabase
      .from('encrypted_integration_tokens')
      .select('encrypted_value')
      .eq('id', integration.refresh_token_secret_id)
      .maybeSingle();

    if (!refreshTokenRow?.encrypted_value) {
      console.error(`[GoogleContacts] No refresh token available`);
      return { token: null, error: 'Failed to retrieve refresh token' };
    }

    try {
      const refreshToken = await decrypt(refreshTokenRow.encrypted_value);
      
      // Refresh the token
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
      if (tokenData.error) {
        console.error(`[GoogleContacts] Token refresh failed:`, tokenData);
        return { token: null, error: 'Token refresh failed' };
      }

      console.log(`[GoogleContacts] Token refreshed successfully`);
      return { token: tokenData.access_token };
    } catch (err) {
      console.error(`[GoogleContacts] Refresh error:`, err);
      return { token: null, error: 'Failed to refresh token' };
    }
  }

  // Token is valid, decrypt and return
  const { data: accessTokenRow } = await supabase
    .from('encrypted_integration_tokens')
    .select('encrypted_value')
    .eq('id', integration.access_token_secret_id)
    .maybeSingle();

  if (!accessTokenRow?.encrypted_value) {
    console.error(`[GoogleContacts] No access token found`);
    return { token: null, error: 'Failed to retrieve access token' };
  }

  try {
    const decryptedToken = await decrypt(accessTokenRow.encrypted_value);
    return { token: decryptedToken };
  } catch (decryptError) {
    console.error(`[GoogleContacts] Error decrypting token:`, decryptError);
    return { token: null, error: 'Failed to decrypt access token' };
  }
}

// ============= Google Contacts API Actions =============

interface Contact {
  resourceName: string;
  name?: string;
  emails?: string[];
  phones?: string[];
  organization?: string;
  title?: string;
  address?: string;
  birthday?: string;
  bio?: string;
  photoUrl?: string;
  groups?: string[];
}

interface ContactGroup {
  resourceName: string;
  name: string;
  memberCount?: number;
  groupType: string;
}

async function getContacts(
  token: string, 
  pageSize: number = 100, 
  pageToken?: string
): Promise<{ contacts: Contact[]; nextPageToken?: string }> {
  console.log(`[GoogleContacts] Getting contacts, pageSize=${pageSize}`);
  
  const url = new URL(`${PEOPLE_API_URL}/people/me/connections`);
  url.searchParams.set('personFields', PERSON_FIELDS);
  url.searchParams.set('pageSize', String(Math.min(pageSize, 1000)));
  url.searchParams.set('sortOrder', 'LAST_NAME_ASCENDING');
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GoogleContacts] API error:`, errorText);
    throw new Error(`Google People API error: ${response.status}`);
  }

  const data = await response.json();
  
  const contacts: Contact[] = (data.connections || []).map(parseContact);
  
  console.log(`[GoogleContacts] Found ${contacts.length} contacts`);
  return { 
    contacts, 
    nextPageToken: data.nextPageToken 
  };
}

async function searchContacts(token: string, query: string, pageSize: number = 30): Promise<Contact[]> {
  console.log(`[GoogleContacts] Searching contacts for: ${query}`);
  
  const url = new URL(`${PEOPLE_API_URL}/people:searchContacts`);
  url.searchParams.set('query', query);
  url.searchParams.set('readMask', PERSON_FIELDS);
  url.searchParams.set('pageSize', String(Math.min(pageSize, 30))); // Max 30 for search

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GoogleContacts] Search API error:`, errorText);
    throw new Error(`Google People API search error: ${response.status}`);
  }

  const data = await response.json();
  
  const contacts: Contact[] = (data.results || []).map((result: { person: unknown }) => parseContact(result.person));
  
  console.log(`[GoogleContacts] Found ${contacts.length} matching contacts`);
  return contacts;
}

async function getContact(token: string, resourceName: string): Promise<Contact | null> {
  console.log(`[GoogleContacts] Getting contact: ${resourceName}`);
  
  // Ensure resourceName starts with 'people/'
  const normalizedName = resourceName.startsWith('people/') ? resourceName : `people/${resourceName}`;
  
  const url = new URL(`${PEOPLE_API_URL}/${normalizedName}`);
  url.searchParams.set('personFields', PERSON_FIELDS);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const errorText = await response.text();
    console.error(`[GoogleContacts] Get contact API error:`, errorText);
    throw new Error(`Google People API error: ${response.status}`);
  }

  const data = await response.json();
  return parseContact(data);
}

async function getContactGroups(token: string): Promise<ContactGroup[]> {
  console.log(`[GoogleContacts] Getting contact groups`);
  
  const url = new URL(`${PEOPLE_API_URL}/contactGroups`);
  url.searchParams.set('groupFields', 'name,memberCount,groupType');
  url.searchParams.set('pageSize', '100');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GoogleContacts] Groups API error:`, errorText);
    throw new Error(`Google People API error: ${response.status}`);
  }

  const data = await response.json();
  
  const groups: ContactGroup[] = (data.contactGroups || []).map((group: {
    resourceName?: string;
    name?: string;
    memberCount?: number;
    groupType?: string;
  }) => ({
    resourceName: group.resourceName || '',
    name: group.name || 'Unnamed Group',
    memberCount: group.memberCount,
    groupType: group.groupType || 'USER_CONTACT_GROUP',
  }));
  
  console.log(`[GoogleContacts] Found ${groups.length} contact groups`);
  return groups;
}

// Helper to parse a person object into our Contact format
function parseContact(person: unknown): Contact {
  const p = person as {
    resourceName?: string;
    names?: Array<{ displayName?: string }>;
    emailAddresses?: Array<{ value?: string }>;
    phoneNumbers?: Array<{ value?: string }>;
    organizations?: Array<{ name?: string; title?: string }>;
    addresses?: Array<{ formattedValue?: string }>;
    birthdays?: Array<{ date?: { year?: number; month?: number; day?: number } }>;
    biographies?: Array<{ value?: string }>;
    photos?: Array<{ url?: string }>;
    memberships?: Array<{ contactGroupMembership?: { contactGroupResourceName?: string } }>;
  };

  const birthday = p.birthdays?.[0]?.date;
  let birthdayStr: string | undefined;
  if (birthday) {
    const { year, month, day } = birthday;
    if (month && day) {
      birthdayStr = year ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` 
                        : `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return {
    resourceName: p.resourceName || '',
    name: p.names?.[0]?.displayName,
    emails: p.emailAddresses?.map(e => e.value).filter(Boolean) as string[] | undefined,
    phones: p.phoneNumbers?.map(ph => ph.value).filter(Boolean) as string[] | undefined,
    organization: p.organizations?.[0]?.name,
    title: p.organizations?.[0]?.title,
    address: p.addresses?.[0]?.formattedValue,
    birthday: birthdayStr,
    bio: p.biographies?.[0]?.value,
    photoUrl: p.photos?.[0]?.url,
    groups: p.memberships?.map(m => m.contactGroupMembership?.contactGroupResourceName).filter(Boolean) as string[] | undefined,
  };
}

// ============= Main Handler =============

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, user_id, params = {} } = await req.json() as ContactsApiRequest;

    console.log(`[GoogleContacts] Action: ${action}, User: ${user_id}`);

    if (!user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'user_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get the Google token
    const { token, error: tokenError } = await getGoogleToken(user_id);
    
    if (!token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          needsAuth: true,
          error: tokenError || 'Google Contacts not connected' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    let result: unknown;

    switch (action) {
      case 'get_contacts':
        result = await getContacts(
          token, 
          (params.page_size as number) || 100,
          params.page_token as string | undefined
        );
        break;

      case 'search_contacts':
        if (!params.query) {
          throw new Error('query is required for search');
        }
        result = await searchContacts(
          token, 
          params.query as string,
          (params.page_size as number) || 30
        );
        break;

      case 'get_contact':
        if (!params.resource_name) {
          throw new Error('resource_name is required');
        }
        result = await getContact(token, params.resource_name as string);
        break;

      case 'get_contact_groups':
        result = await getContactGroups(token);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GoogleContacts] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
