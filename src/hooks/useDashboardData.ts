import { useState, useEffect, useCallback, useRef } from 'react';
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

// Cache configuration
const CACHE_KEY = 'mai_dashboard_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedData {
  data: DashboardData;
  timestamp: number;
}

function getCachedData(): DashboardData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const parsed: CachedData = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - parsed.timestamp < CACHE_EXPIRY_MS) {
      console.log('[Dashboard] Using cached data, age:', Math.round((now - parsed.timestamp) / 1000), 'seconds');
      return parsed.data;
    }
    
    console.log('[Dashboard] Cache expired');
    return null;
  } catch {
    return null;
  }
}

function setCachedData(data: DashboardData): void {
  try {
    const cacheEntry: CachedData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
  } catch (e) {
    console.warn('[Dashboard] Failed to cache data:', e);
  }
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<LoadingState>({
    full: true,
    gmail: false,
    calendar: false,
    monday: false,
    contacts: false,
  });
  const [error, setError] = useState<string | null>(null);
  const fetchInProgress = useRef(false);

  const fetchData = useCallback(async (skipCache = false) => {
    // Prevent duplicate fetches
    if (fetchInProgress.current) {
      console.log('[Dashboard] Fetch already in progress, skipping');
      return;
    }

    // Try to use cached data first (only on initial load, not manual refresh)
    if (!skipCache) {
      const cached = getCachedData();
      if (cached) {
        setData(cached);
        setLoading(prev => ({ ...prev, full: false }));
        // Still refresh in background after a short delay
        setTimeout(() => fetchData(true), 100);
        return;
      }
    }

    fetchInProgress.current = true;
    setLoading(prev => ({ ...prev, full: true }));
    setError(null);

    const startTime = Date.now();
    console.log('[Dashboard] Starting data fetch...');

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('[Dashboard] Auth error:', authError);
        setError('Authentication error');
        setLoading(prev => ({ ...prev, full: false }));
        fetchInProgress.current = false;
        return;
      }
      
      if (!user) {
        console.log('[Dashboard] No authenticated user');
        setError('Not authenticated');
        setLoading(prev => ({ ...prev, full: false }));
        fetchInProgress.current = false;
        return;
      }

      console.log('[Dashboard] Fetching data for authenticated user');

      const { data: response, error: fetchError } = await supabase.functions.invoke('dashboard-data', {
        body: {},
      });

      const elapsed = Date.now() - startTime;
      console.log('[Dashboard] Response received in', elapsed, 'ms');

      if (fetchError) {
        console.error('[Dashboard] Fetch error:', fetchError);
        throw fetchError;
      }

      if (!response?.success) {
        console.error('[Dashboard] API error:', response?.error);
        throw new Error(response?.error || 'Failed to fetch dashboard data');
      }

      console.log('[Dashboard] Data loaded successfully:', {
        gmail: response.data.gmail?.connected,
        calendar: response.data.calendar?.connected,
        monday: response.data.monday?.connected,
        followups: response.data.contacts?.followupsDue?.length,
        elapsed: elapsed + 'ms',
      });

      setData(response.data);
      setCachedData(response.data);
    } catch (err) {
      console.error('[Dashboard] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(prev => ({ ...prev, full: false }));
      fetchInProgress.current = false;
    }
  }, []);

  const refreshSection = useCallback(async (section: DashboardSection) => {
    setLoading(prev => ({ ...prev, [section]: true }));

    try {
      const { data: response, error: fetchError } = await supabase.functions.invoke('dashboard-data', {
        body: { section },
      });

      if (fetchError) {
        console.error(`[Dashboard] ${section} refresh error:`, fetchError);
        throw fetchError;
      }

      if (!response?.success) {
        throw new Error(response?.error || `Failed to refresh ${section}`);
      }

      console.log(`[Dashboard] ${section} refreshed successfully`);

      // Merge partial data into existing state and update cache
      setData(prev => {
        const newData = prev ? { ...prev, ...response.data } : response.data;
        setCachedData(newData);
        return newData;
      });
    } catch (err) {
      console.error(`[Dashboard] ${section} refresh error:`, err);
      // Don't set global error for section refresh failures
    } finally {
      setLoading(prev => ({ ...prev, [section]: false }));
    }
  }, []);

  // Clear cache utility
  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    console.log('[Dashboard] Cache cleared');
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    data, 
    loading, 
    error, 
    refresh: () => fetchData(true), // Force skip cache on manual refresh
    refreshSection,
    clearCache,
  };
}
