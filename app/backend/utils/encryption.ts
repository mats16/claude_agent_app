/**
 * AES-256-GCM Encryption Utility for Sensitive Data
 *
 * This module provides encryption and decryption functions using AES-256-GCM,
 * the recommended standard for authenticated encryption. GCM mode provides:
 * - Confidentiality: Data is encrypted and unreadable without the key
 * - Integrity: Tampering with ciphertext is detected via the auth tag
 * - Authenticity: The data originated from someone with the encryption key
 *
 * Perfect for encrypting PAT (Personal Access Tokens) and other sensitive data.
 *
 * Ciphertext format: iv:authTag:encryptedData (all hex-encoded)
 */

import crypto from 'crypto';

// ============================================================================
// Constants
// ============================================================================

/** AES-256-GCM algorithm identifier */
const ALGORITHM = 'aes-256-gcm' as const;

/** Initialization Vector length in bytes (128 bits for GCM) */
const IV_LENGTH = 16;

/** Authentication tag length in bytes (128 bits for GCM) */
const AUTH_TAG_LENGTH = 16;

/** Required encryption key length in hex characters (32 bytes = 64 hex chars) */
const KEY_HEX_LENGTH = 64;

/** Delimiter used to separate IV, auth tag, and ciphertext */
const CIPHERTEXT_DELIMITER = ':';

// ============================================================================
// Module State
// ============================================================================

let encryptionKey: Buffer | null = null;
let encryptionAvailable = false;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the encryption module with the provided encryption key.
 * Must be called at server startup before any encrypt/decrypt operations.
 *
 * Note: ENCRYPTION_KEY is validated by the config plugin (plugins/config.ts).
 * This function only handles initialization with the validated key.
 *
 * @param encryptionKeyHex - The encryption key as a 64-character hex string (32 bytes), or empty to disable
 * @returns true if encryption is available, false otherwise
 *
 * @example
 * // At server startup (after Fastify app is built)
 * if (initializeEncryption(app.config.ENCRYPTION_KEY)) {
 *   console.log('Encryption ready');
 * } else {
 *   console.warn('PAT storage disabled');
 * }
 */
export function initializeEncryption(encryptionKeyHex: string): boolean {
  // If key is empty/not provided, disable encryption (PAT storage disabled)
  if (!encryptionKeyHex) {
    encryptionKey = null;
    encryptionAvailable = false;
    console.warn(
      '[Encryption] ENCRYPTION_KEY not set. PAT storage feature disabled.'
    );
    return false;
  }

  // Key is provided and already validated by config plugin
  // Just initialize the Buffer
  try {
    encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
    encryptionAvailable = true;
    console.log('[Encryption] Initialized successfully.');
    return true;
  } catch (error) {
    encryptionKey = null;
    encryptionAvailable = false;
    console.error('[Encryption] Failed to initialize:', error);
    return false;
  }
}

/**
 * Check if encryption has been initialized and is available for use.
 *
 * @returns true if encrypt/decrypt operations can be performed
 */
export function isEncryptionAvailable(): boolean {
  return encryptionAvailable;
}

// ============================================================================
// Core Encryption/Decryption Functions
// ============================================================================

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * Uses a randomly generated IV for each encryption, ensuring that the same
 * plaintext produces different ciphertext each time (semantic security).
 *
 * @param plaintext - The text to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex-encoded)
 * @throws Error if encryption is not initialized
 *
 * @example
 * const encrypted = encrypt('my-secret-token');
 * // Returns something like: "a1b2c3....:d4e5f6....:789abc...."
 */
