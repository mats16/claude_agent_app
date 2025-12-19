import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOidcAccessToken } from '../agent/index.js';
import {
  workspacePush,
  ensureWorkspaceDirectory,
} from '../utils/databricks.js';
import {
  parseSkillContent,
  formatSkillContent,
  type SkillMetadata,
} from '../utils/skills.js';

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

// Sync skills to workspace (fire-and-forget)
async function syncSkillsToWorkspace(
  userEmail: string,
  skillsPath: string
): Promise<void> {
  const workspaceSkillsPath = `/Workspace/Users/${userEmail}/.claude/skills`;
  const spToken = await getOidcAccessToken();
  await ensureWorkspaceDirectory(workspaceSkillsPath, spToken);
  await workspacePush(skillsPath, workspaceSkillsPath, spToken, true);
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

  // Sync to workspace (fire-and-forget)
  syncSkillsToWorkspace(userEmail, skillsPath).catch((err) => {
    console.error(`[Skills] Failed to sync after create: ${err.message}`);
  });

  return { name, description, version, content };
}

// Update an existing skill
export async function updateSkill(
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

  // Sync to workspace (fire-and-forget)
  syncSkillsToWorkspace(userEmail, skillsPath).catch((err) => {
    console.error(`[Skills] Failed to sync after update: ${err.message}`);
  });

  return { name: skillName, description, version, content };
}

// Delete a skill
export async function deleteSkill(
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

  // Sync to workspace (fire-and-forget)
  syncSkillsToWorkspace(userEmail, skillsPath).catch((err) => {
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

  // Read all .md files in the preset-skills directory
  const files = fs.readdirSync(presetSkillsPath);
  const presets = files
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const filePath = path.join(presetSkillsPath, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseSkillContent(fileContent);
      return {
        name: parsed.name,
        description: parsed.description,
        version: parsed.version,
        content: parsed.content,
      };
    })
    .filter((preset): preset is Skill => !!preset.name);

  return { presets };
}

// Import a preset skill to user's skills
export async function importPresetSkill(
  userEmail: string,
  presetName: string
): Promise<Skill> {
  const presetSkillsPath = getPresetSkillsPath();
  const presetFilePath = path.join(presetSkillsPath, `${presetName}.md`);

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

  // Sync to workspace (fire-and-forget)
  syncSkillsToWorkspace(userEmail, skillsPath).catch((err) => {
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
