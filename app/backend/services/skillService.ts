import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { getOidcAccessToken } from '../agent/index.js';
import {
  parseSkillContent,
  formatSkillContent,
  type SkillMetadata,
} from '../utils/skills.js';
import { WorkspaceClient } from '../utils/workspaceClient.js';
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

// Copy directory recursively
function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Sync a single skill to workspace (fire-and-forget)
async function syncSkillToWorkspace(
  userId: string,
  userEmail: string,
  skillName: string
): Promise<void> {
  // Check if claudeConfigSync is enabled
  const userSettings = await getSettingsDirect(userId);
  if (!userSettings?.claudeConfigSync) {
    console.log('[Skills] Workspace sync skipped (claudeConfigSync disabled)');
    return;
  }

  const spToken = await getOidcAccessToken();
  if (!spToken) {
    console.error('[Skills] Workspace sync skipped (no SP token available)');
    return;
  }

  const localSkillPath = path.join(getSkillsPath(userEmail), skillName);
  const workspaceSkillPath = `/Workspace/Users/${userEmail}/.claude/skills/${skillName}`;

  const client = new WorkspaceClient({
    host: process.env.DATABRICKS_HOST!,
    getToken: async () => spToken,
  });

  const result = await client.sync(localSkillPath, workspaceSkillPath, {
    full: true,
  });

  if (result.success) {
    console.log(`[Skills] Synced skill ${skillName} to workspace`);
  } else {
    console.error(
      `[Skills] Failed to sync skill ${skillName}: ${result.error}`
    );
  }
}

// Delete a skill from workspace (fire-and-forget)
async function deleteSkillFromWorkspace(
  userId: string,
  userEmail: string,
  skillName: string
): Promise<void> {
  // Check if claudeConfigSync is enabled
  const userSettings = await getSettingsDirect(userId);
  if (!userSettings?.claudeConfigSync) {
    console.log(
      '[Skills] Workspace delete skipped (claudeConfigSync disabled)'
    );
    return;
  }

  const spToken = await getOidcAccessToken();
  if (!spToken) {
    console.error('[Skills] Workspace delete skipped (no SP token available)');
    return;
  }

  const workspaceSkillPath = `/Workspace/Users/${userEmail}/.claude/skills/${skillName}`;

  const client = new WorkspaceClient({
    host: process.env.DATABRICKS_HOST!,
    getToken: async () => spToken,
  });

  const result = await client.deleteObject(workspaceSkillPath);

  if (result.deleted) {
    console.log(`[Skills] Deleted skill ${skillName} from workspace`);
  } else {
    console.log(
      `[Skills] Skill ${skillName} not found in workspace (already deleted)`
    );
  }
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

  // Sync to workspace (fire-and-forget)
  syncSkillToWorkspace(userId, userEmail, name).catch((err: Error) => {
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

  // Sync to workspace (fire-and-forget)
  syncSkillToWorkspace(userId, userEmail, skillName).catch((err: Error) => {
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

  // Delete from workspace (fire-and-forget)
  deleteSkillFromWorkspace(userId, userEmail, skillName).catch((err: Error) => {
    console.error(`[Skills] Failed to delete from workspace: ${err.message}`);
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
  const presetDirPath = path.join(presetSkillsPath, presetName);
  const presetFilePath = path.join(presetDirPath, 'SKILL.md');

  // Check if preset exists
  if (!fs.existsSync(presetFilePath)) {
    throw new Error('Preset skill not found');
  }

  // Read preset file for metadata
  const presetContent = fs.readFileSync(presetFilePath, 'utf-8');
  const parsed = parseSkillContent(presetContent);

  const skillsPath = getSkillsPath(userEmail);
  const skillDirPath = path.join(skillsPath, parsed.name);

  // If skill already exists, remove it first (overwrite)
  if (fs.existsSync(skillDirPath)) {
    fs.rmSync(skillDirPath, { recursive: true, force: true });
  }

  // Copy entire preset directory (includes SKILL.md and any additional files)
  copyDirectoryRecursive(presetDirPath, skillDirPath);

  // Sync to workspace (fire-and-forget)
  syncSkillToWorkspace(userId, userEmail, parsed.name).catch((err: Error) => {
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

// Fetch repository's default branch from GitHub API
async function getDefaultBranch(repoName: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${repoName}`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repository info: ${response.status}`);
  }

  const data = (await response.json()) as { default_branch: string };
  return data.default_branch;
}

// Import a skill from GitHub repository
// name: repository name (e.g., "anthropics/skills")
// skillPath: path to skill directory (e.g., "skills/skill-creator")
// branch: branch name (optional, defaults to repository's default branch)
export async function importGitHubSkill(
  userId: string,
  userEmail: string,
  repoName: string,
  skillPath: string,
  branch?: string
): Promise<Skill> {
  const repoUrl = `https://github.com/${repoName}.git`;
  const skillName = skillPath.split('/').pop() || '';

  if (!skillName) {
    throw new Error('Invalid skill path');
  }

  // Get branch (use repository's default if not specified)
  const targetBranch = branch || (await getDefaultBranch(repoName));

  // Create temporary directory for clone
  const tmpDir = path.join('/tmp', `skill-import-${randomUUID()}`);

  try {
    // Clone with depth 1 and sparse checkout for efficiency
    execSync(
      `git clone --depth 1 --filter=blob:none --sparse -b ${targetBranch} ${repoUrl} ${tmpDir}`,
      { stdio: 'pipe' }
    );

    // Set up sparse checkout for the skill directory
    execSync(`git -C ${tmpDir} sparse-checkout set ${skillPath}`, {
      stdio: 'pipe',
    });

    const clonedSkillPath = path.join(tmpDir, skillPath);

    // Check if skill directory exists
    if (!fs.existsSync(clonedSkillPath)) {
      throw new Error('Skill not found in repository');
    }

    // Check if SKILL.md exists
    const skillMdPath = path.join(clonedSkillPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      throw new Error('SKILL.md not found in skill directory');
    }

    // Read and parse SKILL.md for metadata
    const skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
    const parsed = parseSkillContent(skillMdContent);

    const skillsPath = getSkillsPath(userEmail);
    const skillDirPath = path.join(skillsPath, parsed.name || skillName);

    // If skill already exists, remove it first (overwrite)
    if (fs.existsSync(skillDirPath)) {
      fs.rmSync(skillDirPath, { recursive: true, force: true });
    }

    // Copy skill directory
    copyDirectoryRecursive(clonedSkillPath, skillDirPath);

    const finalSkillName = parsed.name || skillName;

    // Sync to workspace (fire-and-forget)
    syncSkillToWorkspace(userId, userEmail, finalSkillName).catch(
      (err: Error) => {
        console.error(
          `[GitHub Skills] Failed to sync after import: ${err.message}`
        );
      }
    );

    return {
      name: finalSkillName,
      description: parsed.description,
      version: parsed.version,
      content: parsed.content,
    };
  } finally {
    // Clean up temporary directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
