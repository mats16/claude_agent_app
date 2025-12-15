import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const databricksHost = process.env.DATABRICKS_HOST;

export const databricksMcpServer = createSdkMcpServer({
  name: 'databricks-tools',
  version: '0.0.1',
  tools: [
    tool(
      'list_workspace_objects',
      'List files and directories in a Databricks Workspace directory. Use this to explore the workspace structure.',
      {
        path: z
          .string()
          .describe(
            'The directory path in Databricks Workspace to list (e.g., /Workspace/Users/user@example.com/path)'
          ),
      },
      async (args) => {
        const url = `https://${databricksHost}/api/2.0/workspace/list?path=${encodeURIComponent(args.path)}`;
        // Call Databricks API
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${process.env.DATABRICKS_SP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });
          const data = await response.json();
          return { content: [{ type: 'text', text: JSON.stringify(data) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: `Error: ${error}` }] };
        }
      }
    ),
    tool(
      'get_workspace_object',
      'Get the contents of a file in a Databricks Workspace directory. Use this to read the contents of a file.',
      {
        path: z
          .string()
          .describe(
            'The directory path in Databricks Workspace to list (e.g., /Workspace/Users/user@example.com)'
          ),
      },
      async (args) => {
        const url = `https://${databricksHost}/api/2.0/workspace/export?path=${encodeURIComponent(args.path)}`;
        // Call Databricks API
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${process.env.DATABRICKS_SP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });
          const data = (await response.json());
          return { content: [{ type: 'text', text: JSON.stringify(data) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: `Error: ${error}` }] };
        }
      }
    ),
    tool(
      'update_workspace_object',
      'Update the contents of a file in a Databricks Workspace directory. Use this to update the contents of a file.',
      {
        path: z
          .string()
          .describe(
            'The directory path in Databricks Workspace to update (e.g., /Workspace/Users/user@example.com/example.py)'
          ),
        content: z
          .string()
          .describe(
            'The content of the file to be imported. This has a limit of 10 MB.'
          ),
        format: z
          .enum(['SOURCE', 'HTML', 'JUPYTER', 'DBC', 'R_MARKDOWN', 'AUTO', 'RAW'])
          .optional()
          .describe(
            'This specifies the format of the file to be imported. It is SOURCE by default.'
          ),
        language: z
          .enum(['SCALA', 'PYTHON', 'SQL', 'R'])
          .optional()
          .describe(
            'The language of the object. This value is set only if the object type is NOTEBOOK.'
          ),
          overwrite: z
          .boolean()
          .optional()
          .describe(
            'The flag that specifies whether to overwrite existing object. It is false by default.'
          ),
      },
      async (args) => {
        const url = `https://${databricksHost}/api/2.0/workspace/import?path=${encodeURIComponent(args.path)}`;
        // Call Databricks API
        try {
          const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
              path: args.path,
              content: Buffer.from(args.content).toString('base64'),
              format: args.format,
              language: args.language,
              overwrite: args.overwrite,
            }),
            headers: {
              Authorization: `Bearer ${process.env.DATABRICKS_SP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });
          const data = (await response.json());
          return { content: [{ type: 'text', text: JSON.stringify(data) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: `Error: ${error}` }] };
        }
      }
    ),
  ],
});
