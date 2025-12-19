import type { FastifyPluginAsync } from 'fastify';
import {
  listSubagentsHandler,
  getSubagentHandler,
  createSubagentHandler,
  updateSubagentHandler,
  deleteSubagentHandler,
} from './handlers.js';

const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // List all subagents
  // GET /api/v1/settings/agents
  fastify.get('/', listSubagentsHandler);

  // Get single subagent
  // GET /api/v1/settings/agents/:subagentName
  fastify.get('/:subagentName', getSubagentHandler);

  // Create new subagent
  // POST /api/v1/settings/agents
  fastify.post('/', createSubagentHandler);

  // Update existing subagent
  // PATCH /api/v1/settings/agents/:subagentName
  fastify.patch('/:subagentName', updateSubagentHandler);

  // Delete subagent
  // DELETE /api/v1/settings/agents/:subagentName
  fastify.delete('/:subagentName', deleteSubagentHandler);
};

export default agentRoutes;
