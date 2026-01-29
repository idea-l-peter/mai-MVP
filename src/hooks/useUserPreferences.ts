import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SecurityTier } from '@/lib/security-tiers';

export interface UserPreferences {
  id: string;
  user_id: string;
  display_name: string | null;
  emoji_confirmations_enabled: boolean;
  security_phrase_color: string | null;
  security_phrase_object: string | null;
  security_phrase_emoji: string | null;
  observed_holidays: string[] | null;
  action_security_overrides: Record<string, SecurityTier> | null;
  failed_security_attempts: number;
  security_lockout_until: string | null;
}

const DEFAULT_PREFERENCES: Omit<UserPreferences, 'id' | 'user_id'> = {
  display_name: null,
  emoji_confirmations_enabled: true,
  security_phrase_color: null,
  security_phrase_object: null,
  security_phrase_emoji: null,
  observed_holidays: [],
  action_security_overrides: {},
  failed_security_attempts: 0,
  security_lockout_until: null,
};

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPreferences(null);
        setIsLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setPreferences(data as UserPreferences);
      } else {
        // Create default preferences
        const { data: newData, error: insertError } = await supabase
          .from('user_preferences')
          .insert({ user_id: user.id, ...DEFAULT_PREFERENCES })
          .select()
          .single();

        if (insertError) throw insertError;
        setPreferences(newData as UserPreferences);
      }
    } catch (err) {
      console.error('Error fetching preferences:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch preferences');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreferences = useCallback(async (updates: Partial<Omit<UserPreferences, 'id' | 'user_id'>>) => {
    if (!preferences) return false;

    try {
      const { error: updateError } = await supabase
        .from('user_preferences')
        .update(updates)
        .eq('id', preferences.id);

      if (updateError) throw updateError;

      setPreferences(prev => prev ? { ...prev, ...updates } : null);
      return true;
    } catch (err) {
      console.error('Error updating preferences:', err);
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
      return false;
    }
  }, [preferences]);

  return {
    preferences,
    isLoading,
    error,
    updatePreferences,
    refetch: fetchPreferences,
  };
}
