-- Initial schema migration
-- WARNING: This migration drops all existing tables and recreates them
-- All data will be lost

-- ============================================
-- Drop existing tables (in reverse dependency order)
-- ============================================
DROP TABLE IF EXISTS oauth_tokens CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- Users table
-- ============================================
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- Sessions table
-- ============================================
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  stub TEXT NOT NULL UNIQUE,
  title TEXT,
  model TEXT NOT NULL,
  workspace_path TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_auto_push BOOLEAN DEFAULT FALSE NOT NULL,
  app_auto_deploy BOOLEAN DEFAULT FALSE NOT NULL,
  cwd TEXT NOT NULL,
  is_archived BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);

-- ============================================
-- Events table
-- ============================================
CREATE TABLE events (
  uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  message JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_events_session_id ON events (session_id);
CREATE INDEX idx_events_session_seq ON events (session_id, seq);

-- ============================================
-- Settings table
-- ============================================
CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  claude_config_auto_push BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- OAuth Tokens table
-- ============================================
CREATE TABLE oauth_tokens (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Sessions RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_user_policy ON sessions
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Settings RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_user_policy ON settings
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- OAuth Tokens RLS
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY oauth_tokens_user_policy ON oauth_tokens
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));
