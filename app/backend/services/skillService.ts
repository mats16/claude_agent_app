import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOidcAccessToken } from '../agent/index.js';
import { ensureWorkspaceDirectory } from '../utils/databricks.js';
import {
  parseSkillContent,
  formatSkillContent,
  type SkillMetadata,
} from '../utils/skills.js';
import { enqueuePush } from './workspaceQueueService.js';
import { getSettingsDirect } from '../db/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Skill extends SkillMetadata {}

export interface SkillListResult {
  skills: Skill[];
}

export interface PresetListResult {
  presets: Skill[];
}

// Get base path for user's local storage
function getLocalBasePath(): string {
  return path.join(process.env.HOME ?? '/tmp', 'u');
}

// Get skills directory path for a user
function getSkillsPath(userEmail: string): string {
  return path.join(getLocalBasePath(), userEmail, '.claude/skills');
}

// Get preset skills directory path
function getPresetSkillsPath(): string {
  return path.join(__dirname, '../preset-settings/skills');
}

// Sync skills to workspace via queue (fire-and-forget)
async function syncSkillsToWorkspace(
  userId: string,
  userEmail: string,
  skillsPath: string
): Promise<void> {
  // Check if claudeConfigSync is enabled
  const userSettings = await getSettingsDirect(userId);
  if (!userSettings?.claudeConfigSync) {
    console.log('[Skills] Workspace sync skipped (claudeConfigSync disabled)');
    return;
  }

  const workspaceSkillsPath = `/Workspace/Users/${userEmail}/.claude/skills`;

  // Ensure workspace directory exists
  const spToken = await getOidcAccessToken();
  if (!spToken) {
    console.error('[Skills] Workspace sync skipped (no SP token available)');
    return;
  }
  await ensureWorkspaceDirectory(workspaceSkillsPath, spToken);

  // Enqueue push task (fire-and-forget via queue)
  enqueuePush({
    userId,
    token: spToken,
    localPath: skillsPath,
    workspacePath: workspaceSkillsPath,
    replace: true,
  });
}

// List all skills for a user
export async function listSkills(userEmail: string): Promise<SkillListResult> {
  const skillsPath = getSkillsPath(userEmail);

  // Ensure skills directory exists
  if (!fs.existsSync(skillsPath)) {
    fs.mkdirSync(skillsPath, { recursive: true });
    return { skills: [] };
  }

  // Read all subdirectories containing SKILL.md
  const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
  const skills = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillFilePath = path.join(skillsPath, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFilePath)) {
        const fileContent = fs.readFileSync(skillFilePath, 'utf-8');
        const parsed = parseSkillContent(fileContent);
        return {
          name: entry.name,
          description: parsed.description,
          version: parsed.version,
          content: parsed.content,
        };
      }
      return null;
    })
    .filter((skill): skill is Skill => skill !== null);

  return { skills };
}

// Get a single skill by name
export async function getSkill(
  userEmail: string,
  skillName: string
): Promise<Skill | null> {
  const skillPath = path.join(getSkillsPath(userEmail), skillName, 'SKILL.md');

  if (!fs.existsSync(skillPath)) {
    return null;
  }

  const fileContent = fs.readFileSync(skillPath, 'utf-8');
  const parsed = parseSkillContent(fileContent);
  return {
    name: skillName,
    description: parsed.description,
    version: parsed.version,
    content: parsed.content,
  };
}

// Create a new skill
export async function createSkill(
  userId: string,
  userEmail: string,
  name: string,
  description: string,
  version: string,
  content: string
): Promise<Skill> {
  const skillsPath = getSkillsPath(userEmail);
  const skillDirPath = path.join(skillsPath, name);
  const skillPath = path.join(skillDirPath, 'SKILL.md');

  // Check if skill already exists
  if (fs.existsSync(skillDirPath)) {
    throw new Error('Skill already exists');
  }

  // Create skill directory
  fs.mkdirSync(skillDirPath, { recursive: true });

  // Write skill file with YAML frontmatter
  const fileContent = formatSkillContent(name, description, version, content);
  fs.writeFileSync(skillPath, fileContent, 'utf-8');

  // Sync to workspace via queue (fire-and-forget)
  syncSkillsToWorkspace(userId, userEmail, skillsPath).catch((err) => {
    console.error(`[Skills] Failed to sync after create: ${err.message}`);
  });

  return { name, description, version, content };
}

