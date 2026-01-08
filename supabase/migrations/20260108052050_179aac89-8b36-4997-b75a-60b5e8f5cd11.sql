-- Add action_security_overrides JSON column to store per-user tier customizations
ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS action_security_overrides JSONB DEFAULT '{}'::jsonb;

-- Add failed_security_attempts tracking for rate limiting
ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS failed_security_attempts INTEGER DEFAULT 0;

ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS security_lockout_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN public.user_preferences.action_security_overrides IS 'User customizations for action security tiers. Keys are action IDs, values are tier numbers (1-5) or "blocked"';
COMMENT ON COLUMN public.user_preferences.failed_security_attempts IS 'Count of failed security confirmations for rate limiting';
COMMENT ON COLUMN public.user_preferences.security_lockout_until IS 'Timestamp until which user is locked out due to failed attempts';