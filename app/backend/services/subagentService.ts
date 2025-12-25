import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOidcAccessToken } from '../agent/index.js';
import {
  parseSubagentContent,
  formatSubagentContent,
  type SubagentMetadata,
} from '../utils/subagents.js';
import { WorkspaceClient } from '../utils/workspaceClient.js';
import { getSettingsDirect } from '../db/settings.js';
import type { RequestUser } from '../models/RequestUser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Subagent extends SubagentMetadata {}

export interface SubagentListResult {
  subagents: Subagent[];
}

export interface PresetSubagentListResult {
  presets: Subagent[];
}

// Get preset agents directory path
function getPresetAgentsPath(): string {
  return path.join(__dirname, '../preset-settings/agents');
}

// Put a single agent to workspace (fire-and-forget)
async function putAgentToWorkspace(
  user: RequestUser,
  agentName: string,
  content: string
): Promise<void> {
  // Check if claudeConfigAutoPush is enabled
  const userSettings = await getSettingsDirect(user.sub);
  if (!userSettings?.claudeConfigAutoPush) {
    console.log(
      '[Subagents] Workspace sync skipped (claudeConfigAutoPush disabled)'
    );
    return;
  }

  const spToken = await getOidcAccessToken();
  if (!spToken) {
    console.error('[Subagents] Workspace sync skipped (no SP token available)');
    return;
  }

  const workspaceAgentPath = path.join(
    user.remoteAgentsPath,
    `${agentName}.md`
  );

  const client = new WorkspaceClient({
    host: process.env.DATABRICKS_HOST!,
    getToken: async () => spToken,
  });

  await client.putObject(workspaceAgentPath, content, { overwrite: true });
  console.log(`[Subagents] Uploaded agent ${agentName} to workspace`);
}

// Delete an agent from workspace (fire-and-forget)
async function deleteAgentFromWorkspace(
  user: RequestUser,
  agentName: string
): Promise<void> {
  // Check if claudeConfigAutoPush is enabled
  const userSettings = await getSettingsDirect(user.sub);
  if (!userSettings?.claudeConfigAutoPush) {
    console.log(
      '[Subagents] Workspace delete skipped (claudeConfigAutoPush disabled)'
    );
    return;
  }

  const spToken = await getOidcAccessToken();
  if (!spToken) {
    console.error(
      '[Subagents] Workspace delete skipped (no SP token available)'
    );
    return;
  }

  const workspaceAgentPath = path.join(
    user.remoteAgentsPath,
    `${agentName}.md`
  );

  const client = new WorkspaceClient({
    host: process.env.DATABRICKS_HOST!,
    getToken: async () => spToken,
  });

  const result = await client.deleteObject(workspaceAgentPath);

  if (result.deleted) {
    console.log(`[Subagents] Deleted agent ${agentName} from workspace`);
  } else {
    console.log(
      `[Subagents] Agent ${agentName} not found in workspace (already deleted)`
    );
  }
}

