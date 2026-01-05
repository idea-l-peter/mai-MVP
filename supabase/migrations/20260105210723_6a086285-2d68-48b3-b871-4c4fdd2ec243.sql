-- Fix user_integrations: Drop restrictive policies and create permissive ones
DROP POLICY IF EXISTS "Users can view their own integrations" ON user_integrations;
DROP POLICY IF EXISTS "Users can delete their own integrations" ON user_integrations;
DROP POLICY IF EXISTS "Users can insert their own integrations" ON user_integrations;
DROP POLICY IF EXISTS "Users can update their own integrations" ON user_integrations;

CREATE POLICY "Users can view their own integrations" ON user_integrations
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integrations" ON user_integrations
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integrations" ON user_integrations
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integrations" ON user_integrations
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix encrypted_integration_tokens: Drop restrictive policies and add all needed permissive ones
DROP POLICY IF EXISTS "Users can view own tokens" ON encrypted_integration_tokens;
DROP POLICY IF EXISTS "Users can delete own tokens" ON encrypted_integration_tokens;

CREATE POLICY "Users can view own tokens" ON encrypted_integration_tokens
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens" ON encrypted_integration_tokens
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens" ON encrypted_integration_tokens
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens" ON encrypted_integration_tokens
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix allowed_domains: Change SELECT to admin only
DROP POLICY IF EXISTS "Anyone can view allowed domains" ON allowed_domains;

CREATE POLICY "Admins can view allowed domains" ON allowed_domains
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix user_roles: Add SELECT policy for users to view their own roles + admins
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;

CREATE POLICY "Users can view own roles or admins can view all" ON user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));