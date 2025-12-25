import { useState, useCallback } from 'react';

export interface AppTemplate {
  name: string;
  repoUrl: string;
}

// GitHub API constants
const GITHUB_API_BASE = 'https://api.github.com';
const TEMPLATES_REPO = 'databricks/app-templates';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// GitHub directory entry type
interface GitHubDirectoryEntry {
  name: string;
  type: 'dir' | 'file';
  path: string;
}

// Module-level cache for templates
interface CacheEntry {
  templates: AppTemplate[];
  timestamp: number;
}
let templatesCache: CacheEntry | null = null;

export function useAppTemplates() {
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Check cache first
      if (
        templatesCache &&
        Date.now() - templatesCache.timestamp < CACHE_TTL_MS
      ) {
        setTemplates(templatesCache.templates);
        setCached(true);
        setLoading(false);
        return;
      }

      // Fetch template directories from GitHub API
      const url = `${GITHUB_API_BASE}/repos/${TEMPLATES_REPO}/contents`;
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

      // Filter to only directories (templates)
      // Exclude common non-template directories
      const excludeDirs = [
        '.github',
        'docs',
        'scripts',
        'tests',
        '__pycache__',
      ];
      const templateDirs = entries.filter(
        (entry) =>
          entry.type === 'dir' &&
          !excludeDirs.includes(entry.name) &&
          !entry.name.startsWith('.')
      );

      const fetchedTemplates: AppTemplate[] = templateDirs.map((dir) => ({
        name: dir.name,
        repoUrl: `https://github.com/${TEMPLATES_REPO}/tree/main/${dir.name}`,
      }));

      // Update cache
      templatesCache = {
        templates: fetchedTemplates,
        timestamp: Date.now(),
      };

      setTemplates(fetchedTemplates);
      setCached(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch templates';
      setError(message);
      console.error('Failed to fetch templates:', err);

      // If we have cached data, use it even if expired
      if (templatesCache) {
        setTemplates(templatesCache.templates);
        setCached(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const createRepo = useCallback(
    async (
      url: string,
      path: string,
      sparseCheckout?: { patterns: string[] }
    ): Promise<{ id: number; path: string } | null> => {
      try {
        const response = await fetch('/api/v1/repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            path,
            sparse_checkout: sparseCheckout,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(
            data.message || data.error || 'Failed to create repository'
          );
        }

        const result = await response.json();
        return { id: result.id, path: result.path };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to create repository';
        throw new Error(message);
      }
    },
    []
  );

  return {
    templates,
    loading,
    error,
    cached,
    fetchTemplates,
    createRepo,
  };
}
