import { useState, useCallback } from 'react';

export interface Subagent {
  name: string;
  description: string;
  tools?: string;
  model?: 'sonnet' | 'opus';
  content: string;
}

export interface GitHubSubagent {
  name: string;
  description: string;
  tools?: string;
  model?: 'sonnet' | 'opus';
  content: string;
}

// API Response types
interface SubagentsResponse {
  subagents: Subagent[];
}

interface ErrorResponse {
  error?: string;
}

// GitHub API constants
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

// Databricks agents repository (unofficial)
const DATABRICKS_AGENTS_REPO = 'mats16/claude-agent-databricks';
const DATABRICKS_AGENTS_PATH = 'agents';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// GitHub file entry type
interface GitHubFileEntry {
  name: string;
  type: 'dir' | 'file';
  path: string;
}

// Module-level cache for GitHub agents (keyed by repo)
interface CacheEntry {
  agents: GitHubSubagent[];
  timestamp: number;
}
const githubAgentsCache: Record<string, CacheEntry> = {};

// Parse YAML frontmatter from agent file content
function parseAgentContent(fileContent: string): {
  name: string;
  description: string;
  tools?: string;
  model?: 'sonnet' | 'opus';
  content: string;
} {
  const frontmatterMatch = fileContent.match(
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  );
  if (!frontmatterMatch) {
    return {
      name: '',
      description: '',
      content: fileContent.trim(),
    };
  }

  const yaml = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  const name = yaml.match(/name:\s*(.+)/)?.[1]?.trim() || '';
  const description = yaml.match(/description:\s*(.+)/)?.[1]?.trim() || '';
  const tools = yaml.match(/tools:\s*(.+)/)?.[1]?.trim();
  const modelMatch = yaml.match(/model:\s*(.+)/)?.[1]?.trim();
  const model =
    modelMatch === 'sonnet' || modelMatch === 'opus' ? modelMatch : undefined;

  return { name, description, tools, model, content: body.trim() };
}

// Fetch agent content from GitHub raw
async function fetchAgentContentFromGitHub(
  repo: string,
  agentsPath: string,
  fileName: string,
  branch: string = 'main'
): Promise<GitHubSubagent | null> {
  const url = `${GITHUB_RAW_BASE}/${repo}/${branch}/${agentsPath}/${fileName}`;

  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub raw fetch error: ${response.status}`);
  }

  const content = await response.text();
  const parsed = parseAgentContent(content);

  return {
    name: parsed.name || fileName.replace(/\.md$/, ''),
    description: parsed.description,
    tools: parsed.tools,
    model: parsed.model,
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

// Generic function to fetch agents from any GitHub repository
async function fetchAgentsFromRepo(
  repo: string,
  agentsPath: string
): Promise<{ agents: GitHubSubagent[]; cached: boolean }> {
  const cacheKey = `${repo}/${agentsPath}`;

  // Check cache first
  const cached = githubAgentsCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { agents: cached.agents, cached: true };
  }

  // Get default branch
  const branch = await fetchDefaultBranch(repo);

  // Fetch agent file names from GitHub API
  const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${agentsPath}?ref=${branch}`;
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

  const entries = (await response.json()) as GitHubFileEntry[];
  const agentFiles = entries.filter(
    (entry) => entry.type === 'file' && entry.name.endsWith('.md')
  );

  // Fetch all agent contents in parallel
  const agentPromises = agentFiles.map((file) =>
    fetchAgentContentFromGitHub(repo, agentsPath, file.name, branch).catch(
      (err) => {
        console.error(
          `[GitHub Agents] Failed to fetch ${file.name}: ${err.message}`
        );
        return null;
      }
    )
  );

  const agentResults = await Promise.all(agentPromises);
  const fetchedAgents = agentResults.filter(
    (agent): agent is GitHubSubagent => agent !== null
  );

  // Update cache
  githubAgentsCache[cacheKey] = {
    agents: fetchedAgents,
    timestamp: Date.now(),
  };

  return { agents: fetchedAgents, cached: false };
}

export function useSubagents() {
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Databricks agents
  const [databricksAgents, setDatabricksAgents] = useState<GitHubSubagent[]>(
    []
  );
  const [databricksLoading, setDatabricksLoading] = useState(false);
  const [databricksError, setDatabricksError] = useState<string | null>(null);
  const [databricksCached, setDatabricksCached] = useState(false);

  const fetchSubagents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/settings/agents');
      if (!response.ok) {
        throw new Error('Failed to fetch subagents');
      }
      const data: SubagentsResponse = await response.json();
      setSubagents(Array.isArray(data.subagents) ? data.subagents : []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch subagents';
      setError(message);
      console.error('Failed to fetch subagents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSubagent = useCallback(
    async (
      name: string,
      description: string,
      content: string,
      tools?: string,
      model?: 'sonnet' | 'opus'
    ): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/settings/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, content, tools, model }),
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to create subagent');
        }

        await fetchSubagents(); // Refresh list
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to create subagent';
        setError(message);
        console.error('Failed to create subagent:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubagents]
  );

  const updateSubagent = useCallback(
    async (
      name: string,
      description: string,
      content: string,
      tools?: string,
      model?: 'sonnet' | 'opus'
    ): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/settings/agents/${name}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, content, tools, model }),
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to update subagent');
        }

        await fetchSubagents(); // Refresh list
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to update subagent';
        setError(message);
        console.error('Failed to update subagent:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubagents]
  );

  const deleteSubagent = useCallback(
    async (name: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/settings/agents/${name}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to delete subagent');
        }

        await fetchSubagents(); // Refresh list
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to delete subagent';
        setError(message);
        console.error('Failed to delete subagent:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubagents]
  );

  // Fetch Databricks agents from GitHub
  const fetchDatabricksAgents = useCallback(async () => {
    setDatabricksLoading(true);
    setDatabricksError(null);

    try {
      const result = await fetchAgentsFromRepo(
        DATABRICKS_AGENTS_REPO,
        DATABRICKS_AGENTS_PATH
      );
      setDatabricksAgents(result.agents);
      setDatabricksCached(result.cached);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to fetch Databricks agents';
      setDatabricksError(message);
      console.error('Failed to fetch Databricks agents:', err);

      // If we have cached data, use it even if expired
      const cacheKey = `${DATABRICKS_AGENTS_REPO}/${DATABRICKS_AGENTS_PATH}`;
      const cached = githubAgentsCache[cacheKey];
      if (cached) {
        setDatabricksAgents(cached.agents);
        setDatabricksCached(true);
      }
    } finally {
      setDatabricksLoading(false);
    }
  }, []);

  // Import agent from Databricks repository (via backend API)
  const importDatabricksAgent = useCallback(
    async (agentName: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/v1/preset-settings/agents/${agentName}/import`,
          {
            method: 'POST',
          }
        );

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to import Databricks agent');
        }

        await fetchSubagents();
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to import Databricks agent';
        setError(message);
        console.error('Failed to import Databricks agent:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubagents]
  );

  return {
    subagents,
    loading,
    error,
    // Databricks agents
    databricksAgents,
    databricksLoading,
    databricksError,
    databricksCached,
    // Actions
    fetchSubagents,
    createSubagent,
    updateSubagent,
    deleteSubagent,
    fetchDatabricksAgents,
    importDatabricksAgent,
  };
}
