import { useState, useCallback } from 'react';

export interface Skill {
  name: string;
  description: string;
  version: string;
  content: string;
}


export interface GitHubSkill {
  name: string;
  description: string;
  version: string;
  content: string;
}

// API Response types
interface SkillsResponse {
  skills: Skill[];
}

interface ErrorResponse {
  error?: string;
  code?: string;
}

// GitHub API constants
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

// Anthropic skills repository
const ANTHROPIC_SKILLS_REPO = 'anthropics/skills';
const ANTHROPIC_SKILLS_PATH = 'skills';

// Databricks skills repository (unofficial)
const DATABRICKS_SKILLS_REPO = 'mats16/claude-agent-databricks';
const DATABRICKS_SKILLS_PATH = 'skills';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// GitHub directory entry type
interface GitHubDirectoryEntry {
  name: string;
  type: 'dir' | 'file';
  path: string;
}

// Module-level cache for GitHub skills (keyed by repo)
interface CacheEntry {
  skills: GitHubSkill[];
  timestamp: number;
}
const githubSkillsCache: Record<string, CacheEntry> = {};

// Parse YAML frontmatter from skill file content
function parseSkillContent(fileContent: string): {
  name: string;
  description: string;
  version: string;
  content: string;
} {
  const frontmatterMatch = fileContent.match(
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  );
  if (!frontmatterMatch) {
    return {
      name: '',
      description: '',
      version: '1.0.0',
      content: fileContent.trim(),
    };
  }

  const yaml = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  const name = yaml.match(/name:\s*(.+)/)?.[1]?.trim() || '';
  const description = yaml.match(/description:\s*(.+)/)?.[1]?.trim() || '';
  const version = yaml.match(/version:\s*(.+)/)?.[1]?.trim() || '1.0.0';

  return { name, description, version, content: body.trim() };
}

