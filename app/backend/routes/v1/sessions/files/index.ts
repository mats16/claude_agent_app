import type { FastifyPluginAsync } from 'fastify';
import {
  uploadFileHandler,
  listFilesHandler,
  downloadFileHandler,
} from './handlers.js';

// Common schemas
const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};

const sessionIdParams = {
  type: 'object',
  properties: { sessionId: { type: 'string', format: 'uuid' } },
  required: ['sessionId'],
};

const fileAttachment = {
  type: 'object',
  properties: {
    fileName: { type: 'string' },
    originalName: { type: 'string' },
    size: { type: 'number' },
    mimeType: { type: 'string' },
    uploadedAt: { type: 'string', format: 'date-time' },
  },
};

const sessionFileRoutes: FastifyPluginAsync = async (fastify) => {
  // Upload file to session (still uses /files for flat upload)
  fastify.post(
    '/:sessionId/files',
    {
      schema: {
        tags: ['files'],
        summary: 'Upload file',
        description: 'Upload a file to a session (multipart form data)',
        params: sessionIdParams,
        consumes: ['multipart/form-data'],
        response: {
          200: fileAttachment,
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    uploadFileHandler
  );

  // List files in session
  fastify.get(
    '/:sessionId/files',
    {
      schema: {
        tags: ['files'],
        summary: 'List files',
        description: 'List all files uploaded to a session',
        params: sessionIdParams,
        response: {
          200: {
            type: 'object',
            properties: {
              files: { type: 'array', items: fileAttachment },
            },
          },
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    listFilesHandler
  );

  // Download file from session (supports subdirectories via wildcard)
  fastify.get(
    '/:sessionId/fs/*',
    {
      schema: {
        tags: ['files'],
        summary: 'Download file',
        description: 'Download a file from session (supports subdirectories)',
        params: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
            '*': { type: 'string', description: 'File path' },
          },
          required: ['sessionId'],
        },
        response: {
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    downloadFileHandler
  );
};

export default sessionFileRoutes;
