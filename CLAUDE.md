# Claude Agent App

A web application that serves as a Claude Code-like coding agent running on Databricks Apps.

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

### Required

- **DATABRICKS_HOST**: Databricks workspace URL (e.g., `your-workspace.cloud.databricks.com`)
- **DATABRICKS_CLIENT_ID**: OAuth2 client ID for Service Principal (used in production)
- **DATABRICKS_CLIENT_SECRET**: OAuth2 client secret for Service Principal (used in production)

### Optional

- **DATABRICKS_TOKEN**: Personal Access Token (development only, fallback for Service Principal authentication)
- **PORT**: Backend server port (default: `8000`)
- **WORKSPACE_PATH**: Agent working directory (default: current directory)

### Authentication Flow

In production (Databricks Apps), the following authentication flow is used:

1. **Service Principal Authentication**: Obtains OIDC access token using `DATABRICKS_CLIENT_ID` and `DATABRICKS_CLIENT_SECRET`
2. **User Token**: Retrieved from request header `x-forwarded-access-token` (automatically provided by Databricks Apps)

In development, `DATABRICKS_TOKEN` can be used as a fallback.


## Custom MCP Servers

The agent includes a custom MCP server for interacting with Databricks Workspace APIs, enabling the AI assistant to explore and read files stored in Databricks Workspace.

### databricks-workspace

#### Available Tools

##### list_workspace_objects

List files and directories in a Databricks Workspace directory.

- **API Endpoint**: `GET /api/2.0/workspace/list`
- **Parameters**:
  - `path` (string): The directory path in Databricks Workspace (e.g., `/Workspace/Users/user@example.com`)
  - `accessToken` (string): User access token for authentication
- **Use Case**: Explore the workspace structure, find notebooks, libraries, and other workspace objects

##### get_workspace_object

Get the contents of a file in Databricks Workspace.

- **API Endpoint**: `GET /api/2.0/workspace/export`
- **Parameters**:
  - `path` (string): The file path in Databricks Workspace (e.g., `/Workspace/Users/user@example.com/sample.py`)
  - `accessToken` (string): User access token for authentication
- **Returns**: File content and file type information
- **Use Case**: Read notebook source code, configuration files, or other workspace files

#### Authentication

Both tools use the user's access token passed from the WebSocket request header (`x-forwarded-access-token`). This ensures that the agent can only access workspace objects that the user has permission to view.


## API Endpoints

### REST API

It's unnecessary since it will be designed later.

### WebSocket (`ws://localhost:8000/ws`)

**Client -> Server:**
- `{ type: "init" }` - Connection request
- `{ type: "resume", sessionId: string }` - Subscribe to a chat (TBD)
- `{ type: "user_message", content: string, model: string }` - Send message

**Server -> Client:**
- `{ type: "rady" }` - Connection established
- `{ type: "session.created", sessionId: string }` - Session created
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
