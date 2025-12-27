/**
 * Shared GitHub API client service
 * Provides common functionality for fetching from GitHub repositories
 */

import yaml from 'js-yaml';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// GitHub token for authenticated requests (5000 req/hour vs 60 req/hour)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Rate limit error with reset time
export class GitHubRateLimitError extends Error {
  readonly resetAt: Date;

  constructor(resetTimestamp: number) {
    const resetDate = new Date(resetTimestamp * 1000);
    super(`GitHub API rate limit exceeded. Resets at ${resetDate.toISOString()}`);
    this.name = 'GitHubRateLimitError';
    this.resetAt = resetDate;
  }
}

// Get GitHub API headers (with optional authentication)
export function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'claude-agent-databricks',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Validate and parse a GitHub repository name segment (owner or repo)
 * GitHub naming rules:
 * - Only alphanumeric, hyphen, underscore, and dot allowed
 * - Cannot start with a dot or hyphen
 * - Cannot contain consecutive dots or ".."
 * - Cannot end with ".git" (we strip this)
 */
function isValidGitHubNameSegment(name: string): boolean {
  // Must not be empty
  if (!name || name.length === 0) return false;

  // Cannot start with dot or hyphen
  if (name.startsWith('.') || name.startsWith('-')) return false;

  // Cannot contain path traversal patterns
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;

  // Only allow alphanumeric, hyphen, underscore, and dot
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) return false;

  return true;
}

/**
 * Parse and validate a GitHub repository URL
 * Returns owner/repo string if valid, null otherwise
 *
 * Supported formats:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 */
export function parseGitHubRepo(input: string): string | null {
  // Parse URL
  const urlMatch = input.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/
  );

  if (!urlMatch) return null;

  const owner = urlMatch[1];
  const repo = urlMatch[2];

  // Validate both segments
  if (!isValidGitHubNameSegment(owner) || !isValidGitHubNameSegment(repo)) {
    return null;
  }

  return `${owner}/${repo}`;
}

// In-memory cache
interface CacheEntry {
  data: unknown;
  timestamp: number;
}

// Shared cache instance
const cache: Map<string, CacheEntry> = new Map();

// Cache cleanup interval reference
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start cache cleanup interval (call once at app startup)
 */
export function startCacheCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp > CACHE_TTL_MS) {
          cache.delete(key);
        }
      }
    },
    60 * 1000 // Clean every minute
  );
}

/**
 * Stop cache cleanup and clear cache (call on server close)
 */
export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  cache.clear();
}

/**
 * Get cached value if not expired
 */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data as T;
  }
  return null;
}

/**
 * Set cache value
 */
export function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Check for rate limit error in response and throw GitHubRateLimitError
 */
function checkRateLimit(response: Response): void {
  if (response.status === 403) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining === '0') {
      const resetHeader = response.headers.get('X-RateLimit-Reset');
      // Fallback to 5 minutes if reset header is missing
      const resetTimestamp = resetHeader ? parseInt(resetHeader, 10) : Math.floor(Date.now() / 1000) + 300;
      throw new GitHubRateLimitError(resetTimestamp);
    }
  }
}

/**
 * Fetch default branch for a repository
 * Throws error on failure (no silent fallback to 'main')
 */
export async function fetchDefaultBranch(repo: string): Promise<string> {
  const cacheKey = `branch:${repo}`;
  const cached = getCached<string>(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}`, {
    headers: getGitHubHeaders(),
  });

  checkRateLimit(response);

  if (!response.ok) {
    throw new Error(`Failed to fetch repository info for ${repo}: ${response.status}`);
  }

  const data = (await response.json()) as { default_branch: string };
  setCache(cacheKey, data.default_branch);
  return data.default_branch;
}

/**
 * Fetch directory contents from GitHub
 */
export async function fetchDirectoryContents(
  repo: string,
  path: string,
  branch: string
): Promise<Array<{ name: string; type: 'dir' | 'file'; path: string }>> {
  const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: getGitHubHeaders(),
  });

  checkRateLimit(response);

  if (!response.ok) {
    throw new Error(`Failed to fetch directory contents: ${response.status}`);
  }

  return (await response.json()) as Array<{ name: string; type: 'dir' | 'file'; path: string }>;
}

/**
 * Fetch raw file content from GitHub
 */
export async function fetchRawContent(
  repo: string,
  branch: string,
  filePath: string
): Promise<string | null> {
  const url = `${GITHUB_RAW_BASE}/${repo}/${branch}/${filePath}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch raw content: ${response.status}`);
  }

  return response.text();
}

/**
 * Parse YAML frontmatter from markdown content using js-yaml
 * Returns parsed frontmatter object and body content
 */
export function parseFrontmatter(
  content: string
): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { frontmatter: {}, body: content.trim() };
  }

  const yamlContent = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();

  try {
    // Use JSON schema to prevent code execution vulnerabilities (CVE-2013-4660)
    const parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
    if (typeof parsed === 'object' && parsed !== null) {
      return { frontmatter: parsed as Record<string, unknown>, body };
    }
    return { frontmatter: {}, body };
  } catch (error) {
    console.error('Failed to parse YAML frontmatter:', error);
    return { frontmatter: {}, body };
  }
}

/**
 * Parse skill frontmatter
 */
export function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
  version: string;
} {
  const { frontmatter } = parseFrontmatter(content);
  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : '',
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    version: typeof frontmatter.version === 'string' ? frontmatter.version : '1.0.0',
  };
}

/**
 * Parse agent frontmatter
 */
export function parseAgentFrontmatter(content: string): {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
} {
  const { frontmatter } = parseFrontmatter(content);

  // Handle tools as either string or array
  let tools: string[] | undefined;
  if (frontmatter.tools) {
    if (Array.isArray(frontmatter.tools)) {
      tools = frontmatter.tools.map((t) => String(t));
    } else if (typeof frontmatter.tools === 'string') {
      tools = frontmatter.tools.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }

  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : '',
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    model: typeof frontmatter.model === 'string' ? frontmatter.model : undefined,
    tools,
  };
}

/**
 * Format rate limit error for API response
 */
export function formatRateLimitError(error: GitHubRateLimitError): {
  error: string;
  resetAt: string;
  retryAfterSeconds: number;
} {
  const retryAfterSeconds = Math.max(0, Math.ceil((error.resetAt.getTime() - Date.now()) / 1000));
  return {
    error: 'GitHub API rate limit exceeded',
    resetAt: error.resetAt.toISOString(),
    retryAfterSeconds,
  };
}
