import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  processAgentRequest,
  SDKMessage,
  getAccessToken,
  getOidcAccessToken,
  databricksHost,
  MessageStream,
} from './agent/index.js';
import { saveMessage, getMessagesBySessionId } from './db/events.js';
import {
  createSession,
  getSessionById,
  getSessionsByUserId,
  updateSession,
  archiveSession,
} from './db/sessions.js';
import {
  getSettings,
  getSettingsDirect,
  upsertSettings,
} from './db/settings.js';
import { upsertUser } from './db/users.js';
import {
  workspacePull,
  workspacePush,
  deleteWorkDir,
  ensureWorkspaceDirectory,
} from './utils/databricks.js';
import {
  extractRequestContext,
  extractRequestContextFromHeaders,
} from './utils/headers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory (.env or ../.env)
dotenv.config({ path: path.join(__dirname, '../.env') });

const fastify = Fastify({
  logger: true,
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;

// Session event queue for streaming events to WebSocket
interface SessionQueue {
  events: SDKMessage[];
  listeners: Set<(event: SDKMessage) => void>;
  completed: boolean;
}

const sessionQueues = new Map<string, SessionQueue>();

// MessageStream management for interactive sessions
// Maps sessionId to MessageStream for queueing additional messages
const sessionMessageStreams = new Map<string, MessageStream>();

// Track active WebSocket connections per session
// Maps sessionId to a Set of active WebSocket connections
// Multiple connections per session are allowed (for multi-tab support and React Strict Mode)
import type { WebSocket as WsWebSocket } from 'ws';
const sessionWebSockets = new Map<string, Set<WsWebSocket>>();

// User session list WebSocket connections (for real-time session list updates)
const userSessionListeners = new Map<string, Set<WsWebSocket>>();

// Notify user's session list listeners about session creation
function notifySessionCreated(
  userId: string,
  session: {
    id: string;
    title: string;
    workspacePath: string | null;
    autoWorkspacePush: boolean;
    updatedAt: string;
  }
) {
  const listeners = userSessionListeners.get(userId);
  if (!listeners) return;

  const message = JSON.stringify({
    type: 'session_created',
    session,
  });

  for (const ws of listeners) {
    try {
      ws.send(message);
    } catch (error) {
      console.error('Failed to send session_created notification:', error);
    }
  }
}

function getOrCreateQueue(sessionId: string): SessionQueue {
  let queue = sessionQueues.get(sessionId);
  if (!queue) {
    queue = { events: [], listeners: new Set(), completed: false };
    sessionQueues.set(sessionId, queue);
  }
  return queue;
}

function addEventToQueue(sessionId: string, event: SDKMessage) {
  const queue = getOrCreateQueue(sessionId);
  queue.events.push(event);
  // Notify all listeners
  queue.listeners.forEach((listener) => listener(event));
}

function markQueueCompleted(sessionId: string) {
  const queue = sessionQueues.get(sessionId);
  if (queue) {
    queue.completed = true;
  }
}

// Create SDKMessage for user message (supports text and image content)
import type { MessageContent } from '@app/shared';

function createUserMessage(
  sessionId: string,
  content: MessageContent[]
): SDKMessage {
  // Convert MessageContent[] to API format
  const apiContent = content.map((c) => {
    if (c.type === 'text') {
      return { type: 'text' as const, text: c.text };
    } else {
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: c.source.media_type,
          data: c.source.data,
        },
      };
    }
  });

  return {
    type: 'user',
    session_id: sessionId,
    uuid: crypto.randomUUID(),
    message: {
      role: 'user',
      content: apiContent,
    },
  } as SDKMessage;
}

// Register WebSocket plugin
await fastify.register(websocket);

// Register static file serving for frontend
await fastify.register(staticPlugin, {
  root: path.join(__dirname, '../../frontend/dist'),
  prefix: '/',
});

// Health check endpoint
fastify.get('/api/health', async () => {
  return {
    status: 'ok',
    service: 'Fastify Backend with Claude Agent',
  };
});

// Hello endpoint
fastify.get('/api/hello', async () => {
  return {
    message: 'Hello from Fastify Backend!',
    timestamp: new Date().toISOString(),
  };
});

