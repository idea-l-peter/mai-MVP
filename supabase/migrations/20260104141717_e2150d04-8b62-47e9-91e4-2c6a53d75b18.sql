-- Update store_integration_token to allow service role calls
-- Service role is trusted and can store tokens on behalf of any user
CREATE OR REPLACE FUNCTION public.store_integration_token(p_user_id uuid, p_provider text, p_token_type text, p_token_value text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
    v_secret_id UUID;
    v_secret_name TEXT;
    v_is_service_role BOOLEAN;
BEGIN
    -- Check if this is a service role call (auth.uid() is NULL but we have a valid user_id)
    -- Service role is trusted for server-side operations like OAuth callbacks
    v_is_service_role := (auth.uid() IS NULL AND p_user_id IS NOT NULL);
    
    -- If not service role, verify the caller is the owner
    IF NOT v_is_service_role AND (auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
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
$function$;

-- Also update get_integration_token and delete_integration_token for consistency
CREATE OR REPLACE FUNCTION public.get_integration_token(p_user_id uuid, p_secret_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
    v_token TEXT;
    v_is_service_role BOOLEAN;
BEGIN
    v_is_service_role := (auth.uid() IS NULL AND p_user_id IS NOT NULL);
    
    IF NOT v_is_service_role AND (auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE id = p_secret_id;
    
    RETURN v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_integration_token(p_user_id uuid, p_secret_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
    v_is_service_role BOOLEAN;
BEGIN
    v_is_service_role := (auth.uid() IS NULL AND p_user_id IS NOT NULL);
    
    IF NOT v_is_service_role AND (auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$function$;