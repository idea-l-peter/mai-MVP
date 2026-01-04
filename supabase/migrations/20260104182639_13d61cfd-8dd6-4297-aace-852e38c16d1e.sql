-- Create table for encrypted tokens (application-level encryption)
CREATE TABLE public.encrypted_integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  token_type TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider, token_type)
);

-- Enable RLS
ALTER TABLE public.encrypted_integration_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies (service_role bypasses RLS automatically)
CREATE POLICY "Users can view own tokens"
  ON public.encrypted_integration_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON public.encrypted_integration_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Update trigger for updated_at
CREATE TRIGGER update_encrypted_tokens_updated_at
  BEFORE UPDATE ON public.encrypted_integration_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();