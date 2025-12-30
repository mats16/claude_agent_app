import type { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import type {
  FileAttachment,
  FileUploadResponse,
  FileListResponse,
  FileDeleteResponse,
} from '@app/shared';
import { extractRequestContext } from '../../../../utils/headers.js';
import { getSessionById } from '../../../../db/sessions.js';
import { Session } from '../../../../models/Session.js';

// Size limits
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Helper: Validate and resolve file path within session directory
function validateFilePath(
  filePath: string,
  agentLocalPath: string
): { valid: true; fullPath: string } | { valid: false; error: string } {
  // Normalize the path to prevent traversal attacks
  const normalizedPath = path.normalize(filePath);

  // Prevent path traversal by checking for .. after normalization
  if (
    normalizedPath.startsWith('..') ||
    normalizedPath.includes('/..') ||
    normalizedPath.includes('\\..')
  ) {
    return { valid: false, error: 'Invalid file path' };
  }

  const fullPath = path.join(agentLocalPath, normalizedPath);

  // Verify the file is within the session agentLocalPath
  const resolvedPath = path.resolve(fullPath);
  const resolvedAgentLocalPath = path.resolve(agentLocalPath);
  if (
    !resolvedPath.startsWith(resolvedAgentLocalPath + path.sep) &&
    resolvedPath !== resolvedAgentLocalPath
  ) {
    return { valid: false, error: 'Invalid file path' };
  }

  return { valid: true, fullPath };
}

// Helper function to get mime type from file extension
function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.xml': 'application/xml',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
    '.pdf': 'application/pdf',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.py': 'text/x-python',
    '.sql': 'application/sql',
    '.sh': 'application/x-sh',
    '.log': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// GET /files - List files or GET /files?path={path} - Get file
// This handler routes based on presence of path query parameter
export async function filesHandler(
  request: FastifyRequest<{
    Params: { sessionId: string };
    Querystring: { path?: string };
  }>,
  reply: FastifyReply
): Promise<FileListResponse | void> {
  const filePath = request.query.path;

  if (filePath) {
    // Delegate to getFileHandler
    return getFileHandler(request as any, reply);
  } else {
    // Delegate to listFilesHandler
    return listFilesHandler(request, reply);
  }
}

// GET /files?path={path} - Get/download file
export async function getFileHandler(
  request: FastifyRequest<{
    Params: { sessionId: string };
    Querystring: { path: string };
  }>,
  reply: FastifyReply
): Promise<void> {
  const { sessionId } = request.params;
  const filePath = request.query.path;

  if (!filePath) {
    return reply.status(400).send({ error: 'File path is required' });
  }

  // Extract user context
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // Verify session ownership and get agentLocalPath
  const selectSession = await getSessionById(sessionId, userId);
  if (!selectSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Convert to Session model to get working directory
  const session = new Session(selectSession);

  // Validate file path
  const validation = validateFilePath(filePath, session.cwd());
  if (!validation.valid) {
    return reply.status(400).send({ error: validation.error });
  }

  const fullPath = validation.fullPath;

  // Check if file exists
  try {
    await fs.access(fullPath);
  } catch {
    return reply.status(404).send({ error: 'File not found' });
  }

  // Check if it's a file (not directory)
  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) {
    return reply.status(400).send({ error: 'Path is not a file' });
  }

  // Get mime type from the filename
  const fileName = path.basename(fullPath);
  const mimeType = getMimeType(fileName);

  // Set headers for download
  reply.header('Content-Type', mimeType);
  reply.header('Content-Length', stat.size);
  reply.header(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(fileName)}"`
  );

  // Stream file
  const stream = fsSync.createReadStream(fullPath);
  return reply.send(stream);
}