// Create session endpoint - returns immediately after init message
interface CreateSessionBody {
  events: Array<{
    uuid: string;
    session_id: string;
    type: string;
    message: { role: string; content: MessageContent[] | string };
  }>;
  session_context: {
    model: string;
    workspacePath?: string;
    autoWorkspacePush?: boolean;
  };
}

fastify.post<{ Body: CreateSessionBody }>(
  '/api/v1/sessions',
  async (request, reply) => {
    const { events, session_context } = request.body;

    // Get user info from request headers
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const { userId, userEmail, accessToken } = context;

    // Extract first user message
    const userEvent = events.find((e) => e.type === 'user');
    if (!userEvent) {
      return reply.status(400).send({ error: 'No user message found' });
    }

    const userMessage = userEvent.message.content;
    const model = session_context.model;
    const workspacePath = session_context.workspacePath;
    // Force autoWorkspacePush to false if workspacePath is not specified
    const autoWorkspacePush =
      workspacePath && workspacePath.trim()
        ? (session_context.autoWorkspacePush ?? false)
        : false;

    // Get user settings for claudeConfigSync
    const userSettings = await getSettingsDirect(userId);
    const claudeConfigSync = userSettings?.claudeConfigSync ?? true;

    // Pull workspace files in background (non-blocking)
    // Compute paths (same logic as in agent/index.ts)
    const localBasePath = path.join(process.env.HOME ?? '/tmp', 'u');
    const workspaceHomePath = path.join('/Workspace/Users', userEmail);
    const workspaceClaudeConfigPath = path.join(workspaceHomePath, '.claude');
    const localClaudeConfigPath = path.join(
      localBasePath,
      userEmail,
      '.claude'
    );

    // Ensure claude config directory exists
    fs.mkdirSync(localClaudeConfigPath, { recursive: true });

    // Start workspace pull in background (fire-and-forget)
    // Pull .claude config if enabled (always overwrite)
    if (claudeConfigSync) {
      console.log(
        `[New Session] Starting background pull of claude config from ${workspaceClaudeConfigPath}...`
      );
      const spToken = await getOidcAccessToken();
      workspacePull(
        workspaceClaudeConfigPath,
        localClaudeConfigPath,
        true,
        spToken
      )
        .then(() => {
          console.log('[New Session] Claude config pull completed');
        })
        .catch((err) => {
          console.error('[New Session] Claude config pull failed:', err);
        });
    }

    // Promise to wait for init message with timeout and error handling
    let sessionId = '';
    let resolveInit: (() => void) | undefined;
    let rejectInit: ((error: Error) => void) | undefined;
    const initReceived = new Promise<void>((resolve, reject) => {
      resolveInit = resolve;
      rejectInit = reject;
    });

    // Retry configuration
    const maxRetries = 3;
    let retryCount = 0;

    // Convert string message to MessageContent[] for processAgentRequest
    const messageContent: MessageContent[] =
      typeof userMessage === 'string'
        ? [{ type: 'text', text: userMessage }]
        : userMessage;

    // Generate unique uuid for workDir and create it before starting agent
    const workDirUuid = crypto.randomUUID();
    const localWorkPath = path.join(localBasePath, userEmail, 'w', workDirUuid);
    console.log(`[New Session] Creating workDir: ${localWorkPath}`);
    fs.mkdirSync(localWorkPath, { recursive: true });

    // Pull workspace directory in background if workspacePath is provided (always overwrite)
    if (workspacePath) {
      console.log(
        `[New Session] Starting background pull of workspace directory from ${workspacePath}...`
      );
      const spToken = await getOidcAccessToken();
      workspacePull(workspacePath, localWorkPath, true, spToken)
        .then(() => {
          console.log('[New Session] Workspace directory pull completed');
        })
        .catch((err) => {
          console.error('[New Session] Workspace directory pull failed:', err);
        });
    }

    const startAgentProcessing = () => {
      // Create MessageStream for this session
      const stream = new MessageStream(messageContent);

      // Start processing in background
      const agentIterator = processAgentRequest(
        messageContent,
        model,
        undefined,
        userEmail,
        workspacePath,
        { autoWorkspacePush, claudeConfigSync, cwd: localWorkPath },
        stream,
        accessToken
      );

      // Process events in background
      (async () => {
        try {
          let userMessageSaved = false;
          for await (const sdkMessage of agentIterator) {
            // Extract sessionId from init message
            if (
              sdkMessage.type === 'system' &&
              'subtype' in sdkMessage &&
              sdkMessage.subtype === 'init'
            ) {
              sessionId = sdkMessage.session_id;
              getOrCreateQueue(sessionId);

              // Store MessageStream for this session (for interactive messaging)
              sessionMessageStreams.set(sessionId, stream);

              // Ensure user exists before creating session
              await upsertUser(userId, userEmail);

              // Save session to database
              // Use default title
              const sessionTitle = 'No title';
              await createSession(
                {
                  id: sessionId,
                  title: sessionTitle,
                  model,
                  workspacePath,
                  userId,
                  autoWorkspacePush,
                  cwd: localWorkPath,
                },
                userId
              );

              // Notify session list WebSocket listeners
              notifySessionCreated(userId, {
                id: sessionId,
                title: sessionTitle,
                workspacePath: workspacePath ?? null,
                autoWorkspacePush,
                updatedAt: new Date().toISOString(),
              });

              resolveInit?.();

              // Save user message after getting sessionId
              if (!userMessageSaved) {
                const userMsg = createUserMessage(sessionId, messageContent);
                await saveMessage(userMsg);
                addEventToQueue(sessionId, userMsg);
                userMessageSaved = true;
              }
            }

            // Save all messages to database
            if (sessionId) {
              await saveMessage(sdkMessage);
              addEventToQueue(sessionId, sdkMessage);
            }
          }
        } catch (error: any) {
          console.error('Error processing agent request:', error);

          // If init message was not received yet, retry or reject
          if (!sessionId) {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(
                `Retrying agent request (attempt ${retryCount + 1}/${maxRetries})...`
              );
              // Small delay before retry
              await new Promise((r) => setTimeout(r, 1000));
              startAgentProcessing();
            } else {
              rejectInit?.(
                new Error(
                  `Agent failed after ${maxRetries} attempts: ${error.message}`
                )
              );
            }
          }
        } finally {
          if (sessionId) {
            markQueueCompleted(sessionId);
            // Cleanup MessageStream
            sessionMessageStreams.delete(sessionId);
          }
        }
      })();
    };

    // Start initial processing
    startAgentProcessing();

    // Wait for init message with timeout
    const timeoutMs = 30000; // 30 seconds timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout waiting for agent init message'));
      }, timeoutMs);
    });

    try {
      await Promise.race([initReceived, timeoutPromise]);
    } catch (error: any) {
      console.error('Failed to initialize agent session:', error.message);
      return reply.status(500).send({ error: error.message });
    }

    return {
      session_id: sessionId,
    };
  }
);

