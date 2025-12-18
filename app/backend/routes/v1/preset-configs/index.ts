import type { FastifyPluginAsync } from 'fastify';
import {
  listPresetSkillsHandler,
  importPresetSkillHandler,
} from '../skills/handlers.js';

const presetConfigRoutes: FastifyPluginAsync = async (fastify) => {
  // List all preset skills
  // GET /api/v1/preset-configs/claude/skills
  fastify.get('/claude/skills', listPresetSkillsHandler);

  // Import preset skill
  // POST /api/v1/preset-configs/claude/skills/:skillName/import
  fastify.post('/claude/skills/:presetName/import', importPresetSkillHandler);
};

export default presetConfigRoutes;
