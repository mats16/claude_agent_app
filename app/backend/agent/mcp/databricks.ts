import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { DBSQLClient } from '@databricks/sql';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// SQL Warehouse configuration
const MAX_ROWS_DEFAULT = 1000;
const MAX_ROWS_LIMIT = 10000;

// Marker for structured SQL result data
const SQL_RESULT_MARKER = '<!--SQL_RESULT-->';

interface SQLResultData {
  columns: string[];
  totalRows: number;
  resultPath: string;
}

type WarehouseSize = '2xs' | 'xs' | 's';

// Configuration for creating the MCP server
export interface DatabricksMcpConfig {
  databricksHost: string;
  databricksToken: string;
  warehouseIds: {
    '2xs'?: string;
    xs?: string;
    s?: string;
  };
  workingDir: string;
}

// Escape CSV value (handle quotes, commas, newlines)
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Escape if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Chunk size for streaming fetch
const FETCH_CHUNK_SIZE = 10000;

// Execute SQL query with streaming write to CSV
async function executeQuery(
  sql: string,
  warehouseId: string,
  maxRows: number,
  token: string,
  host: string,
  workingDir: string
): Promise<string> {
  const client = new DBSQLClient();

  try {
    await client.connect({
      token,
      host,
      path: `/sql/1.0/warehouses/${warehouseId}`,
    });
    const session = await client.openSession();
    const sessionId = session.id;
    const op = await session.executeStatement(sql, { runAsync: true, maxRows });

    // Prepare CSV file
    const dir = path.join(workingDir, 'query-results');
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${sessionId}.csv`);
    const resultPath = `./query-results/${sessionId}.csv`;

    let columns: string[] = [];
    let totalRows = 0;
    let isFirstChunk = true;

    // Stream fetch and write chunks
    let hasMoreRows = true;
    while (hasMoreRows) {
      const chunk = await op.fetchChunk({ maxRows: FETCH_CHUNK_SIZE });
      const rows = chunk as Record<string, unknown>[];

      if (rows.length === 0) {
        hasMoreRows = false;
        break;
      }

      // Write header on first chunk
      if (isFirstChunk) {
        columns = Object.keys(rows[0]);
        const headerLine = columns.map(escapeCsvValue).join(',') + '\n';
        await fs.promises.writeFile(filePath, headerLine, 'utf-8');
        isFirstChunk = false;
      }

      // Append data rows
      const dataLines = rows
        .map((row) => columns.map((col) => escapeCsvValue(row[col])).join(','))
        .join('\n');
      await fs.promises.appendFile(filePath, dataLines + '\n', 'utf-8');

      totalRows += rows.length;

      // Check if more rows available
      hasMoreRows = await op.hasMoreRows();
    }

    await op.close();
    await session.close();
    await client.close();

    // Handle empty result
    if (totalRows === 0) {
      return 'Query executed successfully. No rows returned.';
    }

    const sqlResultData: SQLResultData = {
      columns,
      totalRows,
      resultPath,
    };

    return SQL_RESULT_MARKER + JSON.stringify(sqlResultData);
  } catch (error: unknown) {
    try {
      await client.close();
    } catch {
      /* ignore cleanup errors */
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SQL execution failed: ${message}`);
  }
}

/**
 * Factory function to create a Databricks MCP server with injected configuration.
 * This allows per-request values (like user token) to be passed at creation time
 * instead of relying on environment variables.
 */
export function createDatabricksMcpServer(config: DatabricksMcpConfig) {
  const { databricksHost, databricksToken, warehouseIds, workingDir } = config;

  // Get WAREHOUSE_ID from size using injected config
  function getWarehouseId(size: WarehouseSize): string {
    const mapping: Record<WarehouseSize, string | undefined> = {
      '2xs': warehouseIds['2xs'],
      xs: warehouseIds.xs,
      s: warehouseIds.s,
    };
    const id = mapping[size];
    if (!id)
      throw new Error(`WAREHOUSE_ID_${size.toUpperCase()} not configured`);
    return id;
  }

  return createSdkMcpServer({
    name: 'databricks-tools',
    version: '1.0.0',
    tools: [
      tool(
        'run_sql',
        'Execute SQL on Databricks SQL Warehouse. Supports SELECT, DDL (CREATE/DROP/ALTER), and DML (INSERT/UPDATE/DELETE). Results are returned as a table. Use "size" parameter to select warehouse (recommended). Only use "warehouse_id" for advanced cases.',
        {
          query: z.string().describe('SQL statement to execute'),
          size: z
            .enum(['2xs', 'xs', 's'])
            .optional()
            .describe(
              'Warehouse size: 2xs, xs, or s. Use this parameter to select warehouse (default: 2xs). Cannot be used with warehouse_id.'
            ),
          warehouse_id: z
            .string()
            .optional()
            .describe(
              'Direct warehouse ID. Only use this for advanced cases. Cannot be used with size.'
            ),
          max_rows: z
            .number()
            .min(1)
            .max(MAX_ROWS_LIMIT)
            .default(MAX_ROWS_DEFAULT)
            .optional()
            .describe(`Max rows to return (default: ${MAX_ROWS_DEFAULT})`),
        },
        async (args) => {
          try {
            // Validate mutual exclusivity
            if (args.size && args.warehouse_id) {
              throw new Error(
                'Cannot specify both "size" and "warehouse_id". Use one or the other.'
              );
            }

            const maxRows = Math.min(
              args.max_rows ?? MAX_ROWS_DEFAULT,
              MAX_ROWS_LIMIT
            );

            // Determine warehouse ID
            const warehouseId =
              args.warehouse_id ?? getWarehouseId(args.size ?? '2xs');

            const result = await executeQuery(
              args.query,
              warehouseId,
              maxRows,
              databricksToken,
              databricksHost,
              workingDir
            );
            return { content: [{ type: 'text', text: result }] };
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            return { content: [{ type: 'text', text: `Error: ${message}` }] };
          }
        }
      ),
      tool(
        'get_warehouse_info',
        'Get information about a Databricks SQL Warehouse including its state, size, and configuration.',
        {
          size: z
            .enum(['2xs', 'xs', 's'])
            .default('2xs')
            .optional()
            .describe('Warehouse size: 2xs (default), xs, or s'),
        },
        async (args) => {
          try {
            const size = args.size ?? '2xs';
            const warehouseId = getWarehouseId(size);
            const url = `https://${databricksHost}/api/2.0/sql/warehouses/${warehouseId}`;

            const response = await fetch(url, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${databricksToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(
                `API request failed: ${response.status} ${errorText}`
              );
            }

            const data = await response.json();
            return {
              content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            };
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            return { content: [{ type: 'text', text: `Error: ${message}` }] };
          }
        }
      ),
      tool(
        'list_warehouses',
        'List all Databricks SQL Warehouses available in the workspace.',
        {},
        async () => {
          try {
            const url = `https://${databricksHost}/api/2.0/sql/warehouses`;

            const response = await fetch(url, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${databricksToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(
                `API request failed: ${response.status} ${errorText}`
              );
            }

            const data = await response.json();
            return {
              content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            };
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            return { content: [{ type: 'text', text: `Error: ${message}` }] };
          }
        }
      ),
    ],
  });
}
