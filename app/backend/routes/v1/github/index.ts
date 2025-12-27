import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

const GITHUB_API_BASE = 'https://api.github.com';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory cache
interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();

// Clean expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

const githubRoutes: FastifyPluginAsync = async (fastify) => {
  // Proxy GitHub API requests with caching
  // GET /api/v1/github/*
  fastify.get('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = (request.params as { '*': string })['*'];
    const queryString = request.url.split('?')[1] || '';
    const cacheKey = `${path}?${queryString}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      reply.header('X-Cache', 'HIT');
      return cached.data;
    }

    // Fetch from GitHub API
    const url = `${GITHUB_API_BASE}/${path}${queryString ? `?${queryString}` : ''}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'claude-agent-databricks',
        },
      });

      if (!response.ok) {
        // Check rate limit
        const remaining = response.headers.get('X-RateLimit-Remaining');
        if (response.status === 403 && remaining === '0') {
          return reply.status(429).send({ error: 'GitHub API rate limit exceeded' });
        }
        return reply.status(response.status).send({ error: `GitHub API error: ${response.status}` });
      }

      const data = await response.json();

      // Store in cache
      cache.set(cacheKey, { data, timestamp: Date.now() });

      reply.header('X-Cache', 'MISS');
      return data;
    } catch (error: any) {
      console.error('GitHub API proxy error:', error);
      return reply.status(500).send({ error: error.message });
    }
  });
};

export default githubRoutes;
