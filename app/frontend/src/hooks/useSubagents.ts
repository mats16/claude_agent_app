import { useState, useCallback } from 'react';

export interface Subagent {
  name: string;
  description: string;
  tools?: string;
  model?: 'sonnet' | 'opus';
  content: string;
}

export interface GitHubSubagent {
  repo: string;
  path: string;
  name: string;
  description: string;
  model?: string;
  tools?: string[];
}

// API Response types
interface SubagentsResponse {
  subagents: Subagent[];
}

interface DatabricksAgentsResponse {
  agents: string[];
}

interface ErrorResponse {
  error?: string;
}

interface RateLimitErrorResponse {
  error: string;
  resetAt: string;
  retryAfterSeconds: number;
}

// Check if response is a rate limit error and format message
async function handleRateLimitError(response: Response): Promise<string> {
  if (response.status === 429) {
    try {
      const data: RateLimitErrorResponse = await response.json();
      const retryMinutes = Math.ceil(data.retryAfterSeconds / 60);
      return `RATE_LIMITED:${retryMinutes}`;
    } catch {
      return 'RATE_LIMITED';
    }
  }
  return '';
}

export function useSubagents() {
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Databricks agents (just names from public API)
  const [databricksAgentNames, setDatabricksAgentNames] = useState<string[]>(
    []
  );
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

  // Fetch Databricks agent names from backend public API
  const fetchDatabricksAgents = useCallback(async () => {
    setDatabricksLoading(true);
    setDatabricksError(null);

    try {
      const response = await fetch('/api/v1/agents/public/databricks');

      const rateLimitError = await handleRateLimitError(response.clone());
      if (rateLimitError) {
        throw new Error(rateLimitError);
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const cached = response.headers.get('X-Cache') === 'HIT';
      setDatabricksCached(cached);

      const data: DatabricksAgentsResponse = await response.json();
      setDatabricksAgentNames(data.agents || []);

      // Fetch details for each agent in parallel
      const detailPromises = (data.agents || []).map(async (name) => {
        try {
          const detailResponse = await fetch(
            `/api/v1/agents/public/databricks/${name}`
          );
          if (detailResponse.ok) {
            return (await detailResponse.json()) as GitHubSubagent;
          }
          return null;
        } catch {
          return null;
        }
      });

      const details = await Promise.all(detailPromises);
      setDatabricksAgents(
        details.filter((d): d is GitHubSubagent => d !== null)
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to fetch Databricks agents';
      setDatabricksError(message);
      console.error('Failed to fetch Databricks agents:', err);
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
        // Find the agent details to get repo and path
        const agent = databricksAgents.find((a) => a.name === agentName);
        if (!agent) {
          throw new Error('Agent not found');
        }

        const response = await fetch('/api/v1/settings/agents/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repo: agent.repo,
            path: agent.path,
          }),
        });

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
    [fetchSubagents, databricksAgents]
  );

  return {
    subagents,
    loading,
    error,
    // Databricks agents
    databricksAgentNames,
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