// List all subagents for a user
export async function listSubagents(
  user: RequestUser
): Promise<SubagentListResult> {
  const agentsPath = user.agentsPath;

  // Ensure agents directory exists
  if (!fs.existsSync(agentsPath)) {
    fs.mkdirSync(agentsPath, { recursive: true });
    return { subagents: [] };
  }

  // Read all .md files directly (not subdirectories like skills)
  const files = fs.readdirSync(agentsPath);
  const subagents = files
    .filter((file) => file.endsWith('.md'))
    .map((file): Subagent | null => {
      const filePath = path.join(agentsPath, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseSubagentContent(fileContent);
      const name = parsed.name || file.replace(/\.md$/, '');
      if (!name) return null;
      return {
        name,
        description: parsed.description,
        tools: parsed.tools,
        model: parsed.model,
        content: parsed.content,
      };
    })
    .filter((subagent): subagent is Subagent => subagent !== null);

  return { subagents };
}

// Get a single subagent by name
export async function getSubagent(
  user: RequestUser,
  subagentName: string
): Promise<Subagent | null> {
  const subagentPath = path.join(user.agentsPath, `${subagentName}.md`);

  if (!fs.existsSync(subagentPath)) {
    return null;
  }

  const fileContent = fs.readFileSync(subagentPath, 'utf-8');
  const parsed = parseSubagentContent(fileContent);
  return {
    name: subagentName,
    description: parsed.description,
    tools: parsed.tools,
    model: parsed.model,
    content: parsed.content,
  };
}

// Create a new subagent
export async function createSubagent(
  user: RequestUser,
  name: string,
  description: string,
  content: string,
  tools?: string,
  model?: 'sonnet' | 'opus'
): Promise<Subagent> {
  const agentsPath = user.agentsPath;
  const subagentPath = path.join(agentsPath, `${name}.md`);

  // Ensure agents directory exists
  if (!fs.existsSync(agentsPath)) {
    fs.mkdirSync(agentsPath, { recursive: true });
  }

  // Check if subagent already exists
  if (fs.existsSync(subagentPath)) {
    throw new Error('Subagent already exists');
  }

  // Write subagent file with YAML frontmatter
  const fileContent = formatSubagentContent(
    name,
    description,
    content,
    tools,
    model
  );
  fs.writeFileSync(subagentPath, fileContent, 'utf-8');

  // Upload to workspace (fire-and-forget)
  putAgentToWorkspace(user, name, fileContent).catch((err: Error) => {
    console.error(`[Subagents] Failed to upload after create: ${err.message}`);
  });

  return { name, description, tools, model, content };
}

// Update an existing subagent
export async function updateSubagent(
  user: RequestUser,
  subagentName: string,
  description: string,
  content: string,
  tools?: string,
  model?: 'sonnet' | 'opus'
): Promise<Subagent> {
  const agentsPath = user.agentsPath;
  const subagentPath = path.join(agentsPath, `${subagentName}.md`);

  // Check if subagent exists
  if (!fs.existsSync(subagentPath)) {
    throw new Error('Subagent not found');
  }

  // Update subagent file with YAML frontmatter
  const fileContent = formatSubagentContent(
    subagentName,
    description,
    content,
    tools,
    model
  );
  fs.writeFileSync(subagentPath, fileContent, 'utf-8');

  // Upload to workspace (fire-and-forget)
  putAgentToWorkspace(user, subagentName, fileContent).catch((err: Error) => {
    console.error(`[Subagents] Failed to upload after update: ${err.message}`);
  });

  return { name: subagentName, description, tools, model, content };
}

// Delete a subagent
export async function deleteSubagent(
  user: RequestUser,
  subagentName: string
): Promise<void> {
  const agentsPath = user.agentsPath;
  const subagentPath = path.join(agentsPath, `${subagentName}.md`);

  // Check if subagent exists
  if (!fs.existsSync(subagentPath)) {
    throw new Error('Subagent not found');
  }

  // Delete single file (not recursive like skills)
  fs.unlinkSync(subagentPath);

  // Delete from workspace (fire-and-forget)
  deleteAgentFromWorkspace(user, subagentName).catch((err: Error) => {
    console.error(
      `[Subagents] Failed to delete from workspace: ${err.message}`
    );
  });
}

// List all preset subagents
export async function listPresetSubagents(): Promise<PresetSubagentListResult> {
  const presetAgentsPath = getPresetAgentsPath();

  // Ensure preset-agents directory exists
  if (!fs.existsSync(presetAgentsPath)) {
    return { presets: [] };
  }

  // Read all .md files in the preset-agents directory
  const files = fs.readdirSync(presetAgentsPath);
  const presets = files
    .filter((file) => file.endsWith('.md'))
    .map((file): Subagent | null => {
      const filePath = path.join(presetAgentsPath, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseSubagentContent(fileContent);
      const name = parsed.name || file.replace(/\.md$/, '');
      if (!name) return null;
      return {
        name,
        description: parsed.description,
        tools: parsed.tools,
        model: parsed.model,
        content: parsed.content,
      };
    })
    .filter((preset): preset is Subagent => preset !== null);

  return { presets };
}

// Import a preset subagent to user's subagents
export async function importPresetSubagent(
  user: RequestUser,
  presetName: string
): Promise<Subagent> {
  const presetAgentsPath = getPresetAgentsPath();
  const presetFilePath = path.join(presetAgentsPath, `${presetName}.md`);

  // Check if preset exists
  if (!fs.existsSync(presetFilePath)) {
    throw new Error('Preset subagent not found');
  }

  // Read preset file
  const presetContent = fs.readFileSync(presetFilePath, 'utf-8');
  const parsed = parseSubagentContent(presetContent);

  const agentsPath = user.agentsPath;
  const subagentPath = path.join(agentsPath, `${parsed.name}.md`);

  // Ensure agents directory exists
  if (!fs.existsSync(agentsPath)) {
    fs.mkdirSync(agentsPath, { recursive: true });
  }

  // If subagent already exists, remove it first (overwrite)
  if (fs.existsSync(subagentPath)) {
    fs.unlinkSync(subagentPath);
  }

  // Write subagent file with YAML frontmatter
  const fileContent = formatSubagentContent(
    parsed.name,
    parsed.description,
    parsed.content,
    parsed.tools,
    parsed.model
  );
  fs.writeFileSync(subagentPath, fileContent, 'utf-8');

  // Upload to workspace (fire-and-forget)
  putAgentToWorkspace(user, parsed.name, fileContent).catch((err: Error) => {
    console.error(
      `[Preset Subagents] Failed to upload after import: ${err.message}`
    );
  });

  return {
    name: parsed.name,
    description: parsed.description,
    tools: parsed.tools,
    model: parsed.model,
    content: parsed.content,
  };
}

// Validate subagent name format
export function isValidSubagentName(name: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(name);
}
