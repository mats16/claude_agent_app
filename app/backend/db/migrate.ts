/**
 * Database Migration Runner
 *
 * Uses Drizzle ORM's built-in migrator to run migrations.
 * Migration history is tracked in the __drizzle_migrations table.
 */

import dotenv from 'dotenv';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from app/ directory (parent of backend/)
dotenv.config({ path: path.join(__dirname, '../../.env') });

export async function runMigrations(dbUrl?: string) {
  const connectionUrl = dbUrl ?? process.env.DATABASE_URL;

  if (!connectionUrl) {
    console.error('Error: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Migration requires max: 1 connection
  const migrationClient = postgres(connectionUrl, { max: 1 });
  // In drizzle-orm v1.0.0+, we need to pass the client explicitly
  const db = drizzle({ client: migrationClient });

  try {
    const migrationsFolder = path.join(__dirname, 'drizzle');

    console.log('Running database migrations...');
    await migrate(db, { migrationsFolder });
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await migrationClient.end();
  }
}

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith('migrate.ts');
if (isMainModule) {
  runMigrations().catch(() => process.exit(1));
}
