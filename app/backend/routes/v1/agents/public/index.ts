import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// GitHub token for authenticated requests (5000 req/hour vs 60 req/hour)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Get GitHub API headers (with optional authentication)
function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'claude-agent-databricks',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

// Repository configurations
const REPOS = {
  databricks: {
    repo: 'mats16/claude-agent-databricks',
    path: 'agents',
  },
} as const;

type RepoKey = keyof typeof REPOS;

// In-memory cache
interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();

// Cache cleanup interval reference for cleanup on server close
let cleanupInterval: NodeJS.Timeout | null = null;

// Response types
interface PublicAgentDetail {
  repo: string;
  path: string;
  name: string;
  description: string;
  model?: string;
  tools?: string[];
}

interface GitHubFileEntry {
  name: string;
  type: 'dir' | 'file';
  path: string;
}

// Fetch default branch for a repository
async function fetchDefaultBranch(repo: string): Promise<string> {
  const cacheKey = `branch:${repo}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as string;
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}`, {
    headers: getGitHubHeaders(),
  });

  if (!response.ok) {
    return 'main'; // fallback
  }

  const data = (await response.json()) as { default_branch: string };
  cache.set(cacheKey, { data: data.default_branch, timestamp: Date.now() });
  return data.default_branch;
}

// Parse YAML frontmatter from agent content
function parseAgentContent(fileContent: string): {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
} {
  const frontmatterMatch = fileContent.match(
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  );
  if (!frontmatterMatch) {
    return { name: '', description: '' };
  }

  const yaml = frontmatterMatch[1];
  const name = yaml.match(/name:\s*(.+)/)?.[1]?.trim() || '';
  const description = yaml.match(/description:\s*(.+)/)?.[1]?.trim() || '';
  const model = yaml.match(/model:\s*(.+)/)?.[1]?.trim();
  const toolsMatch = yaml.match(/tools:\s*\[([^\]]*)\]/);
  const tools = toolsMatch
    ? toolsMatch[1]
        .split(',')
        .map((t) => t.trim().replace(/['"]/g, ''))
        .filter(Boolean)
    : undefined;

  return { name, description, model, tools };
}

// Fetch agent file names from repository (lightweight, 1 API call)
async function fetchAgentNames(
  repoKey: RepoKey
): Promise<{ names: string[]; cached: boolean }> {
  const config = REPOS[repoKey];
  const cacheKey = `agent-names:${repoKey}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { names: cached.data as string[], cached: true };
  }

  const branch = await fetchDefaultBranch(config.repo);
  const url = `${GITHUB_API_BASE}/repos/${config.repo}/contents/${config.path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: getGitHubHeaders(),
  });

  if (!response.ok) {
    if (response.status === 403) {
      const remaining = response.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        throw new Error('RATE_LIMITED');
      }
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const entries = (await response.json()) as GitHubFileEntry[];
  const names = entries
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
    .map((entry) => entry.name.replace(/\.md$/, ''));

  cache.set(cacheKey, { data: names, timestamp: Date.now() });
  return { names, cached: false };
}

// Fetch single agent details
async function fetchAgentDetail(
  repoKey: RepoKey,
  agentName: string
): Promise<PublicAgentDetail | null> {
  const config = REPOS[repoKey];
  const cacheKey = `agent:${repoKey}:${agentName}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as PublicAgentDetail;
  }

  const branch = await fetchDefaultBranch(config.repo);
  const agentMdUrl = `${GITHUB_RAW_BASE}/${config.repo}/${branch}/${config.path}/${agentName}.md`;

  const response = await fetch(agentMdUrl);
  if (!response.ok) {
    return null;
  }

  const content = await response.text();
  const parsed = parseAgentContent(content);

  const agent: PublicAgentDetail = {
    repo: `https://github.com/${config.repo}.git`,
    path: `${config.path}/${agentName}.md`,
    name: parsed.name || agentName,
    description: parsed.description,
    model: parsed.model,
    tools: parsed.tools,
  };

  cache.set(cacheKey, { data: agent, timestamp: Date.now() });
  return agent;
}

const publicAgentsRoutes: FastifyPluginAsync = async (fastify) => {
  // Start cache cleanup interval
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

  // Cleanup on server close
  fastify.addHook('onClose', () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
    cache.clear();
  });

  // List Databricks agent names
  // GET /api/v1/agents/public/databricks
  fastify.get(
    '/databricks',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await fetchAgentNames('databricks');
        reply.header('X-Cache', result.cached ? 'HIT' : 'MISS');
        return { agents: result.names };
      } catch (error: any) {
        if (error.message === 'RATE_LIMITED') {
          return reply
            .status(429)
            .send({ error: 'GitHub API rate limit exceeded' });
        }
        console.error('Failed to fetch Databricks agents:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // Get single Databricks agent details
  // GET /api/v1/agents/public/databricks/:agentName
  fastify.get(
    '/databricks/:agentName',
    async (
      request: FastifyRequest<{ Params: { agentName: string } }>,
      reply: FastifyReply
    ) => {
      const { agentName } = request.params;

      try {
        const agent = await fetchAgentDetail('databricks', agentName);
        if (!agent) {
          return reply.status(404).send({ error: 'Agent not found' });
        }
        return agent;
      } catch (error: any) {
        console.error('Failed to fetch Databricks agent:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );
};

export default publicAgentsRoutes;
