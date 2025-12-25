import type { FastifyPluginAsync } from 'fastify';
import {
  listSkillsHandler,
  getSkillHandler,
  createSkillHandler,
  updateSkillHandler,
  deleteSkillHandler,
  importGitHubSkillHandler,
} from './handlers.js';

// Common schemas
const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};

const successResponse = {
  type: 'object',
  properties: { success: { type: 'boolean' } },
  required: ['success'],
};

const skillNameParams = {
  type: 'object',
  properties: {
    skillName: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-]+$',
      description: 'Skill name (alphanumeric and hyphens)',
    },
  },
  required: ['skillName'],
};

const skillResponse = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['name', 'description', 'content'],
};

const skillRoutes: FastifyPluginAsync = async (fastify) => {
  // List all skills
  // GET /api/v1/settings/skills
  fastify.get(
    '/',
    {
      schema: {
        tags: ['skills'],
        summary: 'List all skills',
        description: 'List all skills for the current user',
        response: {
          200: {
            type: 'object',
            properties: {
              skills: { type: 'array', items: skillResponse },
            },
          },
          400: errorResponse,
          500: errorResponse,
        },
      },
    },
    listSkillsHandler
  );

  // Get single skill
  // GET /api/v1/settings/skills/:skillName
  fastify.get(
    '/:skillName',
    {
      schema: {
        tags: ['skills'],
        summary: 'Get skill',
        description: 'Get a specific skill by name',
        params: skillNameParams,
        response: {
          200: skillResponse,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    getSkillHandler
  );

  // Create new skill
  // POST /api/v1/settings/skills
  fastify.post(
    '/',
    {
      schema: {
        tags: ['skills'],
        summary: 'Create skill',
        description: 'Create a new skill',
        body: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              pattern: '^[a-zA-Z0-9-]+$',
              description: 'Skill name',
            },
            description: { type: 'string', maxLength: 500 },
            version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
            content: { type: 'string' },
          },
          required: ['name', 'description', 'content'],
        },
        response: {
          200: skillResponse,
          400: errorResponse,
          409: errorResponse,
          500: errorResponse,
        },
      },
    },
    createSkillHandler
  );

  // Import skill from GitHub repository
  // POST /api/v1/settings/skills/import-github
  fastify.post(
    '/import-github',
    {
      schema: {
        tags: ['skills'],
        summary: 'Import skill from GitHub',
        description: 'Import a skill from a GitHub repository',
        body: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
          },
          required: ['url'],
        },
        response: {
          200: skillResponse,
          400: errorResponse,
          500: errorResponse,
        },
      },
    },
    importGitHubSkillHandler
  );

  // Update existing skill
  // PATCH /api/v1/settings/skills/:skillName
  fastify.patch(
    '/:skillName',
    {
      schema: {
        tags: ['skills'],
        summary: 'Update skill',
        description: 'Update an existing skill',
        params: skillNameParams,
        body: {
          type: 'object',
          properties: {
            description: { type: 'string', maxLength: 500 },
            version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
            content: { type: 'string' },
          },
          required: ['description', 'content'],
        },
        response: {
          200: successResponse,
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    updateSkillHandler
  );

  // Delete skill
  // DELETE /api/v1/settings/skills/:skillName
  fastify.delete(
    '/:skillName',
    {
      schema: {
        tags: ['skills'],
        summary: 'Delete skill',
        description: 'Delete an existing skill',
        params: skillNameParams,
        response: {
          200: successResponse,
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    deleteSkillHandler
  );
};

export default skillRoutes;
