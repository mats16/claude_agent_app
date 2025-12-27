import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  fetchDefaultBranch,
  fetchDirectoryContents,
  fetchRawContent,
  parseSkillFrontmatter,
  getCached,
  setCache,
  startCacheCleanup,
  stopCacheCleanup,
  GitHubRateLimitError,
  formatRateLimitError,
} from '../../../../services/gitHubClient.js';

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

// Response types
interface PublicSkillDetail {
  repo: string;
  path: string;
  name: string;
  description: string;
  version: string;
}

// Fetch skill directory names from repository (lightweight, 1 API call)
async function fetchSkillNames(
  repoKey: RepoKey
): Promise<{ names: string[]; cached: boolean }> {
  const config = REPOS[repoKey];
  const cacheKey = `skill-names:${repoKey}`;

  const cached = getCached<string[]>(cacheKey);
  if (cached) {
    return { names: cached, cached: true };
  }

  const branch = await fetchDefaultBranch(config.repo);
  const entries = await fetchDirectoryContents(config.repo, config.path, branch);

  const names = entries
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name);

  setCache(cacheKey, names);
  return { names, cached: false };
}

// Fetch single skill details
async function fetchSkillDetail(
  repoKey: RepoKey,
  skillName: string
): Promise<PublicSkillDetail | null> {
  const config = REPOS[repoKey];
  const cacheKey = `skill:${repoKey}:${skillName}`;

  const cached = getCached<PublicSkillDetail>(cacheKey);
  if (cached) {
    return cached;
  }

  const branch = await fetchDefaultBranch(config.repo);
  const content = await fetchRawContent(
    config.repo,
    branch,
    `${config.path}/${skillName}/SKILL.md`
  );

  if (!content) {
    return null;
  }

  const parsed = parseSkillFrontmatter(content);

  const skill: PublicSkillDetail = {
    repo: `https://github.com/${config.repo}.git`,
    path: `${config.path}/${skillName}`,
    name: parsed.name || skillName,
    description: parsed.description,
    version: parsed.version,
  };

  setCache(cacheKey, skill);
  return skill;
}

const publicSkillsRoutes: FastifyPluginAsync = async (fastify) => {
  // Start cache cleanup
  startCacheCleanup();

  // Cleanup on server close
  fastify.addHook('onClose', () => {
    stopCacheCleanup();
  });

  // List Anthropic skill names
  // GET /api/v1/skills/public/anthropic
  fastify.get(
    '/anthropic',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await fetchSkillNames('anthropic');
        reply.header('X-Cache', result.cached ? 'HIT' : 'MISS');
        return { skills: result.names };
      } catch (error) {
        if (error instanceof GitHubRateLimitError) {
          return reply.status(429).send(formatRateLimitError(error));
        }
        console.error('Failed to fetch Anthropic skills:', error);
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
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
      } catch (error) {
        if (error instanceof GitHubRateLimitError) {
          return reply.status(429).send(formatRateLimitError(error));
        }
        console.error('Failed to fetch Anthropic skill:', error);
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
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
      } catch (error) {
        if (error instanceof GitHubRateLimitError) {
          return reply.status(429).send(formatRateLimitError(error));
        }
        console.error('Failed to fetch Databricks skills:', error);
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
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
      } catch (error) {
        if (error instanceof GitHubRateLimitError) {
          return reply.status(429).send(formatRateLimitError(error));
        }
        console.error('Failed to fetch Databricks skill:', error);
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};

export default publicSkillsRoutes;
