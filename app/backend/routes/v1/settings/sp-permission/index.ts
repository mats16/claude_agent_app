import type { FastifyPluginAsync } from 'fastify';
import { getAccessToken, databricksHost } from '../../../../agent/index.js';

const spPermissionRoutes: FastifyPluginAsync = async (fastify) => {
  // Get service principal info
  // GET /api/v1/settings/sp-permission
  fastify.get('/', async (_request, reply) => {
    try {
      const token = await getAccessToken();

      // Fetch SP info from Databricks SCIM API
      const response = await fetch(
        `${databricksHost}/api/2.0/preview/scim/v2/Me`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return reply.status(500).send({
          error: `Failed to fetch service principal info: ${errorText}`,
        });
      }

      const data = (await response.json()) as {
        displayName?: string;
        applicationId?: string;
        id?: string;
        userName?: string;
      };

      return {
        displayName: data.displayName ?? data.userName ?? 'Service Principal',
        applicationId: data.applicationId ?? data.id ?? null,
        databricksHost: process.env.DATABRICKS_HOST ?? null,
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
};

export default spPermissionRoutes;