// Update an existing skill
export async function updateSkill(
  userId: string,
  userEmail: string,
  skillName: string,
  description: string,
  version: string,
  content: string
): Promise<Skill> {
  const skillsPath = getSkillsPath(userEmail);
  const skillDirPath = path.join(skillsPath, skillName);
  const skillPath = path.join(skillDirPath, 'SKILL.md');

  // Check if skill exists
  if (!fs.existsSync(skillPath)) {
    throw new Error('Skill not found');
  }

  // Update skill file with YAML frontmatter
  const fileContent = formatSkillContent(
    skillName,
    description,
    version,
    content
  );
  fs.writeFileSync(skillPath, fileContent, 'utf-8');

  // Sync to workspace via queue (fire-and-forget)
  syncSkillsToWorkspace(userId, userEmail, skillsPath).catch((err) => {
    console.error(`[Skills] Failed to sync after update: ${err.message}`);
  });

  return { name: skillName, description, version, content };
}

// Delete a skill
export async function deleteSkill(
  userId: string,
  userEmail: string,
  skillName: string
): Promise<void> {
  const skillsPath = getSkillsPath(userEmail);
  const skillDirPath = path.join(skillsPath, skillName);

  // Check if skill exists
  if (!fs.existsSync(skillDirPath)) {
    throw new Error('Skill not found');
  }

  // Delete skill directory recursively
  fs.rmSync(skillDirPath, { recursive: true, force: true });

  // Sync to workspace via queue (fire-and-forget)
  syncSkillsToWorkspace(userId, userEmail, skillsPath).catch((err) => {
    console.error(`[Skills] Failed to sync after delete: ${err.message}`);
  });
}

// List all preset skills
export async function listPresetSkills(): Promise<PresetListResult> {
  const presetSkillsPath = getPresetSkillsPath();

  // Ensure preset-skills directory exists
  if (!fs.existsSync(presetSkillsPath)) {
    return { presets: [] };
  }

  // Read all subdirectories containing SKILL.md
  const entries = fs.readdirSync(presetSkillsPath, { withFileTypes: true });
  const presets = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillFilePath = path.join(presetSkillsPath, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFilePath)) {
        const fileContent = fs.readFileSync(skillFilePath, 'utf-8');
        const parsed = parseSkillContent(fileContent);
        return {
          name: parsed.name,
          description: parsed.description,
          version: parsed.version,
          content: parsed.content,
        };
      }
      return null;
    })
    .filter((preset): preset is Skill => preset !== null && !!preset.name);

  return { presets };
}

// Import a preset skill to user's skills
export async function importPresetSkill(
  userId: string,
  userEmail: string,
  presetName: string
): Promise<Skill> {
  const presetSkillsPath = getPresetSkillsPath();
  const presetFilePath = path.join(presetSkillsPath, presetName, 'SKILL.md');

  // Check if preset exists
  if (!fs.existsSync(presetFilePath)) {
    throw new Error('Preset skill not found');
  }

  // Read preset file
  const presetContent = fs.readFileSync(presetFilePath, 'utf-8');
  const parsed = parseSkillContent(presetContent);

  const skillsPath = getSkillsPath(userEmail);
  const skillDirPath = path.join(skillsPath, parsed.name);
  const skillPath = path.join(skillDirPath, 'SKILL.md');

  // If skill already exists, remove it first (overwrite)
  if (fs.existsSync(skillDirPath)) {
    fs.rmSync(skillDirPath, { recursive: true, force: true });
  }

  // Create skill directory
  fs.mkdirSync(skillDirPath, { recursive: true });

  // Write skill file with YAML frontmatter
  const fileContent = formatSkillContent(
    parsed.name,
    parsed.description,
    parsed.version,
    parsed.content
  );
  fs.writeFileSync(skillPath, fileContent, 'utf-8');

  // Sync to workspace via queue (fire-and-forget)
  syncSkillsToWorkspace(userId, userEmail, skillsPath).catch((err) => {
    console.error(
      `[Preset Skills] Failed to sync after import: ${err.message}`
    );
  });

  return {
    name: parsed.name,
    description: parsed.description,
    version: parsed.version,
    content: parsed.content,
  };
}

// Validate skill name format
export function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(name);
}