// Get all sessions for the current user
fastify.get<{
  Querystring: { filter?: 'active' | 'archived' | 'all' };
}>('/api/v1/sessions', async (request, reply) => {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { userId } = context;
  const filter = request.query.filter || 'active';
  const sessionList = await getSessionsByUserId(userId, filter);

  return { sessions: sessionList };
});

// Update session settings (title, autoWorkspacePush, workspacePath)
fastify.patch<{
  Params: { sessionId: string };
  Body: {
    title?: string;
    autoWorkspacePush?: boolean;
    workspacePath?: string | null;
  };
}>('/api/v1/sessions/:sessionId', async (request, reply) => {
  const { sessionId } = request.params;
  const { title, autoWorkspacePush, workspacePath } = request.body;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { userId } = context;

  // At least one field must be provided
  if (
    title === undefined &&
    autoWorkspacePush === undefined &&
    workspacePath === undefined
  ) {
    return reply.status(400).send({
      error: 'title, autoWorkspacePush, or workspacePath is required',
    });
  }

  const updates: {
    title?: string;
    autoWorkspacePush?: boolean;
    workspacePath?: string | null;
  } = {};
  if (title !== undefined) updates.title = title;
  if (workspacePath !== undefined) {
    updates.workspacePath = workspacePath || null;
    // Force autoWorkspacePush to false when workspacePath is cleared
    if (!workspacePath || !workspacePath.trim()) {
      updates.autoWorkspacePush = false;
    }
  }
  if (autoWorkspacePush !== undefined) {
    // Only apply autoWorkspacePush if workspacePath is set
    // (either from current update or existing session)
    const session = await getSessionById(sessionId, userId);
    const finalWorkspacePath = updates.workspacePath ?? session?.workspacePath;
    if (finalWorkspacePath && finalWorkspacePath.trim()) {
      updates.autoWorkspacePush = autoWorkspacePush;
    } else {
      updates.autoWorkspacePush = false;
    }
  }

  await updateSession(sessionId, updates, userId);
  return { success: true };
});

