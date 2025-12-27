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
import type { RequestUser } from '../models/RequestUser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Skill extends SkillMetadata {}

export interface SkillListResult {
  skills: Skill[];
}

export interface PresetListResult {
  presets: Skill[];
  errors?: Array<{ name: string; error: string }>;
}

// GitHub repository for preset skills
const PRESET_REPO = 'mats16/claude-agent-databricks';
const PRESET_SKILLS_PATH = 'skills';

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

// Copy directory recursively, excluding .git directory
function copyDirectoryRecursiveExcludeGit(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursiveExcludeGit(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Sync a single skill to workspace (fire-and-forget)
async function syncSkillToWorkspace(
  user: RequestUser,
  skillName: string
): Promise<void> {
  // Check if claudeConfigAutoPush is enabled
  const userSettings = await getSettingsDirect(user.sub);
  if (!userSettings?.claudeConfigAutoPush) {
    console.log(
      '[Skills] Workspace sync skipped (claudeConfigAutoPush disabled)'
    );
    return;
  }

  const spToken = await getOidcAccessToken();
  if (!spToken) {
    console.error('[Skills] Workspace sync skipped (no SP token available)');
    return;
  }

  const localSkillPath = path.join(user.skillsPath, skillName);
  const workspaceSkillPath = path.join(user.remoteSkillsPath, skillName);

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
  user: RequestUser,
  skillName: string
): Promise<void> {
  // Check if claudeConfigAutoPush is enabled
  const userSettings = await getSettingsDirect(user.sub);
  if (!userSettings?.claudeConfigAutoPush) {
    console.log(
      '[Skills] Workspace delete skipped (claudeConfigAutoPush disabled)'
    );
    return;
  }

  const spToken = await getOidcAccessToken();
  if (!spToken) {
    console.error('[Skills] Workspace delete skipped (no SP token available)');
    return;
  }

  const workspaceSkillPath = path.join(user.remoteSkillsPath, skillName);

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
export async function listSkills(user: RequestUser): Promise<SkillListResult> {
  const skillsPath = user.skillsPath;

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
  user: RequestUser,
  skillName: string
): Promise<Skill | null> {
  const skillPath = path.join(user.skillsPath, skillName, 'SKILL.md');

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
  user: RequestUser,
  name: string,
  description: string,
  version: string,
  content: string
): Promise<Skill> {
  const skillsPath = user.skillsPath;
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
  syncSkillToWorkspace(user, name).catch((err: Error) => {
    console.error(`[Skills] Failed to sync after create: ${err.message}`);
  });

  return { name, description, version, content };
}

// Update an existing skill
export async function updateSkill(
  user: RequestUser,
  skillName: string,
  description: string,
  version: string,
  content: string
): Promise<Skill> {
  const skillsPath = user.skillsPath;
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
  syncSkillToWorkspace(user, skillName).catch((err: Error) => {
    console.error(`[Skills] Failed to sync after update: ${err.message}`);
  });

  return { name: skillName, description, version, content };
}

// Delete a skill
export async function deleteSkill(
  user: RequestUser,
  skillName: string
): Promise<void> {
  const skillsPath = user.skillsPath;
  const skillDirPath = path.join(skillsPath, skillName);

  // Check if skill exists
  if (!fs.existsSync(skillDirPath)) {
    throw new Error('Skill not found');
  }

  // Delete skill directory recursively
  fs.rmSync(skillDirPath, { recursive: true, force: true });

  // Delete from workspace (fire-and-forget)
  deleteSkillFromWorkspace(user, skillName).catch((err: Error) => {
    console.error(`[Skills] Failed to delete from workspace: ${err.message}`);
  });
}

// List all preset skills from GitHub
export async function listPresetSkills(): Promise<PresetListResult> {
  const branch = await getDefaultBranch(PRESET_REPO);

  // Get list of directories in skills folder
  const response = await fetch(
    `https://api.github.com/repos/${PRESET_REPO}/contents/${PRESET_SKILLS_PATH}?ref=${branch}`,
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch preset skills: ${response.status}`);
  }

  const contents = (await response.json()) as Array<{
    name: string;
    type: string;
  }>;

  // Filter directories only
  const skillDirs = contents.filter((item) => item.type === 'dir');

  // Fetch SKILL.md for each skill directory in parallel
  const results = await Promise.all(
    skillDirs.map(async (dir) => {
      try {
        const skillMdResponse = await fetch(
          `https://raw.githubusercontent.com/${PRESET_REPO}/${branch}/${PRESET_SKILLS_PATH}/${dir.name}/SKILL.md`
        );
        if (!skillMdResponse.ok) {
          return { error: { name: dir.name, error: `HTTP ${skillMdResponse.status}` } };
        }
        const fileContent = await skillMdResponse.text();
        const parsed = parseSkillContent(fileContent);
        if (parsed.name) {
          return {
            preset: {
              name: parsed.name,
              description: parsed.description,
              version: parsed.version,
              content: parsed.content,
            },
          };
        }
        return { error: { name: dir.name, error: 'Invalid SKILL.md format' } };
      } catch (err: any) {
        return { error: { name: dir.name, error: err.message || 'Unknown error' } };
      }
    })
  );

  const presets: Skill[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const result of results) {
    if ('preset' in result && result.preset) {
      presets.push(result.preset);
    } else if ('error' in result && result.error) {
      errors.push(result.error);
    }
  }

  return errors.length > 0 ? { presets, errors } : { presets };
}

