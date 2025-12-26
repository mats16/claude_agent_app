import type { FastifyPluginAsync } from 'fastify';
import {
  filesHandler,
  uploadFileHandler,
  deleteFileHandler,
} from './handlers.js';

const sessionFileRoutes: FastifyPluginAsync = async (fastify) => {
  // Configure raw body parsing for upload endpoint
  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (req, body, done) => {
      done(null, body);
    }
  );

  // Also handle other content types as raw buffer for file uploads
  fastify.addContentTypeParser(
    /^(?!application\/json|multipart\/form-data).*/,
    { parseAs: 'buffer' },
    (req, body, done) => {
      done(null, body);
    }
  );

  // GET /files - List files (no path) or Get file (with path)
  fastify.get('/:sessionId/files', filesHandler);

  // POST /files?path={path} - Upload file (raw body)
  fastify.post('/:sessionId/files', uploadFileHandler);

  // DELETE /files?path={path} - Delete file
  fastify.delete('/:sessionId/files', deleteFileHandler);
};

export default sessionFileRoutes;
