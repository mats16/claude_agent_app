-- RLS Policies for Row Level Security
-- This file is run AFTER Drizzle Kit migrations
-- Idempotent: safe to run multiple times

-- Enable RLS on sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists, then create
DROP POLICY IF EXISTS sessions_user_policy ON sessions;
CREATE POLICY sessions_user_policy ON sessions
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Enable RLS on settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists, then create
DROP POLICY IF EXISTS settings_user_policy ON settings;
CREATE POLICY settings_user_policy ON settings
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Enable RLS on oauth_tokens
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists, then create
DROP POLICY IF EXISTS oauth_tokens_user_policy ON oauth_tokens;
CREATE POLICY oauth_tokens_user_policy ON oauth_tokens
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));
