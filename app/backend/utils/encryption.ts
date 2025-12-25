/**
 * AES-256-GCM encryption utility for sensitive data storage
 * Uses server-side ENCRYPTION_KEY from config
 */

import crypto from 'crypto';
import { encryptionKey as encryptionKeyHex } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let encryptionKey: Buffer | null = null;
let encryptionAvailable = false;

/**
 * Initialize encryption with key from config
 * Must be called at server startup
 * @returns true if encryption is available, false otherwise
 */
export function initializeEncryption(): boolean {
  const keyHex = encryptionKeyHex;

  if (!keyHex) {
    console.warn(
      '[Encryption] ENCRYPTION_KEY not set. PAT storage feature disabled.'
    );
    return false;
  }

  if (keyHex.length !== 64) {
    console.error(
      '[Encryption] ENCRYPTION_KEY must be 64 hex characters (32 bytes). PAT storage feature disabled.'
    );
    return false;
  }

  try {
    encryptionKey = Buffer.from(keyHex, 'hex');
    encryptionAvailable = true;
    console.log('[Encryption] Initialized successfully.');
    return true;
  } catch (error) {
    console.error('[Encryption] Failed to initialize:', error);
    return false;
  }
}

/**
 * Check if encryption is available
 */
export function isEncryptionAvailable(): boolean {
  return encryptionAvailable;
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param plaintext - The text to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex encoded)
 * @throws Error if encryption is not initialized
 */
export function encrypt(plaintext: string): string {
  if (!encryptionKey) {
    throw new Error('Encryption not initialized');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param ciphertext - Encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext
 * @throws Error if encryption is not initialized or ciphertext is invalid/tampered
 */
export function decrypt(ciphertext: string): string {
  if (!encryptionKey) {
    throw new Error('Encryption not initialized');
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