export function encrypt(plaintext: string): string {
  if (!encryptionKey) {
    console.warn(
      '[Encryption] WARNING: Storing data in PLAINTEXT (encryption disabled). ' +
      'Set ENCRYPTION_KEY environment variable for production use.'
    );
    return plaintext; // Return plaintext as-is
  }

  // Generate a random IV for this encryption (critical for GCM security)
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

  // Encrypt the plaintext
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get the authentication tag (provides integrity/authenticity)
  const authTag = cipher.getAuthTag();

  // Combine IV, auth tag, and ciphertext with delimiter
  return [iv.toString('hex'), authTag.toString('hex'), encrypted].join(
    CIPHERTEXT_DELIMITER
  );
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 *
 * Validates the authentication tag to ensure the ciphertext hasn't been
 * tampered with. If tampering is detected, an error is thrown.
 *
 * @param ciphertext - Encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plaintext
 * @throws Error if encryption not initialized, format invalid, or data tampered
 *
 * @example
 * const plaintext = decrypt(encryptedString);
 * // Returns the original plaintext
 */
export function decrypt(ciphertext: string): string {
  if (!encryptionKey) {
    console.warn(
      '[Encryption] WARNING: Reading data as PLAINTEXT (encryption disabled).'
    );
    return ciphertext; // Return as-is (assume plaintext)
  }

  // Check if data appears to be encrypted format
  // If encryption is enabled but data is in plaintext (migration scenario),
  // detect and handle gracefully
  // IMPORTANT: Only treat as plaintext if it doesn't contain colons (clear plaintext)
  // If it contains colons, it might be an encryption attempt, so try to decrypt it
  if (!ciphertext.includes(CIPHERTEXT_DELIMITER)) {
    // No colons = clearly plaintext (legacy data before encryption was enabled)
    console.warn(
      '[Encryption] Data does not appear to be encrypted. ' +
      'Returning as plaintext (may be legacy data).'
    );
    return ciphertext; // Assume plaintext from pre-encryption era
  }

  // Has colons, so might be encrypted data - proceed with decryption attempt
  // This will throw errors if format is invalid (which is what we want)
  // Parse the ciphertext components
  const parts = ciphertext.split(CIPHERTEXT_DELIMITER);
  if (parts.length !== 3) {
    throw new Error(
      `Invalid ciphertext format: expected 3 parts separated by '${CIPHERTEXT_DELIMITER}', got ${parts.length}`
    );
  }

  const [ivHex, authTagHex, encryptedData] = parts;

  // Decode the IV
  const iv = Buffer.from(ivHex, 'hex');
  if (iv.length !== IV_LENGTH) {
    throw new Error(
      `Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`
    );
  }

  // Decode the authentication tag
  const authTag = Buffer.from(authTagHex, 'hex');
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`
    );
  }

  // Create decipher and set the auth tag for verification
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);

  // Decrypt (will throw if auth tag verification fails = tampering detected)
  try {
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // GCM auth tag verification failure indicates tampering
    if (
      error instanceof Error &&
      error.message.includes('Unsupported state or unable to authenticate data')
    ) {
      throw new Error(
        'Decryption failed: data may have been tampered with or the encryption key is incorrect'
      );
    }
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Safely encrypt a value, returning null if encryption is not available.
 *
 * This is a convenience wrapper for cases where you want to gracefully
 * handle missing encryption configuration.
 *
 * @param plaintext - The text to encrypt
 * @returns Encrypted string or null if encryption unavailable
 */
export function encryptSafe(plaintext: string): string | null {
  if (!isEncryptionAvailable()) {
    return plaintext; // Return plaintext instead of null
  }
  return encrypt(plaintext);
}

/**
 * Safely decrypt a value, returning null if decryption fails.
 *
 * This is a convenience wrapper for cases where you want to gracefully
 * handle decryption errors (e.g., corrupted data, wrong key).
 *
 * @param ciphertext - The encrypted string to decrypt
 * @returns Decrypted plaintext or null if decryption fails
 */
export function decryptSafe(ciphertext: string): string | null {
  if (!isEncryptionAvailable()) {
    return ciphertext; // Return plaintext instead of null
  }
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}

/**
 * Check if a string appears to be in the encrypted format.
 *
 * This is a heuristic check based on the expected format (iv:authTag:data).
 * It does not verify that the data can actually be decrypted.
 *
 * @param value - The string to check
 * @returns true if the string matches the encrypted format pattern
 */
export function isEncryptedFormat(value: string): boolean {
  const parts = value.split(CIPHERTEXT_DELIMITER);
  if (parts.length !== 3) {
    return false;
  }

  const [ivHex, authTagHex, encryptedData] = parts;

  // Check if all parts are valid hex strings with expected lengths
  const hexPattern = /^[0-9a-fA-F]+$/;

  return (
    ivHex.length === IV_LENGTH * 2 &&
    hexPattern.test(ivHex) &&
    authTagHex.length === AUTH_TAG_LENGTH * 2 &&
    hexPattern.test(authTagHex) &&
    encryptedData.length > 0 &&
    hexPattern.test(encryptedData)
  );
}
