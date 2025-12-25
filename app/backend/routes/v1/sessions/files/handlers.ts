import type { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import type {
  FileAttachment,
  FileUploadResponse,
  FileListResponse,
} from '@app/shared';
import { extractRequestContext } from '../../../../utils/headers.js';
import { getSessionById } from '../../../../db/sessions.js';

// Size limits
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Upload file handler
export async function uploadFileHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
): Promise<FileUploadResponse> {
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
  const session = await getSessionById(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  if (!session.agentLocalPath) {
    return reply
      .status(400)
      .send({ error: 'Session working directory not available' });
  }

  // Process multipart file
  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: 'No file uploaded' });
  }

  // Validate file size
  const buffer = await file.toBuffer();
  if (buffer.length > MAX_FILE_SIZE) {
    return reply.status(413).send({
      error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    });
  }

  // Sanitize filename to prevent path traversal
  const originalName = file.filename;
  const sanitizedName = path
    .basename(originalName)
    .replace(/[^a-zA-Z0-9._-]/g, '_');

  // Check for filename collision and add suffix if needed
  let finalName = sanitizedName;
  let counter = 1;
  while (fsSync.existsSync(path.join(session.agentLocalPath, finalName))) {
    const ext = path.extname(sanitizedName);
    const base = path.basename(sanitizedName, ext);
    finalName = `${base}_${counter}${ext}`;
    counter++;
  }

  // Save file to session agentLocalPath
  const filePath = path.join(session.agentLocalPath, finalName);
  await fs.writeFile(filePath, buffer);

  console.log(`[File Upload] Saved file: ${filePath} (${buffer.length} bytes)`);

  return {
    fileName: finalName,
    originalName,
    size: buffer.length,
    mimeType: file.mimetype,
  };
}

// List files handler
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
  const session = await getSessionById(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  if (!session.agentLocalPath) {
    return reply
      .status(400)
      .send({ error: 'Session working directory not available' });
  }

  // Check if directory exists
  try {
    await fs.access(session.agentLocalPath);
  } catch {
    return { files: [] };
  }

  // Read directory contents
  const entries = await fs.readdir(session.agentLocalPath, {
    withFileTypes: true,
  });
  const files: FileAttachment[] = [];

  for (const entry of entries) {
    if (entry.isFile()) {
      const filePath = path.join(session.agentLocalPath, entry.name);
      const stat = await fs.stat(filePath);

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

// Download file handler (supports subdirectories via wildcard path)
export async function downloadFileHandler(
  request: FastifyRequest<{ Params: { sessionId: string; '*': string } }>,
  reply: FastifyReply
): Promise<void> {
  const { sessionId } = request.params;
  const filePath = request.params['*'];

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
  const session = await getSessionById(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  if (!session.agentLocalPath) {
    return reply
      .status(400)
      .send({ error: 'Session working directory not available' });
  }

  // Normalize the path to prevent traversal attacks
  // path.normalize handles .. and . components
  const normalizedPath = path.normalize(filePath);

  // Prevent path traversal by checking for .. after normalization
  if (
    normalizedPath.startsWith('..') ||
    normalizedPath.includes('/..') ||
    normalizedPath.includes('\\..')
  ) {
    return reply.status(400).send({ error: 'Invalid file path' });
  }

  const fullPath = path.join(session.agentLocalPath, normalizedPath);

  // Verify the file is within the session agentLocalPath
  const resolvedPath = path.resolve(fullPath);
  const resolvedAgentLocalPath = path.resolve(session.agentLocalPath);
  if (
    !resolvedPath.startsWith(resolvedAgentLocalPath + path.sep) &&
    resolvedPath !== resolvedAgentLocalPath
  ) {
    return reply.status(400).send({ error: 'Invalid file path' });
  }

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
  };
  return mimeTypes[ext] || 'application/octet-stream';
}
