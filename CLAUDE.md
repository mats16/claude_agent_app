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

# Databricks Apps deployment
databricks bundle validate
databricks bundle deploy -t dev   # Development
databricks bundle deploy -t prod  # Production
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
- `DEFAULT_USER_ID` - User ID for local development (when x-forwarded-user header not present)
- `DEFAULT_USER_EMAIL` - User email for local development (when x-forwarded-email header not present)

## Database Schema

Tables defined in `app/backend/db/schema.ts`:
- `users` - User records (id, email)
- `sessions` - Chat sessions with foreign key to users (includes `cwd` for working directory)
- `events` - Session messages/events
- `settings` - User settings (access token, config sync)

### Row Level Security (RLS)
`sessions` and `settings` tables have RLS enabled. Queries use `withUserContext()` helper to set `app.current_user_id`:
```typescript
await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
```

Migration: `app/backend/db/migrations/0001_init.sql` (run with `npm run db:migrate`)

## Key Concepts

### Authentication Flow
- **Production**: Service Principal OIDC token + user token from `x-forwarded-access-token` header (Databricks Apps provides this)
- **Development**: Uses `DATABRICKS_TOKEN` as fallback

### Workspace Permission Check
`GET /api/v1/users/me` checks SP permission by attempting to create `.claude` directory via `workspace/mkdirs` API. Returns `hasWorkspacePermission: boolean`.

### WebSocket Communication
The frontend connects via WebSocket for real-time streaming. SDK messages flow:
1. Client sends `{ type: "user_message", content, model }`
2. Server streams SDK events: `system` (init), `assistant` (text/tool_use), `user` (tool_result), `result` (completion)
3. Frontend converts SDK messages to display format with tool_use_id matching for parallel tool execution

### Agent Tools
Configured in `app/backend/agent/index.ts`:
- Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch

### Workspace Sync
Sync between local storage and Databricks Workspace uses Databricks CLI commands defined in `app/backend/utils/databricks.ts`:

**Pull (workspace → local)**: New session creation triggers background workspace pull in `app/backend/app.ts` (non-blocking):
- Uses `databricks workspace export-dir` command
- Runs in background via fire-and-forget pattern
- Agent starts immediately without waiting for sync completion

**Push (local → workspace)**: Handled by Stop hooks in `app/backend/agent/index.ts`:
- Uses `databricks sync` command with exclusions (.gitignore, .bundle, node_modules, etc.)
- Only runs when `autoWorkspacePush` or `claudeConfigSync` flags are enabled
- Executes at session end via SDK Stop hooks

#### Sync Flags
Sync behavior is controlled by these flags passed to `processAgentRequest()`:

| Flag | Pull (new session) | Push (session end) |
|------|-------------------|---------------------|
| `autoWorkspacePush` | - | Enables workspace directory push |
| `claudeConfigSync` | Enables claude config pull | Enables claude config push |

- `autoWorkspacePush`: Session-level setting (stored in `sessions.auto_workspace_push`)
- `claudeConfigSync`: User-level setting (stored in `settings.claude_config_sync`)
- Workspace pull always uses `overwrite=true` since each session has isolated directory

#### Path Structure
- Local base: `$HOME/u` (e.g., `/Users/me/u` or `/home/app/u`)
- Claude config: `/Workspace/Users/{email}/.claude` → Local: `$HOME/u/{email}/.claude`
- Working directory: Each session gets unique isolated directory at `$HOME/u/{email}/w/{uuid}`
  - UUID is generated independently (not sessionId) before agent starts
  - Path stored in `sessions.cwd` column
  - Created API-side before processAgentRequest() call
- Optional workspace path: User can specify workspace directory to sync (can be set empty or added later via TitleEditModal)

#### Architecture Notes
- Workspace pull moved from SDK hooks to API layer to avoid JSON stream contamination
- Background sync allows fast session creation without blocking
- Agent may start before workspace files are fully synced (usually completes quickly)

