-- Migration: 0005_remove_access_token
-- Remove access_token column from settings table (no longer used)

ALTER TABLE settings DROP COLUMN IF EXISTS access_token;
