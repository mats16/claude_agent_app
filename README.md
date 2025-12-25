# Claude Code on Databricks

A web application that provides Claude Code-like coding agent capabilities running on Databricks Apps. Users interact with an AI assistant that can execute commands, read/write files, search code, and run SQL queries within a Databricks Workspace.

[日本語版 README](README.ja.md)

## Features

- **AI Coding Agent**: Claude-powered assistant with file operations, code search, and command execution
- **Databricks Integration**: SQL execution via MCP, workspace sync, and Databricks Apps deployment
- **Personal Access Token**: Optional PAT configuration for user-level authentication
- **Skills & Agents**: Customizable skills and subagents with GitHub import support
- **Real-time Streaming**: WebSocket-based response streaming
- **Multi-language UI**: English and Japanese support

## Architecture

```
┌─────────────────────────────────────────┐
│      Frontend (React + Ant Design)      │
│  - Chat UI with streaming responses     │
│  - Session management                   │
│  - Skills/Agents configuration          │
└──────────────┬──────────────────────────┘
               │ WebSocket
┌──────────────▼──────────────────────────┐
│      Backend (Node.js + Fastify)        │
│  - REST API & WebSocket handlers        │
│  - Claude Agent SDK integration         │
│  - MCP servers (Databricks SQL)         │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         PostgreSQL (Neon)               │
│  - Users, Sessions, Events, Settings    │
│  - Row Level Security (RLS)             │
└─────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React + Vite + Ant Design v5 + TypeScript
- **Backend**: Node.js + Fastify + WebSocket
- **Agent**: Claude Agent SDK (TypeScript)
- **Database**: PostgreSQL with Drizzle ORM
- **Deployment**: Databricks Apps

## Prerequisites

- Node.js 20+
- PostgreSQL database (e.g., Neon)
- Databricks Workspace with Service Principal
- Anthropic API access (via Databricks Model Serving or API key)

## Quick Start

### 1. Install dependencies

```bash
cd app
npm install
```

### 2. Configure environment variables

Create `app/.env`:

```bash
# Required
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_CLIENT_ID=your-client-id
DATABRICKS_CLIENT_SECRET=your-client-secret
DATABASE_URL=postgresql://user:password@host:5432/database

# Local development (injected as headers by Vite proxy)
DATABRICKS_TOKEN=your-personal-access-token
DATABRICKS_USER_NAME=Your Name
DATABRICKS_USER_ID=user-id-from-idp
DATABRICKS_USER_EMAIL=your-email@example.com

# Optional
PORT=8000
ENCRYPTION_KEY=<64-hex-chars>  # For PAT storage (openssl rand -hex 32)

# SQL Warehouse IDs (for MCP tools)
WAREHOUSE_ID_2XS=your-2xs-warehouse-id
WAREHOUSE_ID_XS=your-xs-warehouse-id
WAREHOUSE_ID_S=your-s-warehouse-id
```

### 3. Start development server

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## Deployment

### Configure Secrets

```bash
# Create secret scope
databricks secrets create-scope claude-agent

# Store DATABASE_URL
databricks secrets put-secret claude-agent database-url
```

### Deploy to Databricks Apps

```bash
databricks bundle validate
databricks bundle deploy -t dev   # Development
databricks bundle deploy -t prod  # Production
```

## Agent Tools

### Built-in Tools

| Tool | Description |
|------|-------------|
| `Bash` | Execute shell commands |
| `Read` | Read file contents |
| `Write` | Write content to files |
| `Edit` | Edit existing files |
| `Glob` | Search files by pattern |
| `Grep` | Search file contents with regex |
| `WebSearch` | Search the web |
| `WebFetch` | Fetch web page contents |

### MCP Tools (Databricks)

| Tool | Description |
|------|-------------|
| `mcp__databricks__run_sql` | Execute SQL on Databricks SQL Warehouse |
| `mcp__databricks__list_warehouses` | List available SQL warehouses |
| `mcp__databricks__get_warehouse_info` | Get warehouse details |

## Project Structure

```
claude-agent-databricks/
├── app/
│   ├── frontend/          # React frontend
│   │   └── src/
│   │       ├── components/
│   │       ├── contexts/
│   │       ├── hooks/
│   │       └── pages/
│   ├── backend/           # Node.js backend
│   │   ├── agent/         # Claude Agent SDK + MCP
│   │   ├── db/            # Drizzle ORM
│   │   ├── models/        # Domain models
│   │   ├── routes/        # REST API + WebSocket
│   │   └── services/      # Business logic
│   ├── shared/            # Shared types (@app/shared)
│   └── app.yaml           # Databricks Apps config
├── resources/
│   └── claude_agent.app.yml  # DAB app resource
├── databricks.yml         # Databricks bundle config
├── CLAUDE.md              # Claude Code guidance
└── README.md
```

## License

Apache License 2.0
