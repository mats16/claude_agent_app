import { useState, useCallback } from 'react';

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

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [presetSkills, setPresetSkills] = useState<PresetSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/claude/skills');
      if (!response.ok) {
        throw new Error('Failed to fetch skills');
      }
      const data = await response.json();
      setSkills(data.skills || []);
    } catch (err: any) {
      setError(err.message);
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
        const response = await fetch('/api/v1/claude/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, version, content }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: any) {
        setError(err.message);
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
        const response = await fetch(`/api/v1/claude/skills/${name}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, version, content }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: any) {
        setError(err.message);
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
        const response = await fetch(`/api/v1/claude/skills/${name}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to delete skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: any) {
        setError(err.message);
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
      const response = await fetch('/api/v1/claude/preset-skills');
      if (!response.ok) {
        throw new Error('Failed to fetch preset skills');
      }
      const data = await response.json();
      setPresetSkills(data.presets || []);
    } catch (err: any) {
      setError(err.message);
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
          `/api/v1/claude/preset-skills/${presetName}/import`,
          {
            method: 'POST',
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to import preset skill');
        }

        await fetchSkills(); // Refresh list
        return true;
      } catch (err: any) {
        setError(err.message);
        console.error('Failed to import preset skill:', err);
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
    loading,
    error,
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    fetchPresetSkills,
    importPresetSkill,
  };
}
