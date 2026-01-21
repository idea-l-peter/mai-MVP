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

const PEOPLE_API_URL = 'https://people.googleapis.com/v1';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,biographies,memberships,photos';

interface ContactsApiRequest {
  action: string;
  params?: Record<string, unknown>;
}

// Helper to get Google access token for a user (with refresh if needed)
// Uses unified "google" provider and checks for contacts scope
async function getGoogleToken(userId: string): Promise<{ token: string | null; error?: string; needsScopeUpdate?: boolean }> {
  console.log(`[GoogleContacts] Getting token for user: ${userId}`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Get the user's unified Google integration
  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('access_token_secret_id, refresh_token_secret_id, token_expires_at, scopes')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();

  if (integrationError) {
    console.error(`[GoogleContacts] Error fetching integration:`, integrationError);
    return { token: null, error: 'Failed to fetch Google integration' };
  }

  if (!integration) {
    console.log(`[GoogleContacts] No Google integration found for user`);
    return { token: null, error: 'Google Workspace not connected. Please connect from Integrations.' };
  }

  // Check if contacts scope is granted
  const grantedScopes = integration.scopes || [];
  const hasContactsScope = grantedScopes.some((scope: string) => 
    scope.includes('contacts')
  );

  if (!hasContactsScope) {
    console.log(`[GoogleContacts] Contacts scope not granted. Granted scopes:`, grantedScopes);
    return { 
      token: null, 
      needsScopeUpdate: true,
      error: 'Contacts permission not granted. Please update your Google permissions from the Integrations page to include Contacts access.' 
    };
  }

  // Check if token needs refresh
  const now = Date.now();
  const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  const expiresAtRaw = integration.token_expires_at;
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).getTime() : NaN;

  const hasValidExpiry = Number.isFinite(expiresAt);
  const needsRefresh = hasValidExpiry ? (expiresAt - now < REFRESH_BUFFER_MS) : false;

  console.log(`[GoogleContacts] Token expiry check`, {
    hasTokenExpiresAt: !!expiresAtRaw,
    token_expires_at: expiresAtRaw,
    hasValidExpiry,
    needsRefresh,
  });

  // Query tokens by user_id, provider, token_type (not by secret ID since those may be null)
  if (needsRefresh) {
    console.log(`[GoogleContacts] Token needs refresh`);
    
    // Get the refresh token by user_id + provider + token_type
    const { data: refreshTokenRow, error: refreshFetchError } = await supabase
      .from('encrypted_integration_tokens')
      .select('encrypted_value')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('token_type', 'refresh_token')
      .maybeSingle();

    console.log(`[GoogleContacts] Refresh token query result:`, { found: !!refreshTokenRow, error: refreshFetchError?.message });

    if (!refreshTokenRow?.encrypted_value) {
      // We can't refresh, but we can still attempt to use whatever access token we have.
      console.warn(`[GoogleContacts] No refresh token available; will attempt to use stored access token (may be expired).`);
    }

    try {
      if (!refreshTokenRow?.encrypted_value) {
        // fall through to access token fetch below
      } else {
      const refreshToken = await decrypt(refreshTokenRow.encrypted_value);
      console.log(`[GoogleContacts] Refresh token decrypted, requesting new access token...`);
      
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
        return { token: null, error: `Token refresh failed: ${tokenData.error_description || tokenData.error}` };
      }

      console.log(`[GoogleContacts] Token refreshed successfully`);

      // Store the new access token
      const { encrypt } = await import("../_shared/encryption.ts");
      const encryptedAccessToken = await encrypt(tokenData.access_token);
      
      await supabase
        .from('encrypted_integration_tokens')
        .upsert({
          user_id: userId,
          provider: 'google',
          token_type: 'access_token',
          encrypted_value: encryptedAccessToken,
        }, { onConflict: 'user_id,provider,token_type' });

      // Update token expiration in user_integrations
      const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
      await supabase
        .from('user_integrations')
        .update({ token_expires_at: newExpiresAt })
        .eq('user_id', userId)
        .eq('provider', 'google');

      return { token: tokenData.access_token };
      }
    } catch (err) {
      console.error(`[GoogleContacts] Refresh error:`, err);
      // fall through to access token fetch below
    }
  }

  // Token is valid, get access token by user_id + provider + token_type
  const { data: accessTokenRow, error: accessFetchError } = await supabase
    .from('encrypted_integration_tokens')
    .select('encrypted_value')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('token_type', 'access_token')
    .maybeSingle();

  console.log(`[GoogleContacts] Access token query result:`, { found: !!accessTokenRow, error: accessFetchError?.message });

  if (!accessTokenRow?.encrypted_value) {
    console.error(`[GoogleContacts] No access token found`);
    return { token: null, error: 'No access token found. Please reconnect Google.' };
  }

  try {
    const decryptedToken = await decrypt(accessTokenRow.encrypted_value);
    console.log(`[GoogleContacts] Access token decrypted successfully`, { tokenLength: decryptedToken.length });
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
    if (response.status === 401) {
      throw new Error(`GOOGLE_API_UNAUTHORIZED`);
    }
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
    if (response.status === 401) {
      throw new Error(`GOOGLE_API_UNAUTHORIZED`);
    }
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
    if (response.status === 401) {
      throw new Error(`GOOGLE_API_UNAUTHORIZED`);
    }
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
    if (response.status === 401) {
      throw new Error(`GOOGLE_API_UNAUTHORIZED`);
    }
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

// ============= Write Operations =============

interface CreateContactInput {
  given_name?: string;
  family_name?: string;
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
}

async function createContact(token: string, input: CreateContactInput): Promise<Contact> {
  console.log(`[GoogleContacts] Creating contact:`, input);
  
  const personData: Record<string, unknown> = {};
  
  if (input.given_name || input.family_name) {
    personData.names = [{
      givenName: input.given_name,
      familyName: input.family_name,
    }];
  }
  
  if (input.email) {
    personData.emailAddresses = [{ value: input.email }];
  }
  
  if (input.phone) {
    personData.phoneNumbers = [{ value: input.phone }];
  }
  
  if (input.organization || input.title) {
    personData.organizations = [{
      name: input.organization,
      title: input.title,
    }];
  }

  const response = await fetch(`${PEOPLE_API_URL}/people:createContact`, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(personData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GoogleContacts] Create contact error:`, errorText);
    throw new Error(`Failed to create contact: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[GoogleContacts] Contact created: ${data.resourceName}`);
  return parseContact(data);
}

interface UpdateContactInput {
  resource_name: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
}

async function updateContact(token: string, input: UpdateContactInput): Promise<Contact> {
  console.log(`[GoogleContacts] Updating contact: ${input.resource_name}`);
  
  // First, get the current contact to get etag
  const normalizedName = input.resource_name.startsWith('people/') 
    ? input.resource_name 
    : `people/${input.resource_name}`;
  
  const getUrl = new URL(`${PEOPLE_API_URL}/${normalizedName}`);
  getUrl.searchParams.set('personFields', PERSON_FIELDS);
  
  const getResponse = await fetch(getUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!getResponse.ok) {
    throw new Error(`Contact not found: ${getResponse.status}`);
  }
  
  const existingContact = await getResponse.json();
  const etag = existingContact.etag;
  
  // Build update fields
  const updateMask: string[] = [];
  const personData: Record<string, unknown> = { etag };
  
  if (input.given_name !== undefined || input.family_name !== undefined) {
    personData.names = [{
      givenName: input.given_name ?? existingContact.names?.[0]?.givenName,
      familyName: input.family_name ?? existingContact.names?.[0]?.familyName,
    }];
    updateMask.push('names');
  }
  
  if (input.email !== undefined) {
    personData.emailAddresses = [{ value: input.email }];
    updateMask.push('emailAddresses');
  }
  
  if (input.phone !== undefined) {
    personData.phoneNumbers = [{ value: input.phone }];
    updateMask.push('phoneNumbers');
  }
  
  if (input.organization !== undefined || input.title !== undefined) {
    personData.organizations = [{
      name: input.organization ?? existingContact.organizations?.[0]?.name,
      title: input.title ?? existingContact.organizations?.[0]?.title,
    }];
    updateMask.push('organizations');
  }

  const updateUrl = new URL(`${PEOPLE_API_URL}/${normalizedName}:updateContact`);
  updateUrl.searchParams.set('updatePersonFields', updateMask.join(','));

  const response = await fetch(updateUrl.toString(), {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(personData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GoogleContacts] Update contact error:`, errorText);
    throw new Error(`Failed to update contact: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[GoogleContacts] Contact updated: ${data.resourceName}`);
  return parseContact(data);
}

async function deleteContact(token: string, resourceName: string): Promise<{ deleted: boolean }> {
  console.log(`[GoogleContacts] Deleting contact: ${resourceName}`);
  
  const normalizedName = resourceName.startsWith('people/') 
    ? resourceName 
    : `people/${resourceName}`;

  const response = await fetch(`${PEOPLE_API_URL}/${normalizedName}:deleteContact`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GoogleContacts] Delete contact error:`, errorText);
    throw new Error(`Failed to delete contact: ${response.status}`);
  }

  console.log(`[GoogleContacts] Contact deleted`);
  return { deleted: true };
}

async function addContactToGroup(
  token: string, 
  resourceName: string, 
  groupResourceName: string
): Promise<{ success: boolean }> {
  console.log(`[GoogleContacts] Adding contact ${resourceName} to group ${groupResourceName}`);
  
  const normalizedContactName = resourceName.startsWith('people/') 
    ? resourceName 
    : `people/${resourceName}`;

  const response = await fetch(`${PEOPLE_API_URL}/${groupResourceName}/members:modify`, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resourceNamesToAdd: [normalizedContactName],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GoogleContacts] Add to group error:`, errorText);
    throw new Error(`Failed to add contact to group: ${response.status}`);
  }

  console.log(`[GoogleContacts] Contact added to group`);
  return { success: true };
}

