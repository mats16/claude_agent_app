# CLAUDE.md

Shared TypeScript types for frontend-backend communication (WebSocket, REST API, multimodal content).

## Quick Start

```bash
npm run build  # Build types
npm run dev    # Watch mode
```

```typescript
import type { WSUserMessage, CreateSessionResponse } from '@app/shared';
```

## Architecture

```
shared/
└── src/
    └── index.ts   # All types (single file)
```

**Type groups:**
- Content Blocks: `TextContent`, `ImageContent`, `DocumentContent`, `MessageContent`
- File Uploads: `FileAttachment`, `FileUploadResponse`, etc.
- WebSocket: `WSUserMessage`, `WSConnectMessage`, `IncomingWSMessage`, etc.
- REST API: `CreateSessionRequest`, `CreateSessionResponse`

## Critical Patterns

### Content is Always an Array
```typescript
// ✅ Correct
{ type: 'user_message', content: [{ type: 'text', text: 'hi' }] }

// ❌ Wrong
{ type: 'user_message', content: { type: 'text', text: 'hi' } }
```

### Naming Conventions
- WebSocket: `WS` prefix (`WSUserMessage`)
- Content: `Content` suffix (`ImageContent`)
- API: `Verb + Noun + Request/Response` (`CreateSessionRequest`)

## Common Gotchas

1. **Import from package**: Use `@app/shared`, not relative paths
2. **No runtime validation**: Backend must validate with zod/similar
3. **Rebuild required**: Changes need `npm run build` or `turbo dev` restart
