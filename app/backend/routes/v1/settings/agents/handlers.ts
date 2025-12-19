import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractRequestContext } from '../../../../utils/headers.js';
import * as subagentService from '../../../../services/subagentService.js';

// List all subagents
export async function listSubagentsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  try {
    const result = await subagentService.listSubagents(context.userEmail);
    return result;
  } catch (error: any) {
    console.error('Failed to list subagents:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Get single subagent
export async function getSubagentHandler(
  request: FastifyRequest<{ Params: { subagentName: string } }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { subagentName } = request.params;

  // Validate subagent name
  if (!subagentService.isValidSubagentName(subagentName)) {
    return reply.status(400).send({ error: 'Invalid subagent name' });
  }

  try {
    const subagent = await subagentService.getSubagent(
      context.userEmail,
      subagentName
    );
    if (!subagent) {
      return reply.status(404).send({ error: 'Subagent not found' });
    }
    return subagent;
  } catch (error: any) {
    console.error('Failed to read subagent:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Create new subagent
export async function createSubagentHandler(
  request: FastifyRequest<{
    Body: {
      name: string;
      description: string;
      tools?: string;
      model?: 'sonnet' | 'opus';
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

  const { name, description, tools, model, content } = request.body;

  // Validate inputs
  if (!name || !description || !content) {
    return reply
      .status(400)
      .send({ error: 'name, description, and content are required' });
  }

  if (!subagentService.isValidSubagentName(name)) {
    return reply.status(400).send({ error: 'Invalid subagent name' });
  }

  // Validate model if provided
  if (model && model !== 'sonnet' && model !== 'opus') {
    return reply
      .status(400)
      .send({ error: 'model must be either "sonnet" or "opus"' });
  }

  try {
    const subagent = await subagentService.createSubagent(
      context.userEmail,
      name,
      description,
      content,
      tools,
      model
    );
    return subagent;
  } catch (error: any) {
    if (error.message === 'Subagent already exists') {
      return reply.status(409).send({ error: error.message });
    }
    console.error('Failed to create subagent:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Update existing subagent
export async function updateSubagentHandler(
  request: FastifyRequest<{
    Params: { subagentName: string };
    Body: {
      description: string;
      tools?: string;
      model?: 'sonnet' | 'opus';
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

  const { subagentName } = request.params;
  const { description, tools, model, content } = request.body;

  // Validate inputs
  if (!description || !content) {
    return reply
      .status(400)
      .send({ error: 'description and content are required' });
  }

  if (!subagentService.isValidSubagentName(subagentName)) {
    return reply.status(400).send({ error: 'Invalid subagent name' });
  }

  // Validate model if provided
  if (model && model !== 'sonnet' && model !== 'opus') {
    return reply
      .status(400)
      .send({ error: 'model must be either "sonnet" or "opus"' });
  }

  try {
    const subagent = await subagentService.updateSubagent(
      context.userEmail,
      subagentName,
      description,
      content,
      tools,
      model
    );
    return subagent;
  } catch (error: any) {
    if (error.message === 'Subagent not found') {
      return reply.status(404).send({ error: error.message });
    }
    console.error('Failed to update subagent:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Delete subagent
export async function deleteSubagentHandler(
  request: FastifyRequest<{ Params: { subagentName: string } }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { subagentName } = request.params;

  // Validate subagent name
  if (!subagentService.isValidSubagentName(subagentName)) {
    return reply.status(400).send({ error: 'Invalid subagent name' });
  }

  try {
    await subagentService.deleteSubagent(context.userEmail, subagentName);
    return { success: true };
  } catch (error: any) {
    if (error.message === 'Subagent not found') {
      return reply.status(404).send({ error: error.message });
    }
    console.error('Failed to delete subagent:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// List all preset subagents
export async function listPresetSubagentsHandler(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const result = await subagentService.listPresetSubagents();
    return result;
  } catch (error: any) {
    console.error('Failed to list preset subagents:', error);
    return reply.status(500).send({ error: error.message });
  }
}

// Import a preset subagent to user's subagents
export async function importPresetSubagentHandler(
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
  if (!subagentService.isValidSubagentName(presetName)) {
    return reply.status(400).send({ error: 'Invalid preset name' });
  }

  try {
    const subagent = await subagentService.importPresetSubagent(
      context.userEmail,
      presetName
    );
    return subagent;
  } catch (error: any) {
    if (error.message === 'Preset subagent not found') {
      return reply.status(404).send({ error: error.message });
    }
    console.error('Failed to import preset subagent:', error);
    return reply.status(500).send({ error: error.message });
  }
}