// Fetch skill content from GitHub raw
async function fetchSkillContentFromGitHub(
  repo: string,
  skillsPath: string,
  skillName: string,
  branch: string = 'main'
): Promise<GitHubSkill | null> {
  const url = `${GITHUB_RAW_BASE}/${repo}/${branch}/${skillsPath}/${skillName}/SKILL.md`;

  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub raw fetch error: ${response.status}`);
  }

  const content = await response.text();
  const parsed = parseSkillContent(content);

  return {
    name: parsed.name || skillName,
    description: parsed.description,
    version: parsed.version,
    content: parsed.content,
  };
}

// Fetch default branch for a repository
async function fetchDefaultBranch(repo: string): Promise<string> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });

  if (!response.ok) {
    return 'main'; // fallback
  }

  const data = (await response.json()) as { default_branch: string };
  return data.default_branch;
}

// Generic function to fetch skills from any GitHub repository
async function fetchSkillsFromRepo(
  repo: string,
  skillsPath: string
): Promise<{ skills: GitHubSkill[]; cached: boolean }> {
  const cacheKey = `${repo}/${skillsPath}`;

  // Check cache first
  const cached = githubSkillsCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { skills: cached.skills, cached: true };
  }

  // Get default branch
  const branch = await fetchDefaultBranch(repo);

  // Fetch skill directory names from GitHub API
  const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${skillsPath}?ref=${branch}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });

  if (response.status === 403) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining === '0') {
      throw new Error('RATE_LIMITED');
    }
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const entries = (await response.json()) as GitHubDirectoryEntry[];
  const skillDirs = entries.filter((entry) => entry.type === 'dir');

  // Fetch all skill contents in parallel
  const skillPromises = skillDirs.map((dir) =>
    fetchSkillContentFromGitHub(repo, skillsPath, dir.name, branch).catch(
      (err) => {
        console.error(
          `[GitHub Skills] Failed to fetch ${dir.name}: ${err.message}`
        );
        return null;
      }
    )
  );

  const skillResults = await Promise.all(skillPromises);
  const fetchedSkills = skillResults.filter(
    (skill): skill is GitHubSkill => skill !== null
  );

  // Update cache
  githubSkillsCache[cacheKey] = {
    skills: fetchedSkills,
    timestamp: Date.now(),
  };

  return { skills: fetchedSkills, cached: false };
}

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Databricks skills (unofficial)
  const [databricksSkills, setDatabricksSkills] = useState<GitHubSkill[]>([]);
  const [databricksLoading, setDatabricksLoading] = useState(false);
  const [databricksError, setDatabricksError] = useState<string | null>(null);
  const [databricksCached, setDatabricksCached] = useState(false);

  // Anthropic skills
  const [anthropicSkills, setAnthropicSkills] = useState<GitHubSkill[]>([]);
  const [anthropicLoading, setAnthropicLoading] = useState(false);
  const [anthropicError, setAnthropicError] = useState<string | null>(null);
  const [anthropicCached, setAnthropicCached] = useState(false);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/settings/skills');
      if (!response.ok) {
        throw new Error('Failed to fetch skills');
      }
      const data: SkillsResponse = await response.json();
      setSkills(Array.isArray(data.skills) ? data.skills : []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch skills';
      setError(message);
      console.error('Failed to fetch skills:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSkill = useCallback(
    async (
      name: string,
      description: string,
      version: string,
      content: string
    ): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/settings/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, version, content }),
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to create skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to create skill';
        setError(message);
        console.error('Failed to create skill:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSkills]
  );

  const updateSkill = useCallback(
    async (
      name: string,
      description: string,
      version: string,
      content: string
    ): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/settings/skills/${name}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, version, content }),
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to update skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to update skill';
        setError(message);
        console.error('Failed to update skill:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSkills]
  );

  const deleteSkill = useCallback(
    async (name: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/settings/skills/${name}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to delete skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to delete skill';
        setError(message);
        console.error('Failed to delete skill:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSkills]
  );

  // Fetch Databricks skills from GitHub
  const fetchDatabricksSkills = useCallback(async () => {
    setDatabricksLoading(true);
    setDatabricksError(null);

    try {
      const result = await fetchSkillsFromRepo(
        DATABRICKS_SKILLS_REPO,
        DATABRICKS_SKILLS_PATH
      );
      setDatabricksSkills(result.skills);
      setDatabricksCached(result.cached);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch Databricks skills';
      setDatabricksError(message);
      console.error('Failed to fetch Databricks skills:', err);

      // If we have cached data, use it even if expired
      const cacheKey = `${DATABRICKS_SKILLS_REPO}/${DATABRICKS_SKILLS_PATH}`;
      const cached = githubSkillsCache[cacheKey];
      if (cached) {
        setDatabricksSkills(cached.skills);
        setDatabricksCached(true);
      }
    } finally {
      setDatabricksLoading(false);
    }
  }, []);

  // Fetch Anthropic skills from GitHub
  const fetchAnthropicSkills = useCallback(async () => {
    setAnthropicLoading(true);
    setAnthropicError(null);

    try {
      const result = await fetchSkillsFromRepo(
        ANTHROPIC_SKILLS_REPO,
        ANTHROPIC_SKILLS_PATH
      );
      setAnthropicSkills(result.skills);
      setAnthropicCached(result.cached);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch Anthropic skills';
      setAnthropicError(message);
      console.error('Failed to fetch Anthropic skills:', err);

      // If we have cached data, use it even if expired
      const cacheKey = `${ANTHROPIC_SKILLS_REPO}/${ANTHROPIC_SKILLS_PATH}`;
      const cached = githubSkillsCache[cacheKey];
      if (cached) {
        setAnthropicSkills(cached.skills);
        setAnthropicCached(true);
      }
    } finally {
      setAnthropicLoading(false);
    }
  }, []);

  // Import skill from Databricks repository
  const importDatabricksSkill = useCallback(
    async (skillName: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/settings/skills/import-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: DATABRICKS_SKILLS_REPO,
            path: `${DATABRICKS_SKILLS_PATH}/${skillName}`,
          }),
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to import Databricks skill');
        }

        await fetchSkills();
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to import Databricks skill';
        setError(message);
        console.error('Failed to import Databricks skill:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSkills]
  );

  // Import skill from Anthropic repository
  const importAnthropicSkill = useCallback(
    async (skillName: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/settings/skills/import-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: ANTHROPIC_SKILLS_REPO,
            path: `${ANTHROPIC_SKILLS_PATH}/${skillName}`,
          }),
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to import Anthropic skill');
        }

        await fetchSkills();
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to import Anthropic skill';
        setError(message);
        console.error('Failed to import Anthropic skill:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSkills]
  );

  return {
    skills,
    loading,
    error,
    // Databricks skills
    databricksSkills,
    databricksLoading,
    databricksError,
    databricksCached,
    // Anthropic skills
    anthropicSkills,
    anthropicLoading,
    anthropicError,
    anthropicCached,
    // Actions
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    fetchDatabricksSkills,
    importDatabricksSkill,
    fetchAnthropicSkills,
    importAnthropicSkill,
  };
}
