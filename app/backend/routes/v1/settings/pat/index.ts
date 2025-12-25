import type { FastifyPluginAsync } from 'fastify';
import { extractRequestContext } from '../../../../utils/headers.js';
import * as userService from '../../../../services/userService.js';
import { isEncryptionAvailable } from '../../../../utils/encryption.js';

const patRoutes: FastifyPluginAsync = async (fastify) => {
  // Check if PAT is set (returns boolean only, never the actual PAT)
  // GET /api/v1/settings/pat
  fastify.get('/', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    if (!isEncryptionAvailable()) {
      return { hasPat: false, encryptionAvailable: false };
    }

    try {
      const hasPat = await userService.hasDatabricksPat(context.user.sub);
      return { hasPat, encryptionAvailable: true };
    } catch (error: any) {
      console.error('Failed to check PAT status:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // Set PAT
  // POST /api/v1/settings/pat
  fastify.post<{ Body: { pat: string } }>('/', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const { pat } = request.body;

    if (!pat || typeof pat !== 'string' || pat.trim().length === 0) {
      return reply.status(400).send({ error: 'PAT is required' });
    }

    if (!isEncryptionAvailable()) {
      return reply.status(503).send({
        error: 'PAT storage is not available. ENCRYPTION_KEY not configured.',
      });
    }

    try {
      const result = await userService.setDatabricksPat(
        context.user,
        pat.trim()
      );
      return {
        success: true,
        expiresAt: result.expiresAt?.toISOString() ?? null,
        comment: result.comment,
      };
    } catch (error: any) {
      console.error('Failed to set PAT:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // Clear PAT
  // DELETE /api/v1/settings/pat
  fastify.delete('/', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    try {
      await userService.clearDatabricksPat(context.user.sub);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to clear PAT:', error);
      return reply.status(500).send({ error: error.message });
    }
  });
};

export default patRoutes;
