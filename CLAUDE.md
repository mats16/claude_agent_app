# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A web application that serves as a Claude Code-like coding agent running on Databricks Apps. Users interact with an AI assistant that can execute commands, read/write files, and search code within a Databricks Workspace.

## Architecture

- **Frontend**: React + Vite + Ant Design v5 (`app/frontend/`)
- **Backend**: Node.js + Fastify + WebSocket (`app/backend/`)
- **Agent**: Claude Agent SDK TypeScript V2 (`app/backend/agent/`)
- **Database**: PostgreSQL (Neon) with Drizzle ORM (`app/backend/db/`)
- **Shared Types**: `app/shared/` (workspace package `@app/shared`)

This is a Turborepo monorepo with three workspaces: `shared`, `frontend`, `backend`.

## Commands

```bash
# Development (starts both frontend and backend)
cd app
npm install
npm run dev

# Build all packages
npm run build

# Format code
npm run format
npm run format:check

# Database migration
npm run db:migrate
# Or manually: psql $DB_URL -f app/backend/db/migrations/0001_init.sql
```

Development servers:
- Backend: http://localhost:8000
- Frontend: http://localhost:5173

## Environment Variables

### Required
- `DATABRICKS_HOST` - Workspace URL (e.g., `your-workspace.cloud.databricks.com`)
- `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET` - Service Principal OAuth2 (production)

### Optional
- `DATABRICKS_TOKEN` - PAT for development (fallback)
- `PORT` - Backend port (default: 8000)
- `DB_URL` - PostgreSQL connection string

## Database Schema

Tables defined in `app/backend/db/schema.ts`:
- `users` - User records (id, email)
- `sessions` - Chat sessions with foreign key to users
- `events` - Session messages/events
- `settings` - User settings (access token, config sync)

### Row Level Security (RLS)
Sessions table has RLS enabled. Queries use `withUserContext()` helper to set `app.current_user_id`:
```typescript
await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
```

Migrations are in `app/backend/db/migrations/`. Run with `npm run db:migrate`.

## Key Concepts

### Authentication Flow
- **Production**: Service Principal OIDC token + user token from `x-forwarded-access-token` header (Databricks Apps provides this)
- **Development**: Uses `DATABRICKS_TOKEN` as fallback

### WebSocket Communication
The frontend connects via WebSocket for real-time streaming. SDK messages flow:
1. Client sends `{ type: "user_message", content, model }`
2. Server streams SDK events: `system` (init), `assistant` (text/tool_use), `user` (tool_result), `result` (completion)
3. Frontend converts SDK messages to display format with tool_use_id matching for parallel tool execution

### Agent Tools
Configured in `app/backend/agent/index.ts`:
- Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch

### Workspace Sync
- Sessions can sync files between local storage and Databricks Workspace
- Auto-sync imports changes back on successful agent result
- Default workspace path: `/Workspace/Users/{email}/sandbox`

## UI/Design

- **Brand Color**: `#f5a623` (Orange/Gold)
- **Font**: Noto Sans JP
- **Icons**: `@ant-design/icons`
- Theme configured in `app/frontend/src/main.tsx`
- Custom styles in `app/frontend/src/App.css`

## API Endpoints

### REST
- `POST /api/v1/sessions` - Create session with initial message
- `GET /api/v1/sessions` - List sessions (filtered by userId via RLS)
- `GET /api/v1/sessions/:id/events` - Get session history
- `PATCH /api/v1/sessions/:id` - Update session (title, autoSync)
- `POST /api/v1/users` - Create/upsert user
- `GET /api/v1/users/me` - Get user info (userId, email, workspaceHome)
- `GET /api/v1/users/me/settings` - Get user settings (hasAccessToken, claudeConfigSync)
- `PATCH /api/v1/users/me/settings` - Update user settings

### WebSocket
- `/api/v1/sessions/:sessionId/ws` - Connect to existing session for streaming

## Frontend Routes

- `/` - Home page (create new session via Sidebar)
- `/sessions/:sessionId` - Chat page

## Important Files

- `app/backend/app.ts` - Fastify server, REST/WebSocket endpoints
- `app/backend/agent/index.ts` - Claude Agent SDK configuration
- `app/backend/db/schema.ts` - Drizzle ORM table definitions
- `app/backend/db/sessions.ts` - Session queries with RLS support
- `app/backend/db/users.ts` - User CRUD operations
- `app/backend/db/settings.ts` - User settings operations
- `app/frontend/src/hooks/useAgent.ts` - WebSocket handling, SDK message parsing
- `app/frontend/src/components/MessageRenderer.tsx` - Tool output rendering
- `app/frontend/src/pages/SessionPage.tsx` - Chat UI
- `app/frontend/src/components/Sidebar.tsx` - Session creation UI
