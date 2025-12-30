import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  fetchDefaultBranch,
  fetchDirectoryContents,
  fetchRawContent,
  parseAgentFrontmatter,
  getCached,
  setCache,
  GitHubRateLimitError,
  formatRateLimitError,
} from '../../../../services/gitHubClient.js';

// Repository configurations
const REPOS = {
  databricks: {
    repo: 'mats16/claude-agent-databricks',
    path: 'agents',
  },
} as const;

type RepoKey = keyof typeof REPOS;

// Response types
interface PublicAgentDetail {
  repo: string;
  path: string;
  name: string;
  description: string;
  model?: string;
  tools?: string[];
}

// Fetch agent file names from repository (lightweight, 1 API call)
async function fetchAgentNames(
  repoKey: RepoKey
): Promise<{ names: string[]; cached: boolean }> {
  const config = REPOS[repoKey];
  const cacheKey = `agent-names:${repoKey}`;

  const cached = getCached<string[]>(cacheKey);
  if (cached) {
    return { names: cached, cached: true };
  }

  const branch = await fetchDefaultBranch(config.repo);
  const entries = await fetchDirectoryContents(
    config.repo,
    config.path,
    branch
  );

  const names = entries
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
    .map((entry) => entry.name.replace(/\.md$/, ''));

  setCache(cacheKey, names);
  return { names, cached: false };
}

// Fetch single agent details
async function fetchAgentDetail(
  repoKey: RepoKey,
  agentName: string
): Promise<PublicAgentDetail | null> {
  const config = REPOS[repoKey];
  const cacheKey = `agent:${repoKey}:${agentName}`;

  const cached = getCached<PublicAgentDetail>(cacheKey);
  if (cached) {
    return cached;
  }

  const branch = await fetchDefaultBranch(config.repo);
  const content = await fetchRawContent(
    config.repo,
    branch,
    `${config.path}/${agentName}.md`
  );

  if (!content) {
    return null;
  }

  const parsed = parseAgentFrontmatter(content);

  const agent: PublicAgentDetail = {
    repo: `https://github.com/${config.repo}.git`,
    path: `${config.path}/${agentName}.md`,
    name: parsed.name || agentName,
    description: parsed.description,
    model: parsed.model,
    tools: parsed.tools,
  };

  setCache(cacheKey, agent);
  return agent;
}

const publicAgentsRoutes: FastifyPluginAsync = async (fastify) => {
  // List Databricks agent names
  // GET /api/v1/agents/public/databricks
  fastify.get(
    '/databricks',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await fetchAgentNames('databricks');
        reply.header('X-Cache', result.cached ? 'HIT' : 'MISS');
        return { agents: result.names };
      } catch (error) {
        if (error instanceof GitHubRateLimitError) {
          return reply.status(429).send(formatRateLimitError(error));
        }
        console.error('Failed to fetch Databricks agents:', error);
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
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
      } catch (error) {
        if (error instanceof GitHubRateLimitError) {
          return reply.status(429).send(formatRateLimitError(error));
        }
        console.error('Failed to fetch Databricks agent:', error);
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};

export default publicAgentsRoutes;
