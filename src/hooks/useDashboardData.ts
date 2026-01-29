import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  birthday?: string;
  anniversaryDate?: string;
}

export interface DashboardData {
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

export type DashboardSection = 'gmail' | 'calendar' | 'monday' | 'contacts';

export interface LoadingState {
  full: boolean;
  gmail: boolean;
  calendar: boolean;
  monday: boolean;
  contacts: boolean;
}

// Query key for dashboard data
export const DASHBOARD_QUERY_KEY = ['dashboard-data'];

// 2 minutes staleTime - won't refetch if data is fresh
const STALE_TIME = 2 * 60 * 1000;

// Fetch function for dashboard data
async function fetchDashboardData(): Promise<DashboardData> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError) {
    console.error('[Dashboard] Auth error:', authError);
    throw new Error('Authentication error');
  }
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data: response, error: fetchError } = await supabase.functions.invoke('dashboard-data', {
    body: {},
  });

  if (fetchError) {
    console.error('[Dashboard] Fetch error:', fetchError);
    throw fetchError;
  }

  if (!response?.success) {
    console.error('[Dashboard] API error:', response?.error);
    throw new Error(response?.error || 'Failed to fetch dashboard data');
  }

  return response.data;
}

// Fetch function for a specific section
async function fetchDashboardSection(section: DashboardSection): Promise<Partial<DashboardData>> {
  const { data: response, error: fetchError } = await supabase.functions.invoke('dashboard-data', {
    body: { section },
  });

  if (fetchError) {
    console.error(`[Dashboard] ${section} fetch error:`, fetchError);
    throw fetchError;
  }

  if (!response?.success) {
    throw new Error(response?.error || `Failed to fetch ${section}`);
  }

  return response.data;
}

export function useDashboardData() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: fetchDashboardData,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME * 2,
    refetchOnWindowFocus: false,
  });

  // Refresh a specific section and merge into cache
  const refreshSection = async (section: DashboardSection) => {
    try {
      const sectionData = await fetchDashboardSection(section);
      
      // Merge section data into existing cache
      queryClient.setQueryData<DashboardData>(DASHBOARD_QUERY_KEY, (old) => {
        if (!old) return old;
        return { ...old, ...sectionData };
      });
    } catch (err) {
      console.error(`[Dashboard] ${section} refresh error:`, err);
    }
  };

  // Build loading state object for backwards compatibility
  const loading: LoadingState = {
    full: query.isLoading,
    gmail: false,
    calendar: false,
    monday: false,
    contacts: false,
  };

  return { 
    data: query.data ?? null, 
    loading, 
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Failed to load') : null,
    refresh: () => query.refetch(),
    refreshSection,
    clearCache: () => queryClient.removeQueries({ queryKey: DASHBOARD_QUERY_KEY }),
    isFetching: query.isFetching,
  };
}

// Export the fetch function for prefetching
export { fetchDashboardData };
