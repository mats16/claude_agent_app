import { buildApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { drainQueue } from './services/workspace-queue.service.js';
import { initializeEncryption } from './utils/encryption.js';

// Run database migrations before starting the server
await runMigrations();

const app = await buildApp();

// Initialize encryption for PAT storage (after config plugin is loaded)
initializeEncryption(app.config.ENCRYPTION_KEY);

const host = '0.0.0.0';
const port = app.config.DATABRICKS_APP_PORT;

// Start server
try {
  await app.listen({ host, port });
  console.log(`Backend server running on http://${host}:${port}`);
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

  await app.close();
  console.log('HTTP server closed');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
