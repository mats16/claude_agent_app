# Frontend CLAUDE.md

React + Vite + Ant Design v6 frontend. Stack: React 18, TypeScript, react-i18next (en/ja), Context API, Noto Sans JP.

## Quick Start

```bash
npm run dev          # :5173
npm run build        # Production build
npm run test         # Vitest
```

## Architecture

```
src/
├── components/      # React components
├── contexts/        # UserContext, SessionsContext
├── hooks/           # useAgent (WebSocket), useSkills, useSubagents
├── utils/           # websocket.ts, messageParser.ts
├── styles/          # theme.ts (SINGLE source of truth)
└── i18n/locales/    # en.json, ja.json
```

## Critical Patterns

### Context-First Data Fetching

**NEVER call same API from multiple components.** Use Context:
```typescript
const { userInfo, userSettings } = useUser();
const { sessions } = useSessions();
```

### WebSocket (useAgent hook)

```typescript
const { messages, sendMessage, isProcessing, interruptAgent } = useAgent({ sessionId });
```

- **Agent WS**: `/api/v1/sessions/:sessionId/ws` - Auto-reconnect max 5 attempts (exponential backoff)
- **Sessions WS**: `/api/v1/sessions/ws` - Auto-reconnect every 3s
- **Processing states**: `idle` → `starting` → `processing` → `stopping`

### Naming Conventions

| Layer | Convention |
|-------|-----------|
| API/Backend | `snake_case` |
| TypeScript | `camelCase` |
| Components | `PascalCase` |
| Hooks | `use*` prefix |
| Constants | `UPPER_SNAKE_CASE` |

### Theme System

**ALWAYS use `styles/theme.ts`** - Never hardcode colors/spacing:
```typescript
import { colors, spacing } from '../styles/theme';
const style = { color: colors.brand, padding: spacing.lg };
```

CSS variables: `var(--color-brand)`, `var(--spacing-lg)`, `var(--radius-md)`

### i18n

```typescript
const { t } = useTranslation();
return <h1>{t('welcome.title')}</h1>;
```

Add translations to `src/i18n/locales/en.json` and `ja.json`

### MCP Tool Names

MCP tools prefixed with `mcp__` in frontend:
```typescript
if (toolName.startsWith('mcp__')) {
  const actualToolName = toolName.slice(5);
}
```

## Development Setup

Create `app/.env` (parent directory):
```bash
DATABRICKS_TOKEN=dapi...
DATABRICKS_USER_NAME=your.name
DATABRICKS_USER_ID=12345
DATABRICKS_USER_EMAIL=you@example.com
```

Vite proxy injects these as `X-Forwarded-*` headers (see `vite.config.ts`).

## Common Gotchas

1. **Session ID**: TypeID format `session_01h455vb4pex5vsknk084sn02q` (33 chars)
2. **Processing states**: `result` with `subtype: "interrupted"` → stop processing
3. **Context re-renders**: Memoize context values with `useMemo`
4. **Ant Design v6**: `Modal.visible` → `open`, `Button.type="ghost"` → `variant="outlined"`
5. **Translations**: Restart dev server if HMR doesn't pick up JSON changes