async function removeContactFromGroup(
  token: string, 
  resourceName: string, 
  groupResourceName: string
): Promise<{ success: boolean }> {
  console.log(`[GoogleContacts] Removing contact ${resourceName} from group ${groupResourceName}`);
  
  const normalizedContactName = resourceName.startsWith('people/') 
    ? resourceName 
    : `people/${resourceName}`;

  const response = await fetch(`${PEOPLE_API_URL}/${groupResourceName}/members:modify`, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resourceNamesToRemove: [normalizedContactName],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GoogleContacts] Remove from group error:`, errorText);
    throw new Error(`Failed to remove contact from group: ${response.status}`);
  }

  console.log(`[GoogleContacts] Contact removed from group`);
  return { success: true };
}

// ============= Main Handler =============

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Debug request headers (do not log sensitive values)
    const headerNames = Array.from(req.headers.keys());
    const authHeaderPresent = req.headers.has('authorization') || req.headers.has('Authorization');
    const apikeyPresent = req.headers.has('apikey');
    console.log('[GoogleContacts] Incoming request headers', {
      headerNames,
      authHeaderPresent,
      apikeyPresent,
    });

    // Validate JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing or invalid authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Create a Supabase client with the user's auth token to validate JWT
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const jwtToken = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(jwtToken);

    if (authError || !claimsData?.claims) {
      console.error('[GoogleContacts] Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Extract user_id from authenticated JWT claims
    const user_id = claimsData.claims.sub as string;
    
    const { action, params = {} } = await req.json() as ContactsApiRequest;

    console.log(`[GoogleContacts] Action: ${action}, User: ${user_id}`);

    // Get the Google token
    const { token, error: tokenError, needsScopeUpdate } = await getGoogleToken(user_id);
    
    if (!token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          needsAuth: !needsScopeUpdate,
          needsScopeUpdate: needsScopeUpdate || false,
          error: tokenError || 'Google Workspace not connected' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    console.log('[GoogleContacts] Retrieved google access token', { tokenLength: token.length });

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

      // Write operations
      case 'create_contact':
        result = await createContact(token, {
          given_name: params.given_name as string | undefined,
          family_name: params.family_name as string | undefined,
          email: params.email as string | undefined,
          phone: params.phone as string | undefined,
          organization: params.organization as string | undefined,
          title: params.title as string | undefined,
        });
        break;

      case 'update_contact':
        if (!params.resource_name) {
          throw new Error('resource_name is required');
        }
        result = await updateContact(token, {
          resource_name: params.resource_name as string,
          given_name: params.given_name as string | undefined,
          family_name: params.family_name as string | undefined,
          email: params.email as string | undefined,
          phone: params.phone as string | undefined,
          organization: params.organization as string | undefined,
          title: params.title as string | undefined,
        });
        break;

      case 'delete_contact':
        if (!params.resource_name) {
          throw new Error('resource_name is required');
        }
        result = await deleteContact(token, params.resource_name as string);
        break;

      case 'add_to_group':
        if (!params.resource_name || !params.group_resource_name) {
          throw new Error('resource_name and group_resource_name are required');
        }
        result = await addContactToGroup(
          token, 
          params.resource_name as string, 
          params.group_resource_name as string
        );
        break;

      case 'remove_from_group':
        if (!params.resource_name || !params.group_resource_name) {
          throw new Error('resource_name and group_resource_name are required');
        }
        result = await removeContactFromGroup(
          token, 
          params.resource_name as string, 
          params.group_resource_name as string
        );
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

    if (error instanceof Error && error.message === 'GOOGLE_API_UNAUTHORIZED') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Google token was rejected by Google (expired/invalid). Please reconnect Google from Integrations.',
          needsAuth: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
