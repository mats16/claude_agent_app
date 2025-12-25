import type { FastifyPluginAsync } from 'fastify';
import {
  listPresetSkillsHandler,
  importPresetSkillHandler,
} from '../settings/skills/handlers.js';
import {
  listPresetSubagentsHandler,
  importPresetSubagentHandler,
} from '../settings/agents/handlers.js';

const presetSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  // List all preset skills
  // GET /api/v1/preset-settings/skills
  fastify.get('/skills', listPresetSkillsHandler);

  // Import preset skill
  // POST /api/v1/preset-settings/skills/:presetName/import
  fastify.post('/skills/:presetName/import', importPresetSkillHandler);

  // List all preset subagents
  // GET /api/v1/preset-settings/agents
  fastify.get('/agents', listPresetSubagentsHandler);

  // Import preset subagent
  // POST /api/v1/preset-settings/agents/:presetName/import
  fastify.post('/agents/:presetName/import', importPresetSubagentHandler);
};

export default presetSettingsRoutes;
