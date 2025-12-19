import type { FastifyPluginAsync } from 'fastify';
import {
  listSkillsHandler,
  getSkillHandler,
  createSkillHandler,
  updateSkillHandler,
  deleteSkillHandler,
} from './handlers.js';

const skillRoutes: FastifyPluginAsync = async (fastify) => {
  // List all skills
  // GET /api/v1/settings/skills
  fastify.get('/', listSkillsHandler);

  // Get single skill
  // GET /api/v1/settings/skills/:skillName
  fastify.get('/:skillName', getSkillHandler);

  // Create new skill
  // POST /api/v1/settings/skills
  fastify.post('/', createSkillHandler);

  // Update existing skill
  // PATCH /api/v1/settings/skills/:skillName
  fastify.patch('/:skillName', updateSkillHandler);

  // Delete skill
  // DELETE /api/v1/settings/skills/:skillName
  fastify.delete('/:skillName', deleteSkillHandler);
};

export default skillRoutes;
