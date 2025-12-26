import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import * as fs from 'fs';
import * as pty from 'node-pty';
import { extractRequestContextFromHeaders } from '../../../utils/headers.js';
import { getSessionById } from '../../../db/sessions.js';

// Store active terminal sessions
const terminalSessions = new Map<
  string,
  { pty: pty.IPty; sockets: Set<WebSocket> }
>();

const terminalWebSocketRoutes: FastifyPluginAsync = async (fastify) => {
  // WebSocket endpoint for terminal access
  fastify.get<{ Params: { sessionId: string } }>(
    '/:sessionId/terminal/ws',
    { websocket: true },
    async (socket, req) => {
      const sessionId = req.params.sessionId;
      console.log(`Terminal WebSocket connected for session: ${sessionId}`);

      // Get user info from request headers
      let context;
      try {
        context = extractRequestContextFromHeaders(req.headers);
      } catch (error: any) {
        socket.send(JSON.stringify({ type: 'error', error: error.message }));
        socket.close();
        return;
      }

      const { user } = context;
      const userId = user.sub;

      // Verify session exists and belongs to user
      const session = await getSessionById(sessionId, userId);
      if (!session) {
        socket.send(
          JSON.stringify({ type: 'error', error: 'Session not found' })
        );
        socket.close();
        return;
      }

      // Get the agent's local working directory
      // Validate that the directory exists, recreate if needed, fallback to HOME
      const agentPath = session.agentLocalPath;
      const homePath = process.env.HOME;
      let cwd: string;

      // Helper to check if a path is a valid, accessible directory
      const isValidDirectory = (p: string | undefined): p is string => {
        if (!p) return false;
        try {
          const stat = fs.statSync(p);
          return stat.isDirectory();
        } catch {
          return false;
        }
      };

      if (isValidDirectory(agentPath)) {
        cwd = agentPath;
        console.log(`Terminal using agentLocalPath: "${cwd}"`);
      } else if (agentPath) {
        // agentLocalPath is set but doesn't exist - try to recreate it
        try {
          fs.mkdirSync(agentPath, { recursive: true });
          cwd = agentPath;
          console.log(`Terminal recreated agentLocalPath: "${cwd}"`);
        } catch (mkdirError) {
          console.warn(
            `Terminal failed to recreate agentLocalPath: ${agentPath}`,
            mkdirError
          );
          cwd = homePath || '/tmp';
        }
      } else {
        cwd = homePath || '/tmp';
        console.log(`Terminal using fallback HOME: "${cwd}"`);
      }

      // Final validation
      if (!isValidDirectory(cwd)) {
        console.error(`Terminal final cwd is not a valid directory: "${cwd}"`);
        socket.send(
          JSON.stringify({
            type: 'error',
            error: `Working directory is not accessible: ${cwd}`,
          })
        );
        socket.close();
        return;
      }

      // Determine shell to use
      const shell = process.env.SHELL || '/bin/bash';
      if (!fs.existsSync(shell)) {
        console.error(`Terminal shell does not exist: ${shell}`);
        socket.send(
          JSON.stringify({
            type: 'error',
            error: `Shell not found: ${shell}`,
          })
        );
        socket.close();
        return;
      }

      // Check if terminal session already exists for this session
      let terminalSession = terminalSessions.get(sessionId);

      if (!terminalSession) {
        // Create new PTY
        let ptyProcess: pty.IPty;
        let usedCwd = cwd;

        const spawnPty = (workingDir: string): pty.IPty => {
          console.log(
            `Terminal spawning PTY: shell="${shell}", cwd="${workingDir}"`
          );
          return pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: workingDir,
            env: {
              ...process.env,
              TERM: 'xterm-256color',
            } as Record<string, string>,
          });
        };

        try {
          ptyProcess = spawnPty(cwd);
        } catch (spawnError: any) {
          console.error(
            `Failed to spawn PTY with cwd="${cwd}":`,
            spawnError.message
          );

          // Try fallback to HOME if different from original cwd
          const fallbackCwd = process.env.HOME || '/tmp';
          if (fallbackCwd !== cwd && isValidDirectory(fallbackCwd)) {
            try {
              console.log(
                `Retrying PTY spawn with fallback cwd="${fallbackCwd}"`
              );
              ptyProcess = spawnPty(fallbackCwd);
              usedCwd = fallbackCwd;
            } catch (fallbackError: any) {
              console.error(
                `Failed to spawn PTY with fallback cwd="${fallbackCwd}":`,
                fallbackError.message
              );
              socket.send(
                JSON.stringify({
                  type: 'error',
                  error: `Failed to start terminal: ${fallbackError.message}`,
                })
              );
              socket.close();
              return;
            }
          } else {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: `Failed to start terminal: ${spawnError.message}`,
              })
            );
            socket.close();
            return;
          }
        }

        // Update cwd to what was actually used
        cwd = usedCwd;

        terminalSession = {
          pty: ptyProcess,
          sockets: new Set(),
        };
        terminalSessions.set(sessionId, terminalSession);

        // Handle PTY output - send to all connected sockets
        ptyProcess.onData((data) => {
          const message = JSON.stringify({ type: 'output', data });
          terminalSession!.sockets.forEach((ws) => {
            try {
              ws.send(message);
            } catch (e) {
              console.error('Failed to send terminal output:', e);
            }
          });
        });

        // Handle PTY exit
        ptyProcess.onExit(({ exitCode, signal }) => {
          console.log(
            `Terminal PTY exited for session ${sessionId}: code=${exitCode}, signal=${signal}`
          );
          const exitMessage = JSON.stringify({
            type: 'exit',
            exitCode,
            signal,
          });
          terminalSession!.sockets.forEach((ws) => {
            try {
              ws.send(exitMessage);
            } catch (e) {
              console.error('Failed to send exit message:', e);
            }
          });
          terminalSessions.delete(sessionId);
        });
      }

      // Add this socket to the terminal session
      terminalSession.sockets.add(socket);

      // Send connected message with current terminal size
      socket.send(JSON.stringify({ type: 'connected', cwd }));

      // Handle incoming messages from client
      socket.on('message', (messageBuffer: Buffer) => {
        try {
          const messageStr = messageBuffer.toString();
          const message = JSON.parse(messageStr);

          if (message.type === 'input' && terminalSession?.pty) {
            // Write input to PTY
            terminalSession.pty.write(message.data);
          } else if (message.type === 'resize' && terminalSession?.pty) {
            // Resize PTY
            const { cols, rows } = message;
            if (
              typeof cols === 'number' &&
              typeof rows === 'number' &&
              cols > 0 &&
              rows > 0
            ) {
              terminalSession.pty.resize(cols, rows);
            }
          }
        } catch (error) {
          console.error('Terminal WebSocket message error:', error);
        }
      });

      // Handle socket close
      socket.on('close', () => {
        console.log(
          `Terminal WebSocket disconnected for session: ${sessionId}`
        );
        if (terminalSession) {
          terminalSession.sockets.delete(socket);

          // Clean up PTY if no more connections
          if (terminalSession.sockets.size === 0) {
            console.log(
              `Killing PTY for session ${sessionId} (no connections)`
            );
            terminalSession.pty.kill();
            terminalSessions.delete(sessionId);
          }
        }
      });

      // Handle socket error
      socket.on('error', (error: Error) => {
        console.error('Terminal WebSocket error:', error);
      });
    }
  );
};

export default terminalWebSocketRoutes;
