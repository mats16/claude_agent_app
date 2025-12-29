-- Session Management Refactoring Migration
-- Changes session ID format from UUID to TypeID (session_xxx)
-- Removes stub and agentLocalPath columns (derived from Session model)
-- Adds claude_code_session_id column

-- WARNING: This migration deletes all existing session and event data!
-- Backup your data before running this migration.

-- Drop dependent tables first (events references sessions)
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS sessions;

-- Recreate sessions table with new schema
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,  -- TypeID format: session_xxx
  claude_code_session_id TEXT,  -- Claude Code internal session ID
  title TEXT,
  summary TEXT,
  model TEXT NOT NULL,
  workspace_path TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_auto_push BOOLEAN NOT NULL DEFAULT FALSE,
  app_auto_deploy BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Recreate events table
CREATE TABLE events (
  uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  message JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Recreate indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_events_session_id ON events(session_id);
CREATE INDEX idx_events_session_seq ON events(session_id, seq);

-- Enable RLS and recreate policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_user_policy ON sessions
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));
