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
  fastify.get('/', listSkillsHandler);

  // Get single skill
  fastify.get('/:skillName', getSkillHandler);

  // Create new skill
  fastify.post('/', createSkillHandler);

  // Update existing skill
  fastify.patch('/:skillName', updateSkillHandler);

  // Delete skill
  fastify.delete('/:skillName', deleteSkillHandler);
};

export default skillRoutes;
