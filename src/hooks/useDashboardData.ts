import { useState, useEffect, useCallback } from 'react';
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

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const { data: response, error: fetchError } = await supabase.functions.invoke('dashboard-data', {
        body: { user_id: user.id },
      });

      if (fetchError) {
        throw fetchError;
      }

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch dashboard data');
      }

      setData(response.data);
    } catch (err) {
      console.error('Dashboard data error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}