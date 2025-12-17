-- Rename auto_sync column to auto_workspace_push (if exists)
-- This migration is idempotent and safe to run multiple times
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'auto_sync'
  ) THEN
    ALTER TABLE sessions RENAME COLUMN auto_sync TO auto_workspace_push;
    RAISE NOTICE 'Renamed auto_sync to auto_workspace_push';
  ELSE
    RAISE NOTICE 'Column auto_sync does not exist, skipping rename';
  END IF;
END $$;

-- Fix claude_config_sync default value (should be TRUE, not FALSE)
ALTER TABLE settings ALTER COLUMN claude_config_sync SET DEFAULT TRUE;
