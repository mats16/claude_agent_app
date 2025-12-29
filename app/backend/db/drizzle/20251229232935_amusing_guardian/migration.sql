ALTER TABLE "sessions" ADD COLUMN "claude_code_session_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "databricks_workspace_path" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "databricks_workspace_auto_push" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "agent_local_path" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "stub";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "workspace_path";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "workspace_auto_push";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "app_auto_deploy";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "agentLocalPath";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_claude_code_session_id_key" UNIQUE("claude_code_session_id");