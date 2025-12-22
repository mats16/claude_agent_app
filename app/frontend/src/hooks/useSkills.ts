import { useState, useCallback, useRef } from 'react';

export interface Skill {
  name: string;
  description: string;
  version: string;
  content: string;
}

export interface PresetSkill {
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

interface PresetSkillsResponse {
  presets: PresetSkill[];
}

interface ErrorResponse {
  error?: string;
  code?: string;
}

// GitHub API constants
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const SKILLS_REPO = 'anthropics/skills';
const SKILLS_PATH = 'skills';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// GitHub directory entry type
interface GitHubDirectoryEntry {
  name: string;
  type: 'dir' | 'file';
  path: string;
}

// Module-level cache for GitHub skills
interface CacheEntry {
  skills: GitHubSkill[];
  timestamp: number;
}
let githubSkillsCache: CacheEntry | null = null;

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
  skillName: string
): Promise<GitHubSkill | null> {
  const url = `${GITHUB_RAW_BASE}/${SKILLS_REPO}/main/${SKILLS_PATH}/${skillName}/SKILL.md`;

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

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [presetSkills, setPresetSkills] = useState<PresetSkill[]>([]);
  const [githubSkills, setGitHubSkills] = useState<GitHubSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [githubLoading, setGitHubLoading] = useState(false);
  const [githubError, setGitHubError] = useState<string | null>(null);
  const [githubCached, setGitHubCached] = useState(false);

  // Ref to store fetched skills for import
  const githubSkillsRef = useRef<GitHubSkill[]>([]);

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

  const fetchPresetSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/preset-settings/skills');
      if (!response.ok) {
        throw new Error('Failed to fetch preset skills');
      }
      const data: PresetSkillsResponse = await response.json();
      setPresetSkills(Array.isArray(data.presets) ? data.presets : []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch preset skills';
      setError(message);
      console.error('Failed to fetch preset skills:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const importPresetSkill = useCallback(
    async (presetName: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/v1/preset-settings/skills/${presetName}/import`,
          {
            method: 'POST',
          }
        );

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to import preset skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to import preset skill';
        setError(message);
        console.error('Failed to import preset skill:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSkills]
  );

  const fetchGitHubSkills = useCallback(async () => {
    setGitHubLoading(true);
    setGitHubError(null);

    try {
      // Check cache first
      if (
        githubSkillsCache &&
        Date.now() - githubSkillsCache.timestamp < CACHE_TTL_MS
      ) {
        setGitHubSkills(githubSkillsCache.skills);
        githubSkillsRef.current = githubSkillsCache.skills;
        setGitHubCached(true);
        setGitHubLoading(false);
        return;
      }

      // Fetch skill directory names from GitHub API
      const url = `${GITHUB_API_BASE}/repos/${SKILLS_REPO}/contents/${SKILLS_PATH}`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
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
        fetchSkillContentFromGitHub(dir.name).catch((err) => {
          console.error(
            `[GitHub Skills] Failed to fetch ${dir.name}: ${err.message}`
          );
          return null;
        })
      );

      const skillResults = await Promise.all(skillPromises);
      const fetchedSkills = skillResults.filter(
        (skill): skill is GitHubSkill => skill !== null
      );

      // Update cache
      githubSkillsCache = {
        skills: fetchedSkills,
        timestamp: Date.now(),
      };

      setGitHubSkills(fetchedSkills);
      githubSkillsRef.current = fetchedSkills;
      setGitHubCached(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch GitHub skills';
      setGitHubError(message);
      console.error('Failed to fetch GitHub skills:', err);

      // If we have cached data, use it even if expired
      if (githubSkillsCache) {
        setGitHubSkills(githubSkillsCache.skills);
        githubSkillsRef.current = githubSkillsCache.skills;
        setGitHubCached(true);
      }
    } finally {
      setGitHubLoading(false);
    }
  }, []);

  const importGitHubSkill = useCallback(
    async (skillName: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        // Use backend endpoint to import GitHub skill (supports multi-file skills)
        const response = await fetch('/api/v1/settings/skills/import-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: SKILLS_REPO,
            path: `${SKILLS_PATH}/${skillName}`,
          }),
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to import GitHub skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to import GitHub skill';
        setError(message);
        console.error('Failed to import GitHub skill:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSkills]
  );

  return {
    skills,
    presetSkills,
    githubSkills,
    loading,
    error,
    githubLoading,
    githubError,
    githubCached,
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    fetchPresetSkills,
    importPresetSkill,
    fetchGitHubSkills,
    importGitHubSkill,
  };
}