// Archive session
fastify.patch<{ Params: { sessionId: string } }>(
  '/api/v1/sessions/:sessionId/archive',
  async (request, reply) => {
    const { sessionId } = request.params;

    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const { userId } = context;

    // Get session to retrieve cwd before archiving
    const session = await getSessionById(sessionId, userId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Archive the session in database
    await archiveSession(sessionId, userId);

    // Delete working directory in background if it exists
    if (session.cwd) {
      console.log(
        `[Archive] Scheduling background deletion of: ${session.cwd}`
      );
      // Fire-and-forget: don't await
      deleteWorkDir(session.cwd).catch((err) => {
        console.error(
          `[Archive] Failed to delete working directory: ${err.message}`
        );
      });
    }

    return { success: true };
  }
);

// Get session events from database
fastify.get<{ Params: { sessionId: string } }>(
  '/api/v1/sessions/:sessionId/events',
  async (request, _reply) => {
    const { sessionId } = request.params;
    const messages = await getMessagesBySessionId(sessionId);
    return { events: messages };
  }
);

// Get current user info (includes workspace permission check)
// Creates user if not exists
fastify.get('/api/v1/users/me', async (request, reply) => {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { userId, userEmail } = context;

  // Ensure user exists (create if not)
  await upsertUser(userId, userEmail);

  // Workspace home is derived from user email
  const workspaceHome = userEmail ? `/Workspace/Users/${userEmail}` : null;

  // Check workspace permission by trying to create .claude directory
  // mkdirs returns 200 even if directory already exists
  let hasWorkspacePermission = false;
  if (workspaceHome) {
    try {
      const token = await getAccessToken();
      const claudeConfigPath = `${workspaceHome}/.claude`;
      const response = await fetch(
        `${databricksHost}/api/2.0/workspace/mkdirs`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: claudeConfigPath }),
        }
      );
      const data = (await response.json()) as {
        error_code?: string;
        message?: string;
      };
      // Permission exists if no error_code (mkdirs returns {} on success)
      hasWorkspacePermission = !data.error_code;
    } catch (error: any) {
      console.error('Failed to check workspace permission:', error);
      hasWorkspacePermission = false;
    }
  }

  // Build Databricks App URL from environment variables
  const databricksAppName = process.env.DATABRICKS_APP_NAME;
  const databricksAppUrl =
    databricksAppName && process.env.DATABRICKS_HOST
      ? `https://${process.env.DATABRICKS_HOST}/apps/${databricksAppName}`
      : null;

  return {
    userId,
    email: userEmail ?? null,
    workspaceHome,
    hasWorkspacePermission,
    databricksAppUrl,
  };
});

// Get current user settings
fastify.get('/api/v1/users/me/settings', async (request, reply) => {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { userId } = context;

  const userSettings = await getSettings(userId);

  if (!userSettings) {
    return {
      userId,
      hasAccessToken: false,
      claudeConfigSync: true,
    };
  }

  return {
    userId: userSettings.userId,
    hasAccessToken: !!userSettings.accessToken,
    claudeConfigSync: userSettings.claudeConfigSync,
  };
});

// Update current user settings
fastify.patch<{
  Body: { accessToken?: string; claudeConfigSync?: boolean };
}>('/api/v1/users/me/settings', async (request, reply) => {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { userId, userEmail } = context;

  const { accessToken, claudeConfigSync } = request.body;

  // At least one field must be provided
  if (accessToken === undefined && claudeConfigSync === undefined) {
    return reply
      .status(400)
      .send({ error: 'accessToken or claudeConfigSync is required' });
  }

  // Ensure user exists before creating settings
  await upsertUser(userId, userEmail);

  const updates: { accessToken?: string; claudeConfigSync?: boolean } = {};
  if (accessToken !== undefined) updates.accessToken = accessToken;
  if (claudeConfigSync !== undefined)
    updates.claudeConfigSync = claudeConfigSync;

  await upsertSettings(userId, updates);
  return { success: true };
});

