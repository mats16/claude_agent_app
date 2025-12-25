/**
 * Environment variable loader
 *
 * This file must be imported FIRST in server.ts to ensure
 * environment variables are available before any other modules load.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from app/ directory (parent of backend/)
dotenv.config({ path: path.join(__dirname, '../.env') });
