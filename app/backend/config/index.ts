/**
 * Centralized configuration for backend environment variables
 * All process.env access should be done through this module
 */
import path from 'path';

/**
 * Helper function to require an environment variable
 * Throws an error if the variable is not set
 */
function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} environment variable is required`);
	}
	return value;
}

const databricksHost =
	process.env.DATABRICKS_HOST?.replace(/^https?:\/\//, '') ?? '';

// Databricks configuration
export const databricks = {
  host: databricksHost,
  hostUrl: `https://${databricksHost}`,
  clientId: process.env.DATABRICKS_CLIENT_ID,
  clientSecret: process.env.DATABRICKS_CLIENT_SECRET,
  appName: process.env.DATABRICKS_APP_NAME,
};

// SQL Warehouse IDs by size
export const warehouseIds = {
  '2xs': process.env.WAREHOUSE_ID_2XS,
  xs: process.env.WAREHOUSE_ID_XS,
  s: process.env.WAREHOUSE_ID_S,
};

// Server configuration
export const server = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 8000,
  isProduction: process.env.NODE_ENV === 'production',
};

// Database configuration
export const database = {
	url: requireEnv('DATABASE_URL'),
};

// Encryption configuration
export const encryptionKey =
  process.env.ENCRYPTION_KEY ??
  'deadbeefcafebabedeadbeefcafebabedeadbeefcafebabedeadbeefcafebabe';

// Path configuration (uses $HOME as base for both local dev and Databricks Apps)
const homeDir = process.env.HOME ?? '/tmp';
export const paths = {
  // Base paths for local storage
  sessionsBase: path.join(homeDir, 'ws'),
  usersBase: path.join(homeDir, 'users'),
};

// Agent environment configuration (uppercase keys for direct env spread)
export const agentEnv = {
  HOME: process.env.HOME,
  PATH: `${process.env.PATH}:${process.env.HOME}/.bin`,
  LOCAL_BASE_PATH: path.join(process.env.HOME ?? '/tmp', 'u'), // deprecated, use paths instead
  SESSIONS_BASE_PATH: paths.sessionsBase,
  USERS_BASE_PATH: paths.usersBase,
  DATABRICKS_APP_NAME: databricks.appName,
  // Databricks CLI
  DATABRICKS_HOST: databricks.hostUrl,
  //DATABRICKS_CLIENT_ID: databricks.clientId,
  //DATABRICKS_CLIENT_SECRET: databricks.clientSecret,
  // Claude Code
  ANTHROPIC_BASE_URL: `${databricks.hostUrl}/serving-endpoints/anthropic`,
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'databricks-claude-opus-4-5',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'databricks-claude-sonnet-4-5',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'databricks-claude-haiku-4-5',
};
