/**
 * Drizzle ORM Custom Types
 *
 * This module provides custom column types for Drizzle ORM that automatically
 * handle data transformation during database operations.
 */

import { customType } from 'drizzle-orm/pg-core';
import {
  encrypt,
  decrypt,
  isEncryptionAvailable,
} from '../utils/encryption.js';

/**
 * Encrypted text column type using AES-256-GCM.
 *
 * This custom type automatically encrypts plaintext when inserting/updating
 * and decrypts ciphertext when selecting from the database.
 *
 * Features:
 * - Transparent encryption/decryption within ORM operations
 * - Uses AES-256-GCM for authenticated encryption (tamper detection)
 * - Gracefully handles null values (passes through as-is)
 *
 * Requirements:
 * - Encryption must be initialized before any database operations
 * - The ENCRYPTION_KEY environment variable must be configured
 *
 * @example
 * // In schema definition (notNull)
 * export const secretsTable = pgTable('secrets', {
 *   id: text('id').primaryKey(),
 *   apiKey: encryptedText('api_key').notNull(),
 * });
 *
 * // In schema definition (nullable)
 * export const optionalSecretsTable = pgTable('optional_secrets', {
 *   id: text('id').primaryKey(),
 *   optionalKey: encryptedText('optional_key'), // Can be null
 * });
 *
 * // Usage - plaintext in TypeScript, encrypted in database
 * await db.insert(secretsTable).values({
 *   id: '1',
 *   apiKey: 'my-secret-api-key', // Automatically encrypted before storage
 * });
 *
 * const result = await db.select().from(secretsTable);
 * console.log(result[0].apiKey); // 'my-secret-api-key' - Automatically decrypted
 */
export const encryptedText = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'text';
  },

  /**
   * Transform plaintext to encrypted ciphertext before database storage.
   * Called during INSERT and UPDATE operations.
   * Null values pass through unchanged.
   */
  toDriver(value: string): string {
    // Handle null/undefined - pass through as-is for nullable columns
    if (value === null || value === undefined) {
      return value as unknown as string;
    }

    if (!isEncryptionAvailable()) {
      throw new Error(
        'Encryption not initialized. Cannot store encrypted data. ' +
          'Ensure ENCRYPTION_KEY is configured and initializeEncryption() was called.'
      );
    }
    return encrypt(value);
  },

  /**
   * Transform encrypted ciphertext to plaintext after reading from database.
   * Called during SELECT operations.
   * Null values pass through unchanged.
   */
  fromDriver(value: string): string {
    // Handle null/undefined - pass through as-is for nullable columns
    if (value === null || value === undefined) {
      return value as unknown as string;
    }

    if (!isEncryptionAvailable()) {
      throw new Error(
        'Encryption not initialized. Cannot read encrypted data. ' +
          'Ensure ENCRYPTION_KEY is configured and initializeEncryption() was called.'
      );
    }
    return decrypt(value);
  },
});