// Import a preset skill to user's skills (from GitHub)
export async function importPresetSkill(
  user: RequestUser,
  presetName: string
): Promise<Skill> {
  // Use importGitHubSkill with this repository's skills path
  return importGitHubSkill(
    user,
    PRESET_REPO,
    `${PRESET_SKILLS_PATH}/${presetName}`
  );
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
// repoName: repository name (e.g., "anthropics/skills")
// skillPath: path to skill directory (e.g., "skills/skill-creator"), empty for repo root
// branch: branch name (optional, defaults to repository's default branch)
export async function importGitHubSkill(
  user: RequestUser,
  repoName: string,
  skillPath: string,
  branch?: string
): Promise<Skill> {
  const repoUrl = `https://github.com/${repoName}.git`;
  // Use last part of path, or repo name if path is empty
  const skillName =
    skillPath.split('/').pop() || repoName.split('/').pop() || '';

  if (!skillName) {
    throw new Error('Invalid skill path');
  }

  // Get branch (use repository's default if not specified)
  const targetBranch = branch || (await getDefaultBranch(repoName));

  // Create temporary directory for clone
  const tmpDir = path.join('/tmp', `skill-import-${randomUUID()}`);

  try {
    if (skillPath) {
      // Clone with sparse checkout for specific path
      execSync(
        `git clone --depth 1 --filter=blob:none --sparse -b ${targetBranch} ${repoUrl} ${tmpDir}`,
        { stdio: 'pipe' }
      );
      execSync(`git -C ${tmpDir} sparse-checkout set ${skillPath}`, {
        stdio: 'pipe',
      });
    } else {
      // Clone entire repo (shallow) for root-level skill
      execSync(
        `git clone --depth 1 -b ${targetBranch} ${repoUrl} ${tmpDir}`,
        { stdio: 'pipe' }
      );
    }

    const clonedSkillPath = skillPath ? path.join(tmpDir, skillPath) : tmpDir;

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

    const skillsPath = user.skillsPath;
    const skillDirPath = path.join(skillsPath, parsed.name || skillName);

    // If skill already exists, remove it first (overwrite)
    if (fs.existsSync(skillDirPath)) {
      fs.rmSync(skillDirPath, { recursive: true, force: true });
    }

    // Copy skill directory (exclude .git for root-level import)
    if (skillPath) {
      copyDirectoryRecursive(clonedSkillPath, skillDirPath);
    } else {
      copyDirectoryRecursiveExcludeGit(clonedSkillPath, skillDirPath);
    }

    const finalSkillName = parsed.name || skillName;

    // Sync to workspace (fire-and-forget)
    syncSkillToWorkspace(user, finalSkillName).catch((err: Error) => {
      console.error(
        `[GitHub Skills] Failed to sync after import: ${err.message}`
      );
    });

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
