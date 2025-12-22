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

# Database commands (Drizzle Kit)
npm run db:migrate      # Run migrations + apply RLS policies
npm run db:generate     # Generate migration from schema changes
npm run db:baseline     # Mark existing DB as baseline (for existing databases)
npm run db:studio       # Open Drizzle Studio for DB inspection

# Databricks Apps deployment
databricks bundle validate
databricks bundle deploy -t dev   # Development
databricks bundle deploy -t prod  # Production

# Secrets management
databricks secrets create-scope claude_agent              # Create scope
databricks secrets put-secret claude_agent db_url         # Set DB_URL secret
databricks secrets list-secrets claude_agent              # List secrets
```

### Databricks Apps Secrets Configuration

Secrets are configured via two files:

**1. DAB Resource Definition** (`resources/claude_agent.app.yml`):
```yaml
resources:
  - name: secret
    secret:
      scope: claude_agent    # Databricks secret scope
      key: db_url            # Secret key name
      permission: READ
```

**2. App Runtime Configuration** (`app/app.yaml`):
```yaml
env:
  - name: DB_URL
    valueFrom: secret        # References the resource name above
```

The secret is injected as `DB_URL` environment variable at runtime.

Development servers:
- Backend: http://localhost:8000
- Frontend: http://localhost:5173

## Environment Variables

### Required
- `DATABRICKS_HOST` - Workspace URL (e.g., `your-workspace.cloud.databricks.com`)
- `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET` - Service Principal OAuth2 (production)

### Local Development
For local development, the Vite proxy injects Databricks headers from environment variables:
- `DATABRICKS_TOKEN` - Personal Access Token (injected as `x-forwarded-access-token`)
- `DATABRICKS_USER_NAME` - User display name (injected as `X-Forwarded-Preferred-Username`)
- `DATABRICKS_USER_ID` - User ID from IdP (injected as `X-Forwarded-User`)
- `DATABRICKS_USER_EMAIL` - User email (injected as `X-Forwarded-Email`)

Backend always expects these headers and does not use fallback values, ensuring consistency between local and production environments.

### Required (Production)
- `DB_URL` - PostgreSQL connection string (required, throws error if not set)

### Optional
- `PORT` - Backend port (default: 8000)

### SQL Warehouse (MCP Tools)
- `WAREHOUSE_ID_2XS` - 2X-Small SQL Warehouse ID (default for `run_sql`)
- `WAREHOUSE_ID_XS` - X-Small SQL Warehouse ID
- `WAREHOUSE_ID_S` - Small SQL Warehouse ID

## Database Schema

Tables defined in `app/backend/db/schema.ts`:
- `users` - User records (id, email)
- `sessions` - Chat sessions with foreign key to users (includes `cwd` for working directory, `is_archived` for archive status)
- `events` - Session messages/events (SDKMessage stored as JSONB in `message` column)
- `settings` - User settings (config sync)

### Row Level Security (RLS)
`sessions` and `settings` tables have RLS enabled. Queries use `withUserContext()` helper to set `app.current_user_id`:
```typescript
await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
```

### Migration Structure
- Migrations managed by Drizzle Kit in `app/backend/db/drizzle/`
- RLS policies applied separately via `app/backend/db/custom/rls-policies.sql`
- Migration runner: `app/backend/db/migrate.ts` (runs Drizzle migrations + RLS)

## Key Concepts

### Authentication Flow
- **Production**: Databricks Apps automatically injects headers (`x-forwarded-user`, `x-forwarded-email`, `x-forwarded-access-token`, etc.)
- **Development**: Vite proxy injects headers from environment variables (see Local Development section)
- Backend extracts user context using `extractRequestContext()` utility from `app/backend/utils/headers.ts`
- Headers parsed:
  - `X-Forwarded-User`: User identifier from IdP (required)
  - `X-Forwarded-Email`: User email from IdP (required)
  - `X-Forwarded-Preferred-Username`: User display name (optional)
  - `x-forwarded-access-token`: User access token (optional)
  - `X-Request-Id`: Request UUID (optional)

### Workspace Permission Check
`GET /api/v1/me` checks SP permission by attempting to create `.claude` directory via `workspace/mkdirs` API. Returns `hasWorkspacePermission: boolean`.

### WebSocket Communication
The frontend connects via WebSocket for real-time streaming. SDK messages flow:
1. Client sends `{ type: "user_message", content, model }`
2. Server streams SDK events: `system` (init), `assistant` (text/tool_use), `user` (tool_result), `result` (completion)
3. Frontend converts SDK messages to display format with tool_use_id matching for parallel tool execution

### Session Interruption
When a user interrupts a session via the stop button:
1. Frontend sends `{ type: "control_request", request: { subtype: "interrupt" } }`
2. Backend saves `control_request` event to database
3. Backend saves interrupt user message `[Request interrupted by user]`
4. Backend saves `result` event with `subtype: "interrupted"` to mark session as complete
5. Backend aborts the MessageStream to stop agent processing

The `result` event is essential for the frontend to correctly determine session state when reloading history. Without it, the UI would incorrectly show "Thinking..." for interrupted sessions.

### Agent Tools
Configured in `app/backend/agent/index.ts`:
- **Built-in**: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
- **MCP (Databricks)**: run_sql, get_warehouse_info, list_warehouses

### MCP Servers
MCP (Model Context Protocol) servers provide additional tools. Configured in `app/backend/agent/mcp/`.

**Databricks MCP** (`databricks.ts`):
- `run_sql` - Execute SQL on Databricks SQL Warehouse (SELECT, DDL, DML)
  - `query`: SQL statement
  - `size`: Warehouse size (`2xs`, `xs`, `s`) - recommended parameter
  - `warehouse_id`: Direct warehouse ID (mutually exclusive with `size`)
  - `max_rows`: Max rows to return (default: 1000, max: 10000)
  - Uses `DATABRICKS_TOKEN` (user token) for authentication
- `get_warehouse_info` - Get warehouse details via `/api/2.0/sql/warehouses/{id}`
- `list_warehouses` - List all warehouses via `/api/2.0/sql/warehouses`

MCP tool names are prefixed with `mcp__` in the frontend (e.g., `mcp__databricks__run_sql`).

### Workspace Sync
Sync between local storage and Databricks Workspace uses a fastq-based async queue (`app/backend/services/workspaceQueueService.ts`) with retry support:

**Queue Features**:
- Global queue with per-user task tracking (`getUserPendingCount(userId)`)
- Configurable concurrency (default: 3)
- Exponential backoff retry with jitter (max 3 retries)
- Graceful shutdown support (`drainQueue()` in server.ts)

**Pull (workspace → local)**: New session creation enqueues workspace pull via `enqueuePull()`:
- Uses `databricks workspace export-dir` command
- Agent starts immediately without waiting for sync completion

**Push (local → workspace)**: Handled by Stop hooks in `app/backend/agent/index.ts` via `enqueuePush()`:
- Uses `databricks sync` command with configurable exclusions
- Only runs when `autoWorkspacePush` or `claudeConfigSync` flags are enabled
- Skills/Agents CRUD operations use `replace: true` to propagate deletions to workspace

#### Sync Parameters
`enqueuePush()` accepts these parameters:
- `flags`: Custom `--exclude` flags (e.g., `claudeConfigSyncFlags`, `workspaceSyncFlags`)
- `replace`: If `true`, deletes workspace directory before sync (propagates deletions)

**Exclusion Flag Constants** (`app/backend/utils/databricks.ts`):
- `claudeConfigSyncFlags`: For `.claude` directory sync (excludes corrupted files, debug, telemetry, shell-snapshots)
- `workspaceSyncFlags`: For workspace directory sync (excludes .bundle, *.pyc, __pycache__, node_modules, .turbo)

#### Sync Behavior by Use Case

| Use Case | replace | Exclusion Flags | Reason |
|----------|---------|-----------------|--------|
| Skills CRUD | `true` | None | Propagate skill deletions to workspace |
| Agents CRUD | `true` | None | Propagate agent deletions to workspace |
| Manual backup | `true` | `claudeConfigSyncFlags` + `--full` | Complete backup with cleanup |
| Task end (claude config) | `false` | `claudeConfigSyncFlags` | Incremental sync, preserve other sessions |
| Task end (workspace) | `false` | `workspaceSyncFlags` | Incremental sync, preserve existing files |

#### Sync Flags
Sync behavior is controlled by these flags passed to `processAgentRequest()`:

| Flag | Pull (new session) | Push (session end) |
|------|-------------------|---------------------|
| `autoWorkspacePush` | - | Enables workspace directory push (requires `workspacePath`) |
| `claudeConfigSync` | Enables claude config pull | Enables claude config push |

- `autoWorkspacePush`: Session-level setting (stored in `sessions.auto_workspace_push`)
  - Automatically set to `false` when `workspacePath` is not specified (enforced in API and hooks)
  - Frontend default: `false`, automatically set to `true` when workspace path is selected
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
- API returns session_id immediately after SDK emits init message (fast response)
- Agent waits for workspace pull to complete before processing the first user message
- This is achieved by `MessageStream.waitForReady` Promise that blocks the first message yield until pull completes

### Session Archive
Sessions can be archived to hide them from the active session list without permanent deletion.

**Archive Process**:
1. User triggers archive via UI (InboxOutlined icon on hover in session list)
2. `PATCH /api/v1/sessions/:id/archive` sets `is_archived=true` in database
3. Working directory (`sessions.cwd`) is enqueued for deletion via `enqueueDelete()` in workspaceQueueService
4. If the archived session is currently displayed, UI automatically navigates to home page

**UI Behavior**:
- Default filter: "Active" (shows only non-archived sessions)
- Filter options: Active, Archived, All (FilterOutlined icon in session list header)
- Client-side filtering for instant switching without API calls
- Archived sessions displayed with grey text to distinguish from active sessions
- Archive button only shown on hover for non-archived sessions

**Technical Notes**:
- Archive is a one-way operation (no unarchive functionality)
- Directory deletion failures are logged but don't fail the archive operation
- SessionsContext fetches all sessions once and filters client-side for performance

### Claude Backup Settings
Manual backup/restore operations for Claude configuration (`.claude` directory) separate from automatic sync.

**API Endpoints**:
- `GET /api/v1/settings/claude-backup` - Get `claudeConfigSync` setting
- `PATCH /api/v1/settings/claude-backup` - Update `claudeConfigSync` setting
- `POST /api/v1/settings/claude-backup/pull` - Manual restore from workspace to local
- `POST /api/v1/settings/claude-backup/push` - Manual backup from local to workspace

**Operations**:
- **Pull (Restore)**: Downloads `/Workspace/Users/{email}/.claude` → `$HOME/u/{email}/.claude` with overwrite
- **Push (Backup)**: Uploads `$HOME/u/{email}/.claude` → `/Workspace/Users/{email}/.claude` with `replace: true` (deletes workspace directory first)
- Uses Service Principal OIDC token via `getOidcAccessToken()`
- Frontend: `SettingsModal.tsx` provides UI for manual operations and auto-backup toggle

## Frontend State Management

To minimize redundant API requests, shared data should be managed via React Context rather than fetching in each component.

### Contexts (`app/frontend/src/contexts/`)
- **UserContext**: User info (`/api/v1/me`) and settings (`/api/v1/settings`)
- **SessionsContext**: Session list (`/api/v1/sessions`) with real-time updates via WebSocket (`/api/v1/sessions/ws`)
  - Fetches all sessions once with `filter=all` for performance
  - Client-side filtering using `useMemo` for instant filter switching (Active/Archived/All)
  - Avoids redundant API calls when changing filters

### Guidelines
- Do NOT call the same API endpoint from multiple components. Use existing Context instead.
- When adding a new shared API call, create a Context or add to an existing one.
- Use `getSession(sessionId)` from `SessionsContext` to get session data instead of fetching `/api/v1/sessions`.
- Use `updateSessionLocally()` to update local state after PATCH requests for immediate UI updates.
- For performance-critical filtering or sorting, prefer client-side operations with `useMemo` over API calls.

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

#### User & Settings
- `GET /api/v1/me` - Get user info (userId, email, workspaceHome, hasWorkspacePermission)
- `GET /api/v1/settings` - Get user settings (claudeConfigSync)
- `PATCH /api/v1/settings` - Update user settings (claudeConfigSync)
- `GET /api/v1/settings/claude-backup` - Get Claude backup settings
- `PATCH /api/v1/settings/claude-backup` - Update Claude backup settings
- `POST /api/v1/settings/claude-backup/pull` - Pull (restore) Claude config from workspace
- `POST /api/v1/settings/claude-backup/push` - Push (backup) Claude config to workspace
- `GET /api/v1/settings/sp-permission` - Get service principal info

#### Skills
- `GET /api/v1/settings/skills` - List skills
- `GET /api/v1/settings/skills/:skillName` - Get skill
- `POST /api/v1/settings/skills` - Create skill
- `PATCH /api/v1/settings/skills/:skillName` - Update skill
- `DELETE /api/v1/settings/skills/:skillName` - Delete skill

#### Agents (Subagents)
- `GET /api/v1/settings/agents` - List subagents
- `GET /api/v1/settings/agents/:subagentName` - Get subagent
- `POST /api/v1/settings/agents` - Create subagent
- `PATCH /api/v1/settings/agents/:subagentName` - Update subagent
- `DELETE /api/v1/settings/agents/:subagentName` - Delete subagent

#### Preset Settings (Local)
- `GET /api/v1/preset-settings/skills` - List local preset skills
- `POST /api/v1/preset-settings/skills/:presetName/import` - Import local preset skill
- `GET /api/v1/preset-settings/agents` - List preset subagents
- `POST /api/v1/preset-settings/agents/:presetName/import` - Import preset subagent

#### GitHub Skills (Frontend Direct Access)
GitHub skills are fetched directly from the frontend without backend API:
- Source: `https://github.com/anthropics/skills` repository
- API: `https://api.github.com/repos/anthropics/skills/contents/skills` (directory list)
- Content: `https://raw.githubusercontent.com/anthropics/skills/main/skills/{name}/SKILL.md`
- Cache: 15-minute client-side cache in `useSkills.ts`
- Import: Uses existing `POST /api/v1/settings/skills` to save

