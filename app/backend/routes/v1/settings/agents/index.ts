import type { FastifyPluginAsync } from 'fastify';
import {
  listSubagentsHandler,
  getSubagentHandler,
  createSubagentHandler,
  updateSubagentHandler,
  deleteSubagentHandler,
  importGitHubSubagentHandler,
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

  // Import subagent from GitHub
  // POST /api/v1/settings/agents/import
  fastify.post('/import', importGitHubSubagentHandler);
};

export default agentRoutes;
