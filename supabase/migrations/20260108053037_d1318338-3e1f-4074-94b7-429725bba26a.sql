-- Create verification_codes table for 2FA
CREATE TABLE public.verification_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for lookups
CREATE INDEX idx_verification_codes_user_action ON public.verification_codes(user_id, action_type);

-- Add index for cleanup of expired codes
CREATE INDEX idx_verification_codes_expires ON public.verification_codes(expires_at);

-- Enable RLS
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- Only service role can access verification codes (no user policies)
-- This ensures codes are only accessed through edge functions