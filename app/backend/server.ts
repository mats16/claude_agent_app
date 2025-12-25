// Load environment variables first, before any other imports
import './env.js';

import { buildApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { drainQueue } from './services/workspaceQueueService.js';
import { initializeEncryption } from './utils/encryption.js';
import { initMlflowTracing, flushTraces } from './agent/mlflowTracing.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;

// Initialize encryption for PAT storage
initializeEncryption();

// Initialize MLflow tracing (if enabled)
initMlflowTracing();

// Run database migrations before starting the server
await runMigrations();

const app = await buildApp();

// Start server
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`${signal} signal received: closing HTTP server`);

  // Drain the workspace sync queue
  console.log('Draining workspace sync queue...');
  try {
    await drainQueue();
    console.log('Workspace sync queue drained');
  } catch (err) {
    console.error('Error draining workspace sync queue:', err);
  }

  // Flush MLflow traces before shutdown
  console.log('Flushing MLflow traces...');
  try {
    await flushTraces();
    console.log('MLflow traces flushed');
  } catch (err) {
    console.error('Error flushing MLflow traces:', err);
  }

  await app.close();
  console.log('HTTP server closed');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
