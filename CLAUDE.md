# Claude Agent App

Databricks Apps 上で動作する Claude Code ライクなコーディングエージェントのウェブアプリケーション。

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Fastify + WebSocket (ws) + REStful API
- **Agent**: Claude Agent SDK integrated directly on the server (TypeScript SDK V2)

## Running the App

```bash
cd app
npm install
npm run dev
```

This starts both:
- Backend server on http://localhost:8000
- Vite dev server on http://localhost:5173

Visit http://localhost:5173

## Project Structure

```
claude_agent_app/
├── app/                   # Monorepo root
│   ├── frontend/          # React frontend
│   ├── backend/           # Fastify backend
│   ├── package.json
│   └── turbo.json                # Turborepo 設定
├── resources/
│   └── claude_agent.app.yml      # Databricks Apps settings
├── databricks.yml                # Databricks Asset Bundle settings
└── CLAUDE.md
```

## Environment Variables

- DATABRICKS_HOST: 
- DATABRICKS_TOKEN: only development
- DATABRICKS_CLIENT_ID
- DATABRICKS_CLIENT_SECRET

## API Endpoints

### REST API

It's unnecessary since it will be designed later.

### WebSocket (`ws://localhost:8000/ws`)

**Client -> Server:**
- `{ type: "subscribe", sessionId: string }` - Subscribe to a chat
- `{ type: "chat", sessionId: string, content: string }` - Send message

**Server -> Client:**
- `{ type: "connected" }` - Connection established
- `{ type: "history", messages: [...] }` - Chat history
- `{ type: "assistant_message", content: string }` - AI response
- `{ type: "tool_use", toolName: string, toolInput: {...} }` - Tool being used
- `{ type: "result", success: boolean }` - Query complete
- `{ type: "error", error: string }` - Error occurred

## Notes

- In-memory storage (data lost on restart)
- Agent has access to: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
- Uses Vite for frontend development with hot reload
- Uses tsx for TypeScript execution on the backend
