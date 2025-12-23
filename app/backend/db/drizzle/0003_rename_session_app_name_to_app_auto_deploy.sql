ALTER TABLE "sessions" DROP COLUMN IF EXISTS "session_app_name";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "app_auto_deploy" boolean DEFAULT false NOT NULL;