#### Sessions
- `POST /api/v1/sessions` - Create session with initial message (workspacePath is optional)
- `GET /api/v1/sessions` - List sessions (filtered by userId via RLS, supports `?filter=active|archived|all`)
- `GET /api/v1/sessions/:id/events` - Get session history (paginated response format)
  ```json
  {
    "data": [SDKMessage, ...],
    "first_id": "uuid-of-first-event",
    "last_id": "uuid-of-last-event",
    "has_more": false
  }
  ```
- `PATCH /api/v1/sessions/:id` - Update session (title, autoWorkspacePush, workspacePath)
- `PATCH /api/v1/sessions/:id/archive` - Archive session (sets `is_archived=true`, deletes working directory)

#### Workspace
- `GET /api/v1/workspace` - List root workspace
- `GET /api/v1/workspace/users/:email` - List user's workspace
- `GET /api/v1/workspace/users/me` - List current user's workspace (`me` as email alias)
- `GET /api/v1/workspace/*` - List any workspace path (path converted to Databricks format internally)
- `POST /api/v1/workspace/*` - Create a directory (body: `{ object_type: "DIRECTORY" }`)

#### Queues
- `GET /api/v1/queues/status` - Get workspace sync queue status (userPendingCount, userTasks, totalPendingCount, queueStats)

