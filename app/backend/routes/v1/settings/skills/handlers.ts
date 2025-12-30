import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractRequestContext } from '../../../../utils/headers.js';
import * as skillService from '../../../../services/skillService.js';
import { parseGitHubRepo } from '../../../../services/gitHubClient.js';

// List all skills
export async function listSkillsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  // Ensure user's directory structure exists
  context.user.ensureLocalDirs();

  try {
    const result = await skillService.listSkills(context.user);
    return result;
  } catch (error: any) {
    console.error('Failed to list skills:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Get single skill
export async function getSkillHandler(
  request: FastifyRequest<{ Params: { skillName: string } }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { skillName } = request.params;

  // Validate skill name
  if (!skillService.isValidSkillName(skillName)) {
    return reply.status(400).send({ error: 'Invalid skill name' });
  }

  try {
    const skill = await skillService.getSkill(context.user, skillName);
    if (!skill) {
      return reply.status(404).send({ error: 'Skill not found' });
    }
    return skill;
  } catch (error: any) {
    console.error('Failed to read skill:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Create new skill
export async function createSkillHandler(
  request: FastifyRequest<{
    Body: {
      name: string;
      description: string;
      version?: string;
      content: string;
    };
  }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { name, description, version = '1.0.0', content } = request.body;

  // Validate inputs
  if (!name || !description || !content) {
    return reply
      .status(400)
      .send({ error: 'name, description, and content are required' });
  }

  if (!skillService.isValidSkillName(name)) {
    return reply.status(400).send({ error: 'Invalid skill name' });
  }

  try {
    const skill = await skillService.createSkill(
      context.user,
      name,
      description,
      version,
      content
    );
    return skill;
  } catch (error: any) {
    if (error.message === 'Skill already exists') {
      return reply.status(409).send({ error: error.message });
    }
    console.error('Failed to create skill:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Update existing skill
export async function updateSkillHandler(
  request: FastifyRequest<{
    Params: { skillName: string };
    Body: { description: string; version?: string; content: string };
  }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { skillName } = request.params;
  const { description, version = '1.0.0', content } = request.body;

  // Validate inputs
  if (!description || !content) {
    return reply
      .status(400)
      .send({ error: 'description and content are required' });
  }

  if (!skillService.isValidSkillName(skillName)) {
    return reply.status(400).send({ error: 'Invalid skill name' });
  }

  try {
    const skill = await skillService.updateSkill(
      context.user,
      skillName,
      description,
      version,
      content
    );
    return skill;
  } catch (error: any) {
    if (error.message === 'Skill not found') {
      return reply.status(404).send({ error: error.message });
    }
    console.error('Failed to update skill:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Delete skill
export async function deleteSkillHandler(
  request: FastifyRequest<{ Params: { skillName: string } }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { skillName } = request.params;

  // Validate skill name
  if (!skillService.isValidSkillName(skillName)) {
    return reply.status(400).send({ error: 'Invalid skill name' });
  }

  try {
    await skillService.deleteSkill(context.user, skillName);
    return { success: true };
  } catch (error: any) {
    if (error.message === 'Skill not found') {
      return reply.status(404).send({ error: error.message });
    }
    console.error('Failed to delete skill:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// List all preset skills
export async function listPresetSkillsHandler(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const result = await skillService.listPresetSkills();
    return result;
  } catch (error: any) {
    console.error('Failed to list preset skills:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Import a preset skill to user's skills
export async function importPresetSkillHandler(
  request: FastifyRequest<{ Params: { presetName: string } }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { presetName } = request.params;

  // Validate preset name
  if (!skillService.isValidSkillName(presetName)) {
    return reply.status(400).send({ error: 'Invalid preset name' });
  }

  try {
    const skill = await skillService.importPresetSkill(
      context.user,
      presetName
    );
    return skill;
  } catch (error: any) {
    if (error.message === 'Preset skill not found') {
      return reply.status(404).send({ error: error.message });
    }
    console.error('Failed to import preset skill:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Import a skill from GitHub repository
export async function importGitHubSkillHandler(
  request: FastifyRequest<{
    Body: { repo: string; path?: string; branch?: string };
  }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { repo, path = '', branch } = request.body;

  // Validate required fields
  if (!repo || typeof repo !== 'string') {
    return reply.status(400).send({ error: 'repo is required' });
  }

  // Parse and validate repository URL
  const repoName = parseGitHubRepo(repo);
  if (!repoName) {
    return reply
      .status(400)
      .send({
        error: 'Invalid repo format. Use https://github.com/owner/repo',
      });
  }

  try {
    const skill = await skillService.importGitHubSkill(
      context.user,
      repoName,
      path,
      branch
    );
    return skill;
  } catch (error: any) {
    if (
      error.message === 'Invalid skill path' ||
      error.message === 'Skill not found in repository' ||
      error.message === 'SKILL.md not found in skill directory'
    ) {
      return reply.status(404).send({ error: error.message });
    }
    console.error('Failed to import GitHub skill:', error);
    return reply.status(500).send({ error: error.message });
  }
}
