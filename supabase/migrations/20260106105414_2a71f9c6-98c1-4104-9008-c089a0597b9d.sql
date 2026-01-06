-- Fix SECURITY DEFINER functions to remove dangerous service role detection logic
-- Service role calls naturally bypass these function checks when using service role client

-- Recreate store_integration_token with strict owner-only check
CREATE OR REPLACE FUNCTION public.store_integration_token(p_user_id uuid, p_provider text, p_token_type text, p_token_value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id UUID;
    v_secret_name TEXT;
BEGIN
    -- Strict owner-only check - service role bypasses this naturally
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: can only store tokens for yourself';
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

-- Recreate get_integration_token with strict owner-only check
CREATE OR REPLACE FUNCTION public.get_integration_token(p_user_id uuid, p_secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_token TEXT;
BEGIN
    -- Strict owner-only check - service role bypasses this naturally
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: can only access your own tokens';
    END IF;
    
    SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE id = p_secret_id;
    
    RETURN v_token;
END;
$$;

-- Recreate delete_integration_token with strict owner-only check
CREATE OR REPLACE FUNCTION public.delete_integration_token(p_user_id uuid, p_secret_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
    -- Strict owner-only check - service role bypasses this naturally
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: can only delete your own tokens';
    END IF;
    
    DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;