### WebSocket
- `/api/v1/sessions/ws` - Real-time session list updates (notifies on session creation)
- `/api/v1/sessions/:sessionId/ws` - Connect to existing session for streaming

## Frontend Routes

- `/` - Home page (create new session via Sidebar)
- `/sessions/:sessionId` - Chat page

## Backend Structure

The backend follows Fastify best practices with separated concerns:

```
app/backend/
├── app.ts              # Fastify setup, plugin/route registration
├── server.ts           # Entry point with graceful shutdown
├── plugins/            # Fastify plugins (websocket, static, auth)
├── routes/             # Route definitions with handlers
│   ├── health/
│   └── v1/
│       ├── sessions/        # handlers.ts, index.ts, websocket.ts
│       ├── me/              # User info endpoint
│       ├── settings/        # User settings
│       │   ├── claude-backup/  # Claude config backup
│       │   ├── skills/         # Skills management
│       │   ├── agents/         # Subagents management
│       │   └── sp-permission/  # Service principal info
│       ├── preset-settings/ # Preset skills/agents
│       ├── workspace/       # Workspace listing
│       └── queues/          # Workspace sync queue status
├── services/           # Business logic layer
│   ├── sessionState.ts # In-memory session queue management
│   ├── workspaceQueueService.ts # fastq-based workspace sync queue
│   ├── skillService.ts
│   ├── subagentService.ts
│   ├── workspaceService.ts
│   ├── userService.ts
│   └── claudeBackupService.ts
├── schemas/            # Zod validation schemas
├── db/                 # Drizzle ORM (schema, queries, migrations)
├── agent/              # Claude Agent SDK configuration
│   └── mcp/            # MCP server implementations (databricks.ts)
└── utils/              # Shared utilities (databricks, headers, skills)
```

