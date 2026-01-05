# Backend CLAUDE.md

Fastify + Drizzle + Claude Agent SDK backend. See `/app/CLAUDE.md` for monorepo overview.

## Directory Structure

```
backend/
├── server.ts, app.ts       # Entry point + Fastify config
├── plugins/                # request-decorator, websocket, static
├── routes/v1/              # API handlers (sessions, settings, workspace, etc.)
├── services/               # Business logic (agent, session, user, workspace-queue)
├── models/                 # Domain models (Session, RequestUser, ClaudeSettings)
├── db/                     # Drizzle ORM (schema, RLS helpers, migrations)
├── agent/                  # Claude Agent SDK config + MCP servers
├── schemas/                # Zod validation
└── utils/                  # auth, encryption, workspaceClient
```

## Critical Patterns

### 1. Request Context (`req.ctx`)

Extracted from `X-Forwarded-*` headers by `plugins/request-decorator.ts`:

```typescript
// Access in handlers
const userId = req.ctx.user.id;         // IdP user ID
const email = req.ctx.user.email;       // User email
const oboToken = req.ctx.user.accessToken; // On-behalf-of token

// Create RequestUser for domain logic
const user = RequestUser.fromHeaders(req.headers);
user.local.claudeConfigDir  // → $HOME/users/{name}/.claude
user.remote.claudeConfigDir // → /Workspace/Users/{email}/.claude
```

### 2. Domain Models (Factory Pattern)

**SessionId (TypeID wrapper):**
```typescript
// Generate new
const sessionId = SessionId.generate(); // → session_01h455vb4pex5vsknk084sn02q

// Restore from DB (validates prefix)
const sessionId = SessionId.fromString(dbRecord.id);

// Use
sessionId.toString()   // → "session_01h455vb4pex5vsknk084sn02q"
sessionId.getSuffix()  // → "01h455vb4pex5vsknk084sn02q"
```

**Session:**
```typescript
// Create from DB record
const session = Session.fromSelectSession(dbRecord);

// Access computed properties
session.cwd()        // → /path/to/sessions/01h455vb4pex5vsknk084sn02q
session.branchName() // → claude/session_01h455vb4pex5vsknk084sn02q
session.appName()    // → app-01h455vb4pex5vsknk084sn02q (30 chars, use suffix)
```

**Why Factory Pattern?**
- Validates TypeID prefix, required fields at creation
- Private constructor prevents invalid states
- Single source of truth for derived properties

### 3. Row Level Security (RLS)

**CRITICAL:** Always wrap queries to `sessions`, `settings`, `oauth_tokens` with `withUserContext()`:

```typescript
// db/sessions.ts
export async function getSession(userId: string, sessionId: string) {
  return withUserContext(userId, async () => {
    return db.select().from(sessions).where(eq(sessions.id, sessionId));
  });
}

// For transactions
return withUserContextInTransaction(userId, async (tx) => {
  await tx.insert(sessions).values({ ... });
  await tx.insert(settings).values({ ... });
});
```

Without `withUserContext()`, queries fail with RLS policy violations.

### 4. Authentication (PAT-first + SP Fallback)

```typescript
// services/user.service.ts
const { token, source } = await getAccessTokenForUser(userId);
// source: 'pat' (user's PAT) | 'sp' (Service Principal)
```

**PAT Encryption:** Auto-encrypted via `encryptedText` Drizzle custom type (AES-256-GCM):
```typescript
// db/schema.ts
export const oauthTokens = pgTable('oauth_tokens', {
  accessToken: encryptedText('access_token').notNull(), // Encrypted at rest
});
```

**Setup:** Set `ENCRYPTION_KEY` (64 hex chars): `openssl rand -hex 32`

### 5. Service Layer Pattern

Handlers delegate to services:

```typescript
// routes/v1/sessions/handlers.ts
export async function createSessionHandler(req, reply) {
  const user = RequestUser.fromHeaders(req.headers);
  const session = await createSession({ userId: req.ctx.user.id, user, ... });
  return reply.send({ session });
}

// services/session.service.ts (business logic)
export async function createSession(params): Promise<Session> {
  const sessionId = SessionId.generate();
  user.ensureLocalDirs();
  const [record] = await withUserContext(userId, () => db.insert(...).returning());
  return Session.fromSelectSession(record);
}
```

## Database (Drizzle ORM v1.0+)

**Schema & Migrations:**
```bash
# 1. Edit db/schema.ts
# 2. Generate migration
npm run db:generate

# 3. Migrations auto-run on server startup (server.ts)
```

