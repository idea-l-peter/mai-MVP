import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_VERSION = '2024-01';

interface MondayApiRequest {
  action: string;
  user_id: string;
  params?: Record<string, unknown>;
}

// Helper to get Monday.com access token for a user
async function getMondayToken(userId: string): Promise<{ token: string | null; error?: string }> {
  console.log(`[MondayAPI] Getting token for user: ${userId}`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Check if user has Monday integration
  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('id, provider_email')
    .eq('user_id', userId)
    .eq('provider', 'monday')
    .maybeSingle();

  if (integrationError) {
    console.error(`[MondayAPI] Error fetching integration:`, integrationError);
    return { token: null, error: 'Failed to fetch Monday.com integration' };
  }

  if (!integration) {
    console.log(`[MondayAPI] No Monday.com integration found for user`);
    return { token: null, error: 'Monday.com is not connected. Please connect from the Integrations page.' };
  }

  console.log(`[MondayAPI] Found integration for: ${integration.provider_email}`);

  // Get the encrypted token directly from encrypted_integration_tokens
  // (stored by monday-oauth-callback with user_id + provider + token_type)
  const { data: tokenData, error: tokenError } = await supabase
    .from('encrypted_integration_tokens')
    .select('encrypted_value')
    .eq('user_id', userId)
    .eq('provider', 'monday')
    .eq('token_type', 'access_token')
    .maybeSingle();

  if (tokenError) {
    console.error(`[MondayAPI] Error fetching token:`, tokenError);
    return { token: null, error: 'Failed to retrieve Monday.com token' };
  }

  if (!tokenData?.encrypted_value) {
    console.log(`[MondayAPI] No encrypted token found for user`);
    return { token: null, error: 'Monday.com token not found. Please reconnect from Integrations.' };
  }

  // Decrypt the token
  try {
    const decryptedToken = await decrypt(tokenData.encrypted_value);
    console.log(`[MondayAPI] Successfully decrypted token`);
    return { token: decryptedToken };
  } catch (decryptError) {
    console.error(`[MondayAPI] Error decrypting token:`, decryptError);
    return { token: null, error: 'Failed to decrypt Monday.com token' };
  }
}

// Make GraphQL request to Monday.com API
async function mondayGraphQL(token: string, query: string, variables?: Record<string, unknown>): Promise<unknown> {
  console.log(`[MondayAPI] Making GraphQL request`);
  
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'API-Version': MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[MondayAPI] API error:`, errorText);
    throw new Error(`Monday.com API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    console.error(`[MondayAPI] GraphQL errors:`, data.errors);
    throw new Error(data.errors[0]?.message || 'GraphQL error');
  }

  return data.data;
}

// ============= Monday.com API Actions =============

async function getMe(token: string) {
  const query = `query { me { id name email photo_thumb account { name id } } }`;
  return await mondayGraphQL(token, query);
}

async function getBoards(token: string) {
  const allBoards: unknown[] = [];
  let page = 1;
  const limit = 100; // Max allowed by Monday.com API
  
  console.log(`[MondayAPI] Fetching all boards with pagination (limit: ${limit})`);
  
  while (true) {
    const query = `query($limit: Int!, $page: Int!) {
      boards(limit: $limit, page: $page) {
        id
        name
        description
        state
        board_kind
        workspace {
          id
          name
        }
      }
    }`;
    
    const result = await mondayGraphQL(token, query, { limit, page }) as { boards: unknown[] };
    const boards = result.boards || [];
    
    console.log(`[MondayAPI] Page ${page}: fetched ${boards.length} boards`);
    
    if (boards.length === 0) {
      break; // No more boards to fetch
    }
    
    allBoards.push(...boards);
    
    if (boards.length < limit) {
      break; // Last page (fewer items than limit means no more pages)
    }
    
    page++;
  }
  
  console.log(`[MondayAPI] Total boards fetched: ${allBoards.length}`);
  return { boards: allBoards };
}

async function getBoard(token: string, boardId: string) {
  const query = `query($boardId: [ID!]) {
    boards(ids: $boardId) {
      id
      name
      description
      state
      columns {
        id
        title
        type
        settings_str
      }
      groups {
        id
        title
        color
      }
    }
  }`;
  return await mondayGraphQL(token, query, { boardId: [boardId] });
}

async function getItems(token: string, boardId: string, limit: number = 25, groupId?: string) {
  let query: string;
  
  if (groupId) {
    query = `query($boardId: [ID!], $limit: Int, $groupId: [String!]) {
      boards(ids: $boardId) {
        groups(ids: $groupId) {
          items_page(limit: $limit) {
            items {
              id
              name
              state
              group {
                id
                title
              }
              column_values {
                id
                text
                value
                type
              }
              created_at
              updated_at
            }
          }
        }
      }
    }`;
    return await mondayGraphQL(token, query, { boardId: [boardId], limit, groupId: [groupId] });
  } else {
    query = `query($boardId: [ID!], $limit: Int) {
      boards(ids: $boardId) {
        items_page(limit: $limit) {
          items {
            id
            name
            state
            group {
              id
              title
            }
            column_values {
              id
              text
              value
              type
            }
            created_at
            updated_at
          }
        }
      }
    }`;
    return await mondayGraphQL(token, query, { boardId: [boardId], limit });
  }
}

async function getItem(token: string, itemId: string) {
  const query = `query($itemId: [ID!]) {
    items(ids: $itemId) {
      id
      name
      state
      group {
        id
        title
      }
      board {
        id
        name
      }
      column_values {
        id
        text
        value
        type
        column {
          title
        }
      }
      updates(limit: 10) {
        id
        body
        text_body
        created_at
        creator {
          id
          name
        }
      }
      created_at
      updated_at
    }
  }`;
  return await mondayGraphQL(token, query, { itemId: [itemId] });
}