## Frontend State Management

To minimize redundant API requests, shared data should be managed via React Context rather than fetching in each component.

### Contexts (`app/frontend/src/contexts/`)
- **UserContext**: User info (`/api/v1/users/me`) and settings (`/api/v1/users/me/settings`)
- **SessionsContext**: Session list (`/api/v1/sessions`) with real-time updates via WebSocket (`/api/v1/sessions/ws`)

### Guidelines
- Do NOT call the same API endpoint from multiple components. Use existing Context instead.
- When adding a new shared API call, create a Context or add to an existing one.
- Use `getSession(sessionId)` from `SessionsContext` to get session data instead of fetching `/api/v1/sessions`.
- Use `updateSessionLocally()` to update local state after PATCH requests for immediate UI updates.

## UI/Design

- **Brand Color**: `#f5a623` (Orange/Gold)
- **Font**: Noto Sans JP
- **Icons**: `@ant-design/icons`
- **i18n**: `react-i18next` with translations in `app/frontend/src/i18n/` (en, ja)
- Theme configured in `app/frontend/src/main.tsx`
- Custom styles in `app/frontend/src/App.css`
- **Favicon**: `app/frontend/public/favicon.svg` (SVG format with brand color)

### Creating Favicon from Ant Design Icons
To use an Ant Design icon as favicon, extract the SVG path from `@ant-design/icons-svg` package:

```bash
# Check icon SVG path
cat app/node_modules/@ant-design/icons-svg/es/asn/{IconName}.js
```

Apply the path to `app/frontend/public/favicon.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="64 64 896 896" focusable="false" fill="#f5a623">
  <path d="..."/>
</svg>
```

## API Endpoints

### REST
- `POST /api/v1/sessions` - Create session with initial message (workspacePath is optional)
- `GET /api/v1/sessions` - List sessions (filtered by userId via RLS)
- `GET /api/v1/sessions/:id/events` - Get session history
- `PATCH /api/v1/sessions/:id` - Update session (title, autoWorkspacePush, workspacePath)
- `POST /api/v1/users` - Create/upsert user
- `GET /api/v1/users/me` - Get user info (userId, email, workspaceHome, hasWorkspacePermission)
- `GET /api/v1/users/me/settings` - Get user settings (hasAccessToken, claudeConfigSync)
- `PATCH /api/v1/users/me/settings` - Update user settings (accessToken, claudeConfigSync)

### WebSocket
- `/api/v1/sessions/ws` - Real-time session list updates (notifies on session creation)
- `/api/v1/sessions/:sessionId/ws` - Connect to existing session for streaming

## Frontend Routes

- `/` - Home page (create new session via Sidebar)
- `/sessions/:sessionId` - Chat page

## Important Files

### Backend Core
- `app/backend/app.ts` - Fastify server, REST/WebSocket endpoints, session creation with workspace pull
- `app/backend/agent/index.ts` - Claude Agent SDK configuration, Stop hooks for workspace push
- `app/backend/utils/databricks.ts` - Databricks CLI wrapper functions (`workspacePull`, `workspacePush`)

### Database Layer
- `app/backend/db/schema.ts` - Drizzle ORM table definitions
- `app/backend/db/sessions.ts` - Session queries with RLS support
- `app/backend/db/users.ts` - User CRUD operations
- `app/backend/db/settings.ts` - User settings operations
- `app/backend/db/migrations/` - SQL migration files with RLS policies

### Frontend Core
- `app/frontend/src/hooks/useAgent.ts` - WebSocket handling, SDK message parsing
- `app/frontend/src/contexts/SessionsContext.tsx` - Session list state with real-time updates
- `app/frontend/src/contexts/UserContext.tsx` - User info and settings state
- `app/frontend/src/pages/SessionPage.tsx` - Chat UI with message streaming
- `app/frontend/src/components/MessageRenderer.tsx` - Tool output rendering
- `app/frontend/src/components/Sidebar.tsx` - Session creation UI