**CRITICAL (v1.0+ syntax):**
```typescript
// CORRECT
import { drizzle } from 'drizzle-orm/postgres-js';
export const db = drizzle({ client: sql });

// WRONG (v0.x)
export const db = drizzle(sql);
```

**Type-safe queries:**
```typescript
// Select (returns SelectSession[])
const results = await db.select().from(sessions).where(eq(sessions.userId, userId));

// Insert
await db.insert(sessions).values({ id: sessionId.toString(), user_id: userId, ... });
```

## Claude Agent SDK

**Configuration:**
```typescript
// agent/index.ts
export function buildSDKQueryOptions(params: {
  session: SessionBase;
  user: RequestUser;
  userPersonalAccessToken?: string;
  spAccessToken?: string;
  claudeConfigAutoPush: boolean;
}): Options {
  return {
    resume: session.claudeCodeSessionId, // Resume previous session
    cwd: session.cwd,
    model: session.model,
    env: {
      CLAUDE_CONFIG_DIR: user.local.claudeConfigDir,
      ANTHROPIC_AUTH_TOKEN: userPersonalAccessToken ?? spAccessToken, // PAT-first
      DATABRICKS_TOKEN: userPersonalAccessToken,
      // ... other env vars
    },
    tools: { type: 'preset', preset: 'claude_code' },
    allowedTools: ['Skill', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'mcp__databricks__*'],
    mcpServers: { databricks: createDatabricksMcpServer({ ... }) },
  };
}
```

**Processing:**
```typescript
// services/agent.service.ts
for await (const message of agent.query(userMessage, options)) {
  yield message; // Stream to client via WebSocket
  if (message.type === 'result') await saveEvent(session.id, message);
}
```

**MCP tool names:** Prefixed with `mcp__{server_name}__` (e.g., `mcp__databricks__query_catalog`)

## API Design

**Handler pattern:**
```typescript
// routes/v1/sessions/handlers.ts
export async function createSessionHandler(req, reply) {
  const user = RequestUser.fromHeaders(req.headers);
  const { workspace_path, model } = req.body; // Zod validated
  const session = await createSession({ userId: req.ctx.user.id, user, workspacePath: workspace_path, model });
  return reply.code(201).send({ session });
}
```

**WebSocket (Session streaming):**
```typescript
// Client → Server
{ type: 'user_message', content: 'Hello' }
{ type: 'interrupt' }

// Server → Client
{ type: 'agent_message', content: '...' }
{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }
{ type: 'result', subtype: 'success' | 'interrupted' | 'error' }
```

## Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| DB columns | `snake_case` | `workspace_path`, `created_at` |
| TypeScript | `camelCase` | `workspacePath`, `createdAt` |
| API JSON | `snake_case` | `{ workspace_path: '...' }` |
| TypeID | `{prefix}_{suffix}` | `session_01h455vb4pex5vsknk084sn02q` |
| App name | `app-{suffix}` | `app-01h455vb4pex5vsknk084sn02q` (30 chars) |

## Common Gotchas

1. **Drizzle v1.0+ syntax:** `drizzle({ client })` not `drizzle(client)`
2. **RLS:** Always use `withUserContext()` for `sessions`, `settings`, `oauth_tokens`
3. **SessionId:** Use `SessionId.generate()` / `.fromString()`, not raw strings
4. **App name:** Use `.getSuffix()` (30 chars), not `.toString()` (34 chars)
5. **PAT encryption:** Requires `ENCRYPTION_KEY` (64 hex chars)
6. **Migrations:** Auto-run on startup; edit `schema.ts` → `npm run db:generate`
7. **WebSocket interrupts:** Save `result` event with `subtype: "interrupted"` for UI
8. **Request context:** Available after `request-decorator` plugin (in `preHandler`)
9. **MCP tool names:** Prefixed with `mcp__databricks__`
10. **SP fallback:** Used automatically if PAT not configured

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
DATABRICKS_HOST=adb-123456789.azuredatabricks.net
DATABRICKS_CLIENT_ID=your-sp-client-id
DATABRICKS_CLIENT_SECRET=your-sp-client-secret
DATABRICKS_WAREHOUSE_ID_DEFAULT=your-warehouse-id
DATABRICKS_WAREHOUSE_ID_PRO=your-pro-warehouse-id
ENCRYPTION_KEY=your-64-char-hex-key  # openssl rand -hex 32
PORT=8000  # Optional
NODE_ENV=development  # development | production
```

## Debugging

```bash
npm run db:studio           # Drizzle Studio GUI (http://localhost:4983)
npm test                    # Vitest unit tests
npm run test:watch          # Watch mode
```

**Logging:**
```typescript
fastify.log.info('Session created', { sessionId });
fastify.log.error(error, 'Failed to create session');
```
