-- Add summary column to sessions table
-- Stores auto-generated session summary from structured output

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS summary TEXT;
