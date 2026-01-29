import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface IntegrationStatus {
  connected: boolean;
  providerEmail?: string;
  scopes?: string[];
}

// 5 minutes staleTime for instant navigation
const STALE_TIME = 5 * 60 * 1000;

async function fetchGoogleStatus(): Promise<IntegrationStatus> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { connected: false };

  console.log('[IntegrationStatus] Checking Google for user:', user.id.slice(0, 8));

  // Query user_integrations table
  const { data, error } = await supabase
    .from('user_integrations')
    .select('provider_email, scopes')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .maybeSingle();

  if (error || !data) {
    console.log('[IntegrationStatus] Google not connected');
    return { connected: false };
  }

  // Verify tokens exist
  const { data: tokenData } = await supabase
    .from('encrypted_integration_tokens')
    .select('token_type')
    .eq('user_id', user.id)
    .eq('provider', 'google');

  const tokenTypes = tokenData?.map(t => t.token_type) || [];
  if (!tokenTypes.includes('access_token')) {
    console.log('[IntegrationStatus] Google missing access_token');
    return { connected: false };
  }

  console.log('[IntegrationStatus] Google connected:', data.provider_email);
  return {
    connected: true,
    providerEmail: data.provider_email || undefined,
    scopes: data.scopes || [],
  };
}

async function fetchMondayStatus(): Promise<IntegrationStatus> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { connected: false };

  console.log('[IntegrationStatus] Checking Monday for user:', user.id.slice(0, 8));

  // Query user_integrations table
  const { data, error } = await supabase
    .from('user_integrations')
    .select('provider_email')
    .eq('user_id', user.id)
    .eq('provider', 'monday')
    .maybeSingle();

  if (error || !data) {
    console.log('[IntegrationStatus] Monday not connected');
    return { connected: false };
  }

  // Verify tokens exist
  const { data: tokenData } = await supabase
    .from('encrypted_integration_tokens')
    .select('token_type')
    .eq('user_id', user.id)
    .eq('provider', 'monday');

  const tokenTypes = tokenData?.map(t => t.token_type) || [];
  if (!tokenTypes.includes('access_token')) {
    console.log('[IntegrationStatus] Monday missing access_token');
    return { connected: false };
  }

  console.log('[IntegrationStatus] Monday connected:', data.provider_email);
  return {
    connected: true,
    providerEmail: data.provider_email || undefined,
  };
}

// Fetch ALL integrations in parallel
async function fetchAllIntegrations() {
  console.log('[IntegrationStatus] Fetching ALL integrations in parallel...');
  const startTime = Date.now();

  const [google, monday] = await Promise.all([
    fetchGoogleStatus(),
    fetchMondayStatus(),
  ]);

  console.log('[IntegrationStatus] All integrations fetched in', Date.now() - startTime, 'ms');
  return { google, monday };
}

export function useIntegrationStatus() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['integrations-status'],
    queryFn: fetchAllIntegrations,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME * 2,
    refetchOnWindowFocus: false,
  });

  const invalidate = () => {
    console.log('[IntegrationStatus] Invalidating cache...');
    queryClient.invalidateQueries({ queryKey: ['integrations-status'] });
  };

  return {
    google: query.data?.google ?? { connected: false },
    monday: query.data?.monday ?? { connected: false },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    invalidate,
  };
}