// Get service principal info
fastify.get('/api/v1/service-principal', async (_request, reply) => {
  try {
    const token = await getAccessToken();

    // Fetch SP info from Databricks SCIM API
    const response = await fetch(
      `${databricksHost}/api/2.0/preview/scim/v2/Me`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return reply.status(500).send({
        error: `Failed to fetch service principal info: ${errorText}`,
      });
    }

    const data = (await response.json()) as {
      displayName?: string;
      applicationId?: string;
      id?: string;
      userName?: string;
    };

    return {
      displayName: data.displayName ?? data.userName ?? 'Service Principal',
      applicationId: data.applicationId ?? data.id ?? null,
      databricksHost: process.env.DATABRICKS_HOST ?? null,
    };
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
});

// Skills API - List all skills
fastify.get('/api/v1/claude/skills', async (request, reply) => {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { userEmail } = context;
  const localBasePath = path.join(process.env.HOME ?? '/tmp', 'u');
  const skillsPath = path.join(localBasePath, userEmail, '.claude/skills');

  try {
    // Ensure skills directory exists
    if (!fs.existsSync(skillsPath)) {
      fs.mkdirSync(skillsPath, { recursive: true });
      return { skills: [] };
    }

    // Read all .md files from skills directory
    const files = fs.readdirSync(skillsPath);
    const skills = files
      .filter((file) => file.endsWith('.md'))
      .map((file) => {
        const name = file.replace(/\.md$/, '');
        const filePath = path.join(skillsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        return { name, content };
      });

    return { skills };
  } catch (error: any) {
    console.error('Failed to list skills:', error);
    return reply.status(500).send({ error: error.message });
  }
});

// Skills API - Get single skill
fastify.get<{ Params: { skillName: string } }>(
  '/api/v1/claude/skills/:skillName',
  async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const { userEmail } = context;
    const { skillName } = request.params;

    // Validate skill name
    if (!/^[a-zA-Z0-9_-]+$/.test(skillName)) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }

    const localBasePath = path.join(process.env.HOME ?? '/tmp', 'u');
    const skillPath = path.join(
      localBasePath,
      userEmail,
      '.claude/skills',
      `${skillName}.md`
    );

    try {
      if (!fs.existsSync(skillPath)) {
        return reply.status(404).send({ error: 'Skill not found' });
      }

      const content = fs.readFileSync(skillPath, 'utf-8');
      return { name: skillName, content };
    } catch (error: any) {
      console.error('Failed to read skill:', error);
      return reply.status(500).send({ error: error.message });
    }
  }
);

// Skills API - Create new skill
fastify.post<{ Body: { name: string; content: string } }>(
  '/api/v1/claude/skills',
  async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const { userEmail } = context;
    const { name, content } = request.body;

    // Validate inputs
    if (!name || !content) {
      return reply.status(400).send({ error: 'name and content are required' });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }

    const localBasePath = path.join(process.env.HOME ?? '/tmp', 'u');
    const skillsPath = path.join(localBasePath, userEmail, '.claude/skills');
    const skillPath = path.join(skillsPath, `${name}.md`);

    try {
      // Ensure skills directory exists
      fs.mkdirSync(skillsPath, { recursive: true });

      // Check if skill already exists
      if (fs.existsSync(skillPath)) {
        return reply.status(409).send({ error: 'Skill already exists' });
      }

      // Write skill file
      fs.writeFileSync(skillPath, content, 'utf-8');

      // Sync to workspace (fire-and-forget)
      const workspaceSkillsPath = `/Workspace/Users/${userEmail}/.claude/skills`;
      const spToken = await getOidcAccessToken();
      ensureWorkspaceDirectory(workspaceSkillsPath, spToken)
        .then(() => workspacePush(skillsPath, workspaceSkillsPath, spToken))
        .catch((err) => {
          console.error(`[Skills] Failed to sync after create: ${err.message}`);
        });

      return { name, content };
    } catch (error: any) {
      console.error('Failed to create skill:', error);
      return reply.status(500).send({ error: error.message });
    }
  }
);

