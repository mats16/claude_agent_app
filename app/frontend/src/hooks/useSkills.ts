import { useState, useCallback } from 'react';

export interface Skill {
  name: string;
  description: string;
  version: string;
  content: string;
}

// Public skill detail from backend API
export interface PublicSkillDetail {
  repo: string;
  path: string;
  name: string;
  description: string;
  version: string;
}

// API Response types
interface SkillsResponse {
  skills: Skill[];
}

interface SkillNamesResponse {
  skills: string[];
}

interface ErrorResponse {
  error?: string;
  code?: string;
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

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Databricks skill names
  const [databricksSkillNames, setDatabricksSkillNames] = useState<string[]>(
    []
  );
  const [databricksLoading, setDatabricksLoading] = useState(false);
  const [databricksError, setDatabricksError] = useState<string | null>(null);

  // Anthropic skill names
  const [anthropicSkillNames, setAnthropicSkillNames] = useState<string[]>([]);
  const [anthropicLoading, setAnthropicLoading] = useState(false);
  const [anthropicError, setAnthropicError] = useState<string | null>(null);

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

        await fetchSkills();
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

        await fetchSkills();
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

        await fetchSkills();
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

  // Fetch Databricks skill names from backend
  const fetchDatabricksSkillNames = useCallback(async () => {
    setDatabricksLoading(true);
    setDatabricksError(null);

    try {
      const response = await fetch('/api/v1/skills/public/databricks');

      const rateLimitError = await handleRateLimitError(response.clone());
      if (rateLimitError) {
        throw new Error(rateLimitError);
      }

      if (!response.ok) {
        throw new Error('Failed to fetch Databricks skills');
      }
      const data: SkillNamesResponse = await response.json();
      setDatabricksSkillNames(Array.isArray(data.skills) ? data.skills : []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch Databricks skills';
      setDatabricksError(message);
      console.error('Failed to fetch Databricks skills:', err);
    } finally {
      setDatabricksLoading(false);
    }
  }, []);

  // Fetch Anthropic skill names from backend
  const fetchAnthropicSkillNames = useCallback(async () => {
    setAnthropicLoading(true);
    setAnthropicError(null);

    try {
      const response = await fetch('/api/v1/skills/public/anthropic');

      const rateLimitError = await handleRateLimitError(response.clone());
      if (rateLimitError) {
        throw new Error(rateLimitError);
      }

      if (!response.ok) {
        throw new Error('Failed to fetch Anthropic skills');
      }
      const data: SkillNamesResponse = await response.json();
      setAnthropicSkillNames(Array.isArray(data.skills) ? data.skills : []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch Anthropic skills';
      setAnthropicError(message);
      console.error('Failed to fetch Anthropic skills:', err);
    } finally {
      setAnthropicLoading(false);
    }
  }, []);

  // Fetch skill detail from backend
  const fetchSkillDetail = useCallback(
    async (
      source: 'databricks' | 'anthropic',
      skillName: string
    ): Promise<PublicSkillDetail | null> => {
      try {
        const response = await fetch(
          `/api/v1/skills/public/${source}/${skillName}`
        );
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as PublicSkillDetail;
      } catch (err: unknown) {
        console.error('Failed to fetch skill detail:', err);
        return null;
      }
    },
    []
  );

  // Import skill using detail (repo and path)
  const importSkill = useCallback(
    async (detail: PublicSkillDetail): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/settings/skills/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repo: detail.repo,
            path: detail.path,
          }),
        });

        if (!response.ok) {
          const data: ErrorResponse = await response.json();
          throw new Error(data.error || 'Failed to import skill');
        }

        await fetchSkills();
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to import skill';
        setError(message);
        console.error('Failed to import skill:', err);
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
    // Databricks skill names
    databricksSkillNames,
    databricksLoading,
    databricksError,
    // Anthropic skill names
    anthropicSkillNames,
    anthropicLoading,
    anthropicError,
    // Actions
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    fetchDatabricksSkillNames,
    fetchAnthropicSkillNames,
    fetchSkillDetail,
    importSkill,
  };
}
