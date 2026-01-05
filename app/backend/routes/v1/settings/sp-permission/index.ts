import type { FastifyPluginAsync } from 'fastify';
import { getServicePrincipalAccessToken } from '../../../../utils/auth.js';

const spPermissionRoutes: FastifyPluginAsync = async (fastify) => {
  // Get service principal info
  // GET /api/v1/settings/sp-permission
  fastify.get('/', async (_request, reply) => {
    try {
      // getServicePrincipalAccessToken() throws if credentials not configured
      const spToken = await getServicePrincipalAccessToken(fastify);

      // Fetch SP info from Databricks SCIM API
      const databricksHostUrl = `https://${fastify.config.DATABRICKS_HOST}`;
      const response = await fetch(
        `${databricksHostUrl}/api/2.0/preview/scim/v2/Me`,
        {
          headers: { Authorization: `Bearer ${spToken}` },
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
        databricksHost: fastify.config.DATABRICKS_HOST ?? null,
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
};

export default spPermissionRoutes;