// Skills API - Update existing skill
fastify.patch<{ Params: { skillName: string }; Body: { content: string } }>(
  '/api/v1/claude/skills/:skillName',
  async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const { userEmail } = context;
    const { skillName } = request.params;
    const { content } = request.body;

    // Validate inputs
    if (!content) {
      return reply.status(400).send({ error: 'content is required' });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(skillName)) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }

    const localBasePath = path.join(process.env.HOME ?? '/tmp', 'u');
    const skillsPath = path.join(localBasePath, userEmail, '.claude/skills');
    const skillPath = path.join(skillsPath, `${skillName}.md`);

    try {
      // Check if skill exists
      if (!fs.existsSync(skillPath)) {
        return reply.status(404).send({ error: 'Skill not found' });
      }

      // Update skill file
      fs.writeFileSync(skillPath, content, 'utf-8');

      // Sync to workspace (fire-and-forget)
      const workspaceSkillsPath = `/Workspace/Users/${userEmail}/.claude/skills`;
      const spToken = await getOidcAccessToken();
      ensureWorkspaceDirectory(workspaceSkillsPath, spToken)
        .then(() => workspacePush(skillsPath, workspaceSkillsPath, spToken))
        .catch((err) => {
          console.error(`[Skills] Failed to sync after update: ${err.message}`);
        });

      return { name: skillName, content };
    } catch (error: any) {
      console.error('Failed to update skill:', error);
      return reply.status(500).send({ error: error.message });
    }
  }
);

// Skills API - Delete skill
fastify.delete<{ Params: { skillName: string } }>(
  '/api/v1/claude/skills/:skillName',
  async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const { userEmail } = context;
    const { skillName } = request.params;

    // Validate skill name
    if (!/^[a-zA-Z0-9_-]+$/.test(skillName)) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }

    const localBasePath = path.join(process.env.HOME ?? '/tmp', 'u');
    const skillsPath = path.join(localBasePath, userEmail, '.claude/skills');
    const skillPath = path.join(skillsPath, `${skillName}.md`);

    try {
      // Check if skill exists
      if (!fs.existsSync(skillPath)) {
        return reply.status(404).send({ error: 'Skill not found' });
      }

      // Delete skill file
      fs.unlinkSync(skillPath);

      // Sync to workspace (fire-and-forget)
      const workspaceSkillsPath = `/Workspace/Users/${userEmail}/.claude/skills`;
      const spToken = await getOidcAccessToken();
      ensureWorkspaceDirectory(workspaceSkillsPath, spToken)
        .then(() => workspacePush(skillsPath, workspaceSkillsPath, spToken))
        .catch((err) => {
          console.error(`[Skills] Failed to sync after delete: ${err.message}`);
        });

      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete skill:', error);
      return reply.status(500).send({ error: error.message });
    }
  }
);

// Workspace API - List root workspace (returns Users and Shared)
fastify.get('/api/v1/Workspace', async (_request, _reply) => {
  return {
    objects: [
      { path: '/Workspace/Users', object_type: 'DIRECTORY' },
      { path: '/Workspace/Shared', object_type: 'DIRECTORY' },
    ],
  };
});

