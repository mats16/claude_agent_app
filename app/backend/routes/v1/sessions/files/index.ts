import type { FastifyPluginAsync } from 'fastify';
import {
  uploadFileHandler,
  listFilesHandler,
  downloadFileHandler,
} from './handlers.js';

const sessionFileRoutes: FastifyPluginAsync = async (fastify) => {
  // Upload file to session (still uses /files for flat upload)
  fastify.post('/:sessionId/files', uploadFileHandler);

  // List files in session
  fastify.get('/:sessionId/files', listFilesHandler);

  // Download file from session (supports subdirectories via wildcard)
  fastify.get('/:sessionId/fs/*', downloadFileHandler);
};

export default sessionFileRoutes;
