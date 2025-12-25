import type { FastifyPluginAsync } from 'fastify';
import {
  listPresetSkillsHandler,
  importPresetSkillHandler,
} from '../settings/skills/handlers.js';
import {
  listPresetSubagentsHandler,
  importPresetSubagentHandler,
} from '../settings/agents/handlers.js';

// Common schemas
const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};

const presetNameParams = {
  type: 'object',
  properties: {
    presetName: { type: 'string', pattern: '^[a-zA-Z0-9-]+$' },
  },
  required: ['presetName'],
};

const skillResponse = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'string' },
    content: { type: 'string' },
  },
};

const subagentResponse = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    tools: { type: 'string', nullable: true },
    model: { type: 'string', enum: ['sonnet', 'opus'], nullable: true },
    content: { type: 'string' },
  },
};

const presetSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  // List all preset skills
  // GET /api/v1/preset-settings/skills
  fastify.get(
    '/skills',
    {
      schema: {
        tags: ['preset-settings'],
        summary: 'List preset skills',
        description: 'List all available preset skills',
        response: {
          200: {
            type: 'object',
            properties: {
              presets: { type: 'array', items: skillResponse },
            },
          },
          500: errorResponse,
        },
      },
    },
    listPresetSkillsHandler
  );

  // Import preset skill
  // POST /api/v1/preset-settings/skills/:presetName/import
  fastify.post(
    '/skills/:presetName/import',
    {
      schema: {
        tags: ['preset-settings'],
        summary: 'Import preset skill',
        description: 'Import a preset skill to user skills',
        params: presetNameParams,
        response: {
          200: skillResponse,
          400: errorResponse,
          404: errorResponse,
          409: errorResponse,
          500: errorResponse,
        },
      },
    },
    importPresetSkillHandler
  );

  // List all preset subagents
  // GET /api/v1/preset-settings/agents
  fastify.get(
    '/agents',
    {
      schema: {
        tags: ['preset-settings'],
        summary: 'List preset subagents',
        description: 'List all available preset subagents',
        response: {
          200: {
            type: 'object',
            properties: {
              presets: { type: 'array', items: subagentResponse },
            },
          },
          500: errorResponse,
        },
      },
    },
    listPresetSubagentsHandler
  );

  // Import preset subagent
  // POST /api/v1/preset-settings/agents/:presetName/import
  fastify.post(
    '/agents/:presetName/import',
    {
      schema: {
        tags: ['preset-settings'],
        summary: 'Import preset subagent',
        description: 'Import a preset subagent to user subagents',
        params: presetNameParams,
        response: {
          200: subagentResponse,
          400: errorResponse,
          404: errorResponse,
          409: errorResponse,
          500: errorResponse,
        },
      },
    },
    importPresetSubagentHandler
  );
};

export default presetSettingsRoutes;