// Workspace API - List user's workspace directory (uses Service Principal token)
fastify.get<{ Params: { email: string } }>(
  '/api/v1/Workspace/Users/:email',
  async (request, reply) => {
    let email: string | undefined = request.params.email;

    // Resolve 'me' to actual email from header
    if (email === 'me') {
      try {
        const context = extractRequestContext(request);
        email = context.userEmail;
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }

    if (!email) {
      return reply.status(400).send({ error: 'Email required' });
    }

    const workspacePath = `/Workspace/Users/${email}`;

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${databricksHost}/api/2.0/workspace/list?path=${encodeURIComponent(workspacePath)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await response.json()) as {
        objects?: Array<{ path: string; object_type: string }>;
        error_code?: string;
        message?: string;
      };

      // Check for permission error - return 403
      // Empty response {} also means no permission
      if (data.error_code === 'PERMISSION_DENIED' || !('objects' in data)) {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }

      // Check for other API errors
      if (data.error_code) {
        return reply.status(400).send({ error: data.message });
      }

      // Filter to only return directories
      const directories = data.objects?.filter(
        (obj) => obj.object_type === 'DIRECTORY'
      );
      return { objects: directories || [] };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  }
);

// Workspace API - Get workspace object status (includes object_id, uses Service Principal token)
fastify.post<{ Body: { path: string } }>(
  '/api/v1/workspace/status',
  async (request, reply) => {
    const { path: workspacePath } = request.body;

    if (!workspacePath) {
      return reply.status(400).send({ error: 'path is required' });
    }

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${databricksHost}/api/2.0/workspace/get-status?path=${encodeURIComponent(workspacePath)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await response.json()) as {
        path?: string;
        object_type?: string;
        object_id?: number;
        error_code?: string;
        message?: string;
      };

      // Check for permission error - return 403
      if (data.error_code === 'PERMISSION_DENIED') {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }

      if (data.error_code) {
        return reply.status(404).send({ error: data.message });
      }

      // Build browse URL for Databricks console
      const host = process.env.DATABRICKS_HOST;
      const browseUrl = data.object_id
        ? `https://${host}/browse/folders/${data.object_id}`
        : null;

      return {
        path: data.path,
        object_type: data.object_type,
        object_id: data.object_id,
        browse_url: browseUrl,
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  }
);

// Workspace API - List any workspace path (Shared, Repos, etc., uses Service Principal token)
fastify.get<{ Params: { '*': string } }>(
  '/api/v1/Workspace/*',
  async (request, reply) => {
    const subpath = request.params['*'];
    const wsPath = `/Workspace/${subpath}`;

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${databricksHost}/api/2.0/workspace/list?path=${encodeURIComponent(wsPath)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await response.json()) as {
        objects?: Array<{ path: string; object_type: string }>;
        error_code?: string;
        message?: string;
      };

      // Check for permission error - return 403
      // Empty response {} also means no permission
      if (data.error_code === 'PERMISSION_DENIED' || !('objects' in data)) {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }

      // Filter to only return directories
      const directories = data.objects?.filter(
        (obj) => obj.object_type === 'DIRECTORY'
      );
      return { objects: directories || [] };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  }
);

// WebSocket endpoint for session list updates
fastify.register(async (fastify) => {
  fastify.get('/api/v1/sessions/ws', { websocket: true }, (socket, req) => {
    let context;
    try {
      context = extractRequestContextFromHeaders(req.headers);
    } catch (error: any) {
      socket.send(JSON.stringify({ error: error.message }));
      socket.close();
      return;
    }

    const { userId } = context;

    console.log(
      `Client connected to session list WebSocket for user: ${userId}`
    );

    // Add to user's session listeners
    let listeners = userSessionListeners.get(userId);
    if (!listeners) {
      listeners = new Set();
      userSessionListeners.set(userId, listeners);
    }
    listeners.add(socket);

    socket.on('message', (messageBuffer: Buffer) => {
      try {
        const messageStr = messageBuffer.toString();
        const message = JSON.parse(messageStr);

        if (message.type === 'subscribe') {
          socket.send(JSON.stringify({ type: 'subscribed' }));
        }
      } catch (error) {
        console.error('Session list WebSocket message error:', error);
      }
    });

    socket.on('close', () => {
      console.log(
        `Client disconnected from session list WebSocket for user: ${userId}`
      );
      const listeners = userSessionListeners.get(userId);
      if (listeners) {
        listeners.delete(socket);
        if (listeners.size === 0) {
          userSessionListeners.delete(userId);
        }
      }
    });

    socket.on('error', (error: Error) => {
      console.error('Session list WebSocket error:', error);
    });
  });
});

// WebSocket endpoint for existing session - receives queued events
fastify.register(async (fastify) => {
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/v1/sessions/:sessionId/ws',
    { websocket: true },
    (socket, req) => {
      const sessionId = req.params.sessionId;
      console.log(`Client connected to WebSocket for session: ${sessionId}`);

      // Get user info from request headers
      let context;
      try {
        context = extractRequestContextFromHeaders(req.headers);
      } catch (error: any) {
        socket.send(JSON.stringify({ error: error.message }));
        socket.close();
        return;
      }

      const { userId, userEmail, accessToken } = context;

      // Add this socket to the set of active connections for this session
      let sockets = sessionWebSockets.get(sessionId);
      if (!sockets) {
        sockets = new Set();
        sessionWebSockets.set(sessionId, sockets);
      }
      sockets.add(socket);

      const queue = sessionQueues.get(sessionId);

      // Event listener for new events
      const onEvent = (event: SDKMessage) => {
        socket.send(JSON.stringify(event));
      };

      socket.on('message', async (messageBuffer: Buffer) => {
        try {
          const messageStr = messageBuffer.toString();
          const message = JSON.parse(messageStr);

          if (message.type === 'connect') {
            socket.send(JSON.stringify({ type: 'connected' }));

            // Only send queued events if session is still being processed
            // Completed sessions should load history from REST API
            if (queue && !queue.completed) {
              for (const event of queue.events) {
                socket.send(JSON.stringify(event));
              }
              queue.listeners.add(onEvent);
            }
            return;
          }

          if (message.type === 'user_message') {
            // message.content is now MessageContent[] from frontend
            const userMessageContent = message.content as MessageContent[];
            const model = message.model || 'databricks-claude-sonnet-4-5';

            // Check if session already has a MessageStream (agent is running)
            const existingStream = sessionMessageStreams.get(sessionId);

            if (existingStream) {
              // Session is already running - queue the message
              console.log(
                `[WebSocket] Queueing message for existing session: ${sessionId}`
              );

              // Add message to stream queue
              existingStream.addMessage(userMessageContent);

              // Save user message to database
              // Note: Don't send back to client - frontend already added it optimistically
              const userMsg = createUserMessage(sessionId, userMessageContent);
              await saveMessage(userMsg);
            } else {
              // Start new agent session or resume existing one
              console.log(
                `[WebSocket] Starting agent for session: ${sessionId}`
              );

              // Fetch session to get workspacePath, autoWorkspacePush, and cwd for resume
              const session = await getSessionById(sessionId, userId);
              const workspacePath = session?.workspacePath ?? undefined;
              const autoWorkspacePush = session?.autoWorkspacePush ?? false;
              const sessionCwd = session?.cwd;

              // Validate that cwd exists (required for resume)
              if (!sessionCwd) {
                throw new Error(
                  'Session working directory not found. Cannot resume session.'
                );
              }

              // Get user settings for claudeConfigSync
              const userSettings = await getSettingsDirect(userId);
              const claudeConfigSync = userSettings?.claudeConfigSync ?? true;

              // Create MessageStream for this session
              const stream = new MessageStream(userMessageContent);
              sessionMessageStreams.set(sessionId, stream);

              // Save user message to database
              const userMsg = createUserMessage(sessionId, userMessageContent);
              await saveMessage(userMsg);

              // Process agent request and stream responses (use URL sessionId for resume)
              try {
                for await (const sdkMessage of processAgentRequest(
                  userMessageContent,
                  model,
                  sessionId,
                  userEmail,
                  workspacePath,
                  { autoWorkspacePush, claudeConfigSync, cwd: sessionCwd },
                  stream,
                  accessToken
                )) {
                  // Save message to database (always execute regardless of WebSocket state)
                  await saveMessage(sdkMessage);

                  // Send to client (continue even if WebSocket is disconnected)
                  try {
                    socket.send(JSON.stringify(sdkMessage));
                  } catch (sendError) {
                    console.error(
                      'Failed to send WebSocket message:',
                      sendError
                    );
                  }

                  // Note: workspace sync is now handled by Stop hook in agent/hooks.ts
                }
              } finally {
                // Cleanup MessageStream when agent completes
                sessionMessageStreams.delete(sessionId);
              }
            }
          }
        } catch (error: any) {
          console.error('WebSocket error:', error);
          try {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: error.message || 'Unknown error occurred',
              })
            );
          } catch (sendError) {
            console.error('Failed to send error message:', sendError);
          }
        }
      });

      socket.on('close', () => {
        console.log(
          `Client disconnected from WebSocket for session: ${sessionId}`
        );
        // Remove listener
        if (queue) {
          queue.listeners.delete(onEvent);
        }

        // Cleanup MessageStream on disconnect
        const stream = sessionMessageStreams.get(sessionId);
        if (stream) {
          stream.complete();
          sessionMessageStreams.delete(sessionId);
        }

        // Remove this socket from the active connections set
        const sockets = sessionWebSockets.get(sessionId);
        if (sockets) {
          sockets.delete(socket);
          // Clean up empty sets
          if (sockets.size === 0) {
            sessionWebSockets.delete(sessionId);
          }
        }
      });

      socket.on('error', (error: Error) => {
        console.error('WebSocket connection error:', error);
      });
    }
  );
});

// SPA fallback - catch all routes and serve index.html
fastify.setNotFoundHandler((_request, reply) => {
  reply.sendFile('index.html');
});

// Start server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`${signal} signal received: closing HTTP server`);
  await fastify.close();
  console.log('HTTP server closed');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