### Key Files
- `app/backend/agent/index.ts` - Claude Agent SDK configuration, MCP registration, Stop hooks for workspace push
- `app/backend/agent/mcp/databricks.ts` - Databricks MCP server (SQL, warehouse management tools)
- `app/backend/services/sessionState.ts` - In-memory state for session queues, WebSocket connections, SDK message creators (`createUserMessage`, `createResultMessage`, `createControlRequest`)
- `app/backend/services/workspaceQueueService.ts` - fastq-based async queue for workspace sync (pull, push, delete)
- `app/backend/utils/databricks.ts` - Databricks CLI wrapper functions (`workspacePull`, `workspacePush`, `deleteWorkDir`) and sync flag constants (`claudeConfigSyncFlags`, `workspaceSyncFlags`)
- `app/backend/utils/headers.ts` - Request header extraction (`extractRequestContext`)

### Database Layer
- `app/backend/db/schema.ts` - Drizzle ORM table definitions
- `app/backend/db/sessions.ts` - Session queries with RLS support
- `app/backend/db/drizzle/` - Drizzle Kit managed migrations
- `app/backend/db/custom/rls-policies.sql` - RLS policies (applied after migrations)

### Frontend Core
- `app/frontend/src/hooks/useAgent.ts` - WebSocket handling, SDK message parsing
- `app/frontend/src/hooks/useSkills.ts` - Skills management, GitHub skills fetch (direct API access with 15-min cache)
- `app/frontend/src/contexts/SessionsContext.tsx` - Session list state with client-side filtering
- `app/frontend/src/contexts/UserContext.tsx` - User info and settings state
- `app/frontend/src/pages/SessionPage.tsx` - Chat UI with message streaming
- `app/frontend/src/components/SessionList.tsx` - Session list with filtering and archive UI
- `app/frontend/src/components/SettingsModal.tsx` - Settings UI using Claude backup API endpoints
- `app/frontend/src/components/MessageRenderer.tsx` - Message display with tool output collapsing
  - MCP tools (`mcp__*`) are collapsed by default (0 lines shown)
  - Built-in tools show up to 3 lines when collapsed
