import { useState, useCallback } from 'react';

export interface Subagent {
  name: string;
  description: string;
  tools?: string;
  model?: 'sonnet' | 'opus';
  content: string;
}

export interface PresetSubagent {
  name: string;
  description: string;
  tools?: string;
  model?: 'sonnet' | 'opus';
  content: string;
}

export function useSubagents() {
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [presetSubagents, setPresetSubagents] = useState<PresetSubagent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubagents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/settings/agents');
      if (!response.ok) {
        throw new Error('Failed to fetch subagents');
      }
      const data = await response.json();
      setSubagents(data.subagents || []);
    } catch (err: any) {
      setError(err.message);
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
          const data = await response.json();
          throw new Error(data.error || 'Failed to create subagent');
        }

        await fetchSubagents(); // Refresh list
        return true;
      } catch (err: any) {
        setError(err.message);
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
          const data = await response.json();
          throw new Error(data.error || 'Failed to update subagent');
        }

        await fetchSubagents(); // Refresh list
        return true;
      } catch (err: any) {
        setError(err.message);
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
          const data = await response.json();
          throw new Error(data.error || 'Failed to delete subagent');
        }

        await fetchSubagents(); // Refresh list
        return true;
      } catch (err: any) {
        setError(err.message);
        console.error('Failed to delete subagent:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubagents]
  );

  const fetchPresetSubagents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/preset-settings/agents');
      if (!response.ok) {
        throw new Error('Failed to fetch preset subagents');
      }
      const data = await response.json();
      setPresetSubagents(data.presets || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch preset subagents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const importPresetSubagent = useCallback(
    async (presetName: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/v1/preset-settings/agents/${presetName}/import`,
          {
            method: 'POST',
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to import preset subagent');
        }

        await fetchSubagents(); // Refresh list
        return true;
      } catch (err: any) {
        setError(err.message);
        console.error('Failed to import preset subagent:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubagents]
  );

  return {
    subagents,
    presetSubagents,
    loading,
    error,
    fetchSubagents,
    createSubagent,
    updateSubagent,
    deleteSubagent,
    fetchPresetSubagents,
    importPresetSubagent,
  };
}
