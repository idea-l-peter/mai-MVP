-- Create user_integrations table (stores metadata and vault secret references)
CREATE TABLE public.user_integrations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token_secret_id UUID,
    refresh_token_secret_id UUID,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    scopes TEXT[],
    provider_user_id TEXT,
    provider_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own integrations"
ON public.user_integrations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integrations"
ON public.user_integrations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integrations"
ON public.user_integrations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integrations"
ON public.user_integrations FOR DELETE
USING (auth.uid() = user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger
CREATE TRIGGER update_user_integrations_updated_at
BEFORE UPDATE ON public.user_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to store a token in vault and return the secret_id
CREATE OR REPLACE FUNCTION public.store_integration_token(
    p_user_id UUID,
    p_provider TEXT,
    p_token_type TEXT,
    p_token_value TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id UUID;
    v_secret_name TEXT;
BEGIN
    -- Verify the caller is the owner
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    -- Create unique secret name
    v_secret_name := p_user_id::TEXT || '_' || p_provider || '_' || p_token_type;
    
    -- Delete existing secret with same name if exists
    DELETE FROM vault.secrets WHERE name = v_secret_name;
    
    -- Insert new secret into vault
    INSERT INTO vault.secrets (name, secret)
    VALUES (v_secret_name, p_token_value)
    RETURNING id INTO v_secret_id;
    
    RETURN v_secret_id;
END;
$$;

-- Function to retrieve a decrypted token from vault
CREATE OR REPLACE FUNCTION public.get_integration_token(
    p_user_id UUID,
    p_secret_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_token TEXT;
BEGIN
    -- Verify the caller is the owner
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    -- Get decrypted secret
    SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE id = p_secret_id;
    
    RETURN v_token;
END;
$$;

-- Function to delete a token from vault
CREATE OR REPLACE FUNCTION public.delete_integration_token(
    p_user_id UUID,
    p_secret_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
    -- Verify the caller is the owner
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;

-- Index for faster lookups
CREATE INDEX idx_user_integrations_user_provider ON public.user_integrations(user_id, provider);