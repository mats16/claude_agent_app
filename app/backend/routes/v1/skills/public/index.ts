import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Repository configurations
const REPOS = {
  anthropic: {
    repo: 'anthropics/skills',
    path: 'skills',
  },
  databricks: {
    repo: 'mats16/claude-agent-databricks',
    path: 'skills',
  },
} as const;

type RepoKey = keyof typeof REPOS;

// In-memory cache
interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();

// Clean expired cache entries periodically
setInterval(
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

// Response types
interface PublicSkillDetail {
  repo: string;
  path: string;
  name: string;
  description: string;
  version: string;
}

interface GitHubDirectoryEntry {
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
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'claude-agent-databricks',
    },
  });

  if (!response.ok) {
    return 'main'; // fallback
  }

  const data = (await response.json()) as { default_branch: string };
  cache.set(cacheKey, { data: data.default_branch, timestamp: Date.now() });
  return data.default_branch;
}

// Parse YAML frontmatter from skill content
function parseSkillContent(fileContent: string): {
  name: string;
  description: string;
  version: string;
} {
  const frontmatterMatch = fileContent.match(
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  );
  if (!frontmatterMatch) {
    return { name: '', description: '', version: '1.0.0' };
  }

  const yaml = frontmatterMatch[1];
  const name = yaml.match(/name:\s*(.+)/)?.[1]?.trim() || '';
  const description = yaml.match(/description:\s*(.+)/)?.[1]?.trim() || '';
  const version = yaml.match(/version:\s*(.+)/)?.[1]?.trim() || '1.0.0';

  return { name, description, version };
}

// Fetch skill directory names from repository (lightweight, 1 API call)
async function fetchSkillNames(
  repoKey: RepoKey
): Promise<{ names: string[]; cached: boolean }> {
  const config = REPOS[repoKey];
  const cacheKey = `names:${repoKey}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { names: cached.data as string[], cached: true };
  }

  const branch = await fetchDefaultBranch(config.repo);
  const url = `${GITHUB_API_BASE}/repos/${config.repo}/contents/${config.path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'claude-agent-databricks',
    },
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

  const entries = (await response.json()) as GitHubDirectoryEntry[];
  const names = entries
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name);

  cache.set(cacheKey, { data: names, timestamp: Date.now() });
  return { names, cached: false };
}

// Fetch single skill details
async function fetchSkillDetail(
  repoKey: RepoKey,
  skillName: string
): Promise<PublicSkillDetail | null> {
  const config = REPOS[repoKey];
  const cacheKey = `skill:${repoKey}:${skillName}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as PublicSkillDetail;
  }

  const branch = await fetchDefaultBranch(config.repo);
  const skillMdUrl = `${GITHUB_RAW_BASE}/${config.repo}/${branch}/${config.path}/${skillName}/SKILL.md`;

  const response = await fetch(skillMdUrl);
  if (!response.ok) {
    return null;
  }

  const content = await response.text();
  const parsed = parseSkillContent(content);

  const skill: PublicSkillDetail = {
    repo: `https://github.com/${config.repo}.git`,
    path: `${config.path}/${skillName}`,
    name: parsed.name || skillName,
    description: parsed.description,
    version: parsed.version,
  };

  cache.set(cacheKey, { data: skill, timestamp: Date.now() });
  return skill;
}

const publicSkillsRoutes: FastifyPluginAsync = async (fastify) => {
  // List Anthropic skill names
  // GET /api/v1/skills/public/anthropic
  fastify.get(
    '/anthropic',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await fetchSkillNames('anthropic');
        reply.header('X-Cache', result.cached ? 'HIT' : 'MISS');
        return { skills: result.names };
      } catch (error: any) {
        if (error.message === 'RATE_LIMITED') {
          return reply
            .status(429)
            .send({ error: 'GitHub API rate limit exceeded' });
        }
        console.error('Failed to fetch Anthropic skills:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // Get single Anthropic skill details
  // GET /api/v1/skills/public/anthropic/:skillName
  fastify.get(
    '/anthropic/:skillName',
    async (
      request: FastifyRequest<{ Params: { skillName: string } }>,
      reply: FastifyReply
    ) => {
      const { skillName } = request.params;

      try {
        const skill = await fetchSkillDetail('anthropic', skillName);
        if (!skill) {
          return reply.status(404).send({ error: 'Skill not found' });
        }
        return skill;
      } catch (error: any) {
        console.error('Failed to fetch Anthropic skill:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // List Databricks skill names
  // GET /api/v1/skills/public/databricks
  fastify.get(
    '/databricks',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await fetchSkillNames('databricks');
        reply.header('X-Cache', result.cached ? 'HIT' : 'MISS');
        return { skills: result.names };
      } catch (error: any) {
        if (error.message === 'RATE_LIMITED') {
          return reply
            .status(429)
            .send({ error: 'GitHub API rate limit exceeded' });
        }
        console.error('Failed to fetch Databricks skills:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // Get single Databricks skill details
  // GET /api/v1/skills/public/databricks/:skillName
  fastify.get(
    '/databricks/:skillName',
    async (
      request: FastifyRequest<{ Params: { skillName: string } }>,
      reply: FastifyReply
    ) => {
      const { skillName } = request.params;

      try {
        const skill = await fetchSkillDetail('databricks', skillName);
        if (!skill) {
          return reply.status(404).send({ error: 'Skill not found' });
        }
        return skill;
      } catch (error: any) {
        console.error('Failed to fetch Databricks skill:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );
};

export default publicSkillsRoutes;