async function searchItems(token: string, boardId: string, searchTerm: string) {
  // Use items_page with query_params for searching
  const query = `query($boardId: [ID!], $searchTerm: String!) {
    boards(ids: $boardId) {
      items_page(limit: 25, query_params: { rules: [{ column_id: "name", compare_value: [$searchTerm], operator: contains_text }] }) {
        items {
          id
          name
          state
          group {
            id
            title
          }
          column_values {
            id
            text
            type
          }
        }
      }
    }
  }`;
  return await mondayGraphQL(token, query, { boardId: [boardId], searchTerm });
}

async function createItem(token: string, boardId: string, itemName: string, groupId?: string, columnValues?: Record<string, unknown>) {
  const query = `mutation($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON) {
    create_item(board_id: $boardId, item_name: $itemName, group_id: $groupId, column_values: $columnValues) {
      id
      name
      group {
        id
        title
      }
    }
  }`;
  
  const variables: Record<string, unknown> = { 
    boardId, 
    itemName,
  };
  
  if (groupId) variables.groupId = groupId;
  if (columnValues) variables.columnValues = JSON.stringify(columnValues);
  
  return await mondayGraphQL(token, query, variables);
}

async function updateItem(token: string, boardId: string, itemId: string, columnValues: Record<string, unknown>) {
  const query = `mutation($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
    change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
      id
      name
      column_values {
        id
        text
      }
    }
  }`;
  return await mondayGraphQL(token, query, { boardId, itemId, columnValues: JSON.stringify(columnValues) });
}

async function changeStatus(token: string, boardId: string, itemId: string, columnId: string, statusLabel: string) {
  const query = `mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
    change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
      id
      name
    }
  }`;
  const value = JSON.stringify({ label: statusLabel });
  return await mondayGraphQL(token, query, { boardId, itemId, columnId, value });
}

async function addUpdate(token: string, itemId: string, body: string) {
  const query = `mutation($itemId: ID!, $body: String!) {
    create_update(item_id: $itemId, body: $body) {
      id
      body
      created_at
    }
  }`;
  return await mondayGraphQL(token, query, { itemId: Number(itemId), body });
}

async function deleteItem(token: string, itemId: string) {
  const query = `mutation($itemId: ID!) {
    delete_item(item_id: $itemId) {
      id
    }
  }`;
  return await mondayGraphQL(token, query, { itemId: Number(itemId) });
}

async function archiveItem(token: string, itemId: string) {
  const query = `mutation($itemId: ID!) {
    archive_item(item_id: $itemId) {
      id
    }
  }`;
  return await mondayGraphQL(token, query, { itemId: Number(itemId) });
}

// ============= Main Handler =============

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, user_id, params = {} } = await req.json() as MondayApiRequest;

    console.log(`[MondayAPI] Action: ${action}, User: ${user_id}`);

    if (!user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'user_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get the Monday.com token
    const { token, error: tokenError } = await getMondayToken(user_id);
    
    if (!token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          needsAuth: true,
          error: tokenError || 'Monday.com not connected' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    let result: unknown;

    switch (action) {
      case 'get_me':
        result = await getMe(token);
        break;

      case 'get_boards':
        result = await getBoards(token);
        break;

      case 'get_board':
        if (!params.board_id) {
          throw new Error('board_id is required');
        }
        result = await getBoard(token, params.board_id as string);
        break;

      case 'get_items':
        if (!params.board_id) {
          throw new Error('board_id is required');
        }
        result = await getItems(
          token, 
          params.board_id as string, 
          (params.limit as number) || 25,
          params.group_id as string | undefined
        );
        break;

      case 'get_item':
        if (!params.item_id) {
          throw new Error('item_id is required');
        }
        result = await getItem(token, params.item_id as string);
        break;

      case 'search_items':
        if (!params.board_id || !params.search_term) {
          throw new Error('board_id and search_term are required');
        }
        result = await searchItems(token, params.board_id as string, params.search_term as string);
        break;

      case 'create_item':
        if (!params.board_id || !params.item_name) {
          throw new Error('board_id and item_name are required');
        }
        result = await createItem(
          token,
          params.board_id as string,
          params.item_name as string,
          params.group_id as string | undefined,
          params.column_values as Record<string, unknown> | undefined
        );
        break;

      case 'update_item':
        if (!params.board_id || !params.item_id || !params.column_values) {
          throw new Error('board_id, item_id, and column_values are required');
        }
        result = await updateItem(
          token,
          params.board_id as string,
          params.item_id as string,
          params.column_values as Record<string, unknown>
        );
        break;

      case 'change_status':
        if (!params.board_id || !params.item_id || !params.column_id || !params.status_label) {
          throw new Error('board_id, item_id, column_id, and status_label are required');
        }
        result = await changeStatus(
          token,
          params.board_id as string,
          params.item_id as string,
          params.column_id as string,
          params.status_label as string
        );
        break;

      case 'add_update':
        if (!params.item_id || !params.body) {
          throw new Error('item_id and body are required');
        }
        result = await addUpdate(token, params.item_id as string, params.body as string);
        break;

      case 'delete_item':
        if (!params.item_id) {
          throw new Error('item_id is required');
        }
        result = await deleteItem(token, params.item_id as string);
        break;

      case 'archive_item':
        if (!params.item_id) {
          throw new Error('item_id is required');
        }
        result = await archiveItem(token, params.item_id as string);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[MondayAPI] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