// POST /files?path={path} - Upload file (raw body)
export async function uploadFileHandler(
  request: FastifyRequest<{
    Params: { sessionId: string };
    Querystring: { path: string };
  }>,
  reply: FastifyReply
): Promise<FileUploadResponse> {
  const { sessionId } = request.params;
  const filePath = request.query.path;

  if (!filePath) {
    return reply.status(400).send({ error: 'File path is required' });
  }

  // Extract user context
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // Verify session ownership and get agentLocalPath
  const selectSession = await getSessionById(sessionId, userId);
  if (!selectSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Convert to Session model to get working directory
  const session = new Session(selectSession);

  // Validate file path
  const validation = validateFilePath(filePath, session.cwd());
  if (!validation.valid) {
    return reply.status(400).send({ error: validation.error });
  }

  const fullPath = validation.fullPath;

  // Get raw body as buffer
  const buffer = request.body as Buffer;
  if (!buffer || buffer.length === 0) {
    return reply.status(400).send({ error: 'No file content provided' });
  }

  // Validate file size
  if (buffer.length > MAX_FILE_SIZE) {
    return reply.status(413).send({
      error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    });
  }

  // Create parent directories if needed
  const parentDir = path.dirname(fullPath);
  await fs.mkdir(parentDir, { recursive: true });

  // Save file
  await fs.writeFile(fullPath, buffer);

  // Get mime type from Content-Type header or file extension
  const contentType = request.headers['content-type'];
  const fileName = path.basename(fullPath);
  const mimeType =
    contentType && contentType !== 'application/octet-stream'
      ? contentType
      : getMimeType(fileName);

  console.log(`[File Upload] Saved file: ${fullPath} (${buffer.length} bytes)`);

  return {
    path: filePath,
    size: buffer.length,
    mime_type: mimeType,
  };
}

// DELETE /files?path={path} - Delete file
export async function deleteFileHandler(
  request: FastifyRequest<{
    Params: { sessionId: string };
    Querystring: { path: string };
  }>,
  reply: FastifyReply
): Promise<FileDeleteResponse> {
  const { sessionId } = request.params;
  const filePath = request.query.path;

  if (!filePath) {
    return reply.status(400).send({ error: 'File path is required' });
  }

  // Extract user context
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // Verify session ownership and get agentLocalPath
  const selectSession = await getSessionById(sessionId, userId);
  if (!selectSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Convert to Session model to get working directory
  const session = new Session(selectSession);

  // Validate file path
  const validation = validateFilePath(filePath, session.cwd());
  if (!validation.valid) {
    return reply.status(400).send({ error: validation.error });
  }

  const fullPath = validation.fullPath;

  // Check if file exists
  try {
    await fs.access(fullPath);
  } catch {
    return reply.status(404).send({ error: 'File not found' });
  }

  // Check if it's a file (not directory)
  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) {
    return reply.status(400).send({ error: 'Path is not a file' });
  }

  // Delete file
  await fs.unlink(fullPath);

  console.log(`[File Delete] Deleted file: ${fullPath}`);

  return {
    success: true,
    path: filePath,
  };
}

// List files handler (internal, called by filesHandler)
export async function listFilesHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
): Promise<FileListResponse> {
  const { sessionId } = request.params;

  // Extract user context
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // Verify session ownership and get agentLocalPath
  const selectSession = await getSessionById(sessionId, userId);
  if (!selectSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Convert to Session model to get working directory
  const session = new Session(selectSession);

  // Check if directory exists
  try {
    await fs.access(session.cwd());
  } catch {
    return { files: [] };
  }

  // Read directory contents
  const entries = await fs.readdir(session.cwd(), {
    withFileTypes: true,
  });
  const files: FileAttachment[] = [];

  for (const entry of entries) {
    if (entry.isFile()) {
      const entryPath = path.join(session.cwd(), entry.name);
      const stat = await fs.stat(entryPath);

      // Detect mime type based on extension
      const mimeType = getMimeType(entry.name);

      files.push({
        fileName: entry.name,
        originalName: entry.name,
        size: stat.size,
        mimeType,
        uploadedAt: stat.mtime.toISOString(),
      });
    }
  }

  // Sort by upload time (newest first)
  files.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );

  return { files };
}
