-- Performance indexes for faster dashboard and integration queries
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_provider ON user_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_encrypted_tokens_user_provider ON encrypted_integration_tokens(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_user_id ON contact_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_followup ON contact_profiles(user_id, next_followup_date);
CREATE INDEX IF NOT EXISTS idx_email_tracking_user_id ON email_tracking(user_id);