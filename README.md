# Claude Code on Databricks

A web application that provides Claude Code-like coding agent capabilities running on Databricks Apps. Users interact with an AI assistant that can execute commands, read/write files, and search code within a Databricks Workspace.

## Features

- **File Operations**: Read, write, and edit files
- **Code Search**: Glob pattern search, regex search (grep)
- **Command Execution**: Shell command execution within workspace
- **Streaming Responses**: Real-time agent response display via WebSocket
- **Workspace Sync**: Bidirectional sync between Databricks Workspace and local storage
- **Multi-language Support**: English and Japanese UI

## Architecture

```
┌─────────────────────────────────────────┐
│      Frontend (React + Ant Design)      │
│  - Chat UI with streaming responses     │
│  - Session management                   │
│  - Tool output rendering                │
└──────────────┬──────────────────────────┘
               │ WebSocket
┌──────────────▼──────────────────────────┐
│      Backend (Node.js + Fastify)        │
│  - REST API & WebSocket handlers        │
│  - Claude Agent SDK integration         │
│  - Databricks Workspace sync            │
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

- Node.js 18+
- PostgreSQL database (e.g., Neon)
- Databricks Workspace with Service Principal
- Anthropic API key (configured in Claude Agent SDK)

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd claude_agent_app
```

### 2. Install dependencies

```bash
cd app
npm install
```

### 3. Configure environment variables

Create `app/.env` file:

```bash
# Required
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_CLIENT_ID=your-client-id
DATABRICKS_CLIENT_SECRET=your-client-secret
DB_URL=postgresql://user:password@host:5432/database

# Required for local development (injected as headers by Vite proxy)
DATABRICKS_TOKEN=your-personal-access-token
DATABRICKS_USER_NAME=Your Name
DATABRICKS_USER_ID=user-id-from-idp
DATABRICKS_USER_EMAIL=your-email@example.com

# Optional
PORT=8000
```

> **Note**: In production, `DB_URL` is injected via Databricks Secrets (see [Configure Secrets](#configure-secrets-production)).

### 4. Run database migration

```bash
npm run db:migrate
```

## Development

Start both frontend and backend in development mode:

```bash
cd app
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## Build & Deployment

### Build

```bash
cd app
npm run build
```

### Configure Secrets (Production)

DB_URL must be stored in Databricks Secrets for production deployment:

```bash
# Create secret scope
databricks secrets create-scope claude_agent

# Store DB_URL
databricks secrets put-secret claude_agent db_url
```

The secret is referenced in:
- `resources/claude_agent.app.yml` - DAB resource definition
- `app/app.yaml` - App runtime configuration

### Deploy to Databricks Apps

```bash
# Validate configuration
databricks bundle validate

# Deploy to development
databricks bundle deploy -t dev

# Deploy to production
databricks bundle deploy -t prod
```

## Available Agent Tools

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

## Project Structure

```
claude_agent_app/
├── app/
│   ├── frontend/          # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── contexts/
│   │   │   ├── hooks/
│   │   │   ├── i18n/
│   │   │   └── pages/
│   │   └── public/
│   ├── backend/           # Node.js backend
│   │   ├── agent/         # Claude Agent SDK integration
│   │   └── db/            # Database (Drizzle ORM)
│   ├── shared/            # Shared types
│   ├── app.yaml           # Databricks Apps runtime config
│   └── package.json       # Turborepo configuration
├── resources/
│   └── claude_agent.app.yml  # DAB app resource definition
├── databricks.yml         # Databricks bundle config
├── CLAUDE.md              # Claude Code guidance
└── README.md
```

## License

Apache License 2.0
