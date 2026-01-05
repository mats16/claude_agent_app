import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  initializeEncryption,
  isEncryptionAvailable,
  encrypt,
  decrypt,
  encryptSafe,
  decryptSafe,
  isEncryptedFormat,
} from '../encryption.js';

// Test encryption key (valid 64-char hex string)
const testEncryptionKey = 'deadbeefcafebabedeadbeefcafebabedeadbeefcafebabedeadbeefcafebabe';

describe('encryption', () => {
  describe('initializeEncryption', () => {
    it('should initialize successfully with valid key', () => {
      const result = initializeEncryption(testEncryptionKey);
      expect(result).toBe(true);
      expect(isEncryptionAvailable()).toBe(true);
    });
  });

  describe('encrypt and decrypt', () => {
    beforeEach(() => {
      initializeEncryption(testEncryptionKey);
    });

    it('should encrypt and decrypt a simple string', () => {
      const plaintext = 'my-secret-token';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should encrypt and decrypt an empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt unicode characters', () => {
      const plaintext = '日本語テスト 🔐 emoji test';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt newlines', () => {
      const plaintext = 'line1\nline2\r\nline3';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'test-token';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Same plaintext should decrypt to same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);

      // But ciphertext should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce ciphertext in correct format (iv:authTag:data)', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(3);

      // IV: 16 bytes = 32 hex chars
      expect(parts[0]).toHaveLength(32);
      expect(/^[0-9a-f]+$/.test(parts[0])).toBe(true);

      // Auth tag: 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      expect(/^[0-9a-f]+$/.test(parts[1])).toBe(true);

      // Encrypted data: hex string
      expect(parts[2].length).toBeGreaterThan(0);
      expect(/^[0-9a-f]+$/.test(parts[2])).toBe(true);
    });
  });

  describe('decrypt error handling', () => {
    beforeEach(() => {
      initializeEncryption(testEncryptionKey);
    });

    it('should throw on invalid ciphertext format (missing parts)', () => {
      // Data without colons is treated as plaintext (no error)
      const plainResult = decrypt('invalid');
      expect(plainResult).toBe('invalid');

      // Data with colons but wrong number of parts should throw
      expect(() => decrypt('part1:part2')).toThrow('Invalid ciphertext format');
      expect(() => decrypt('part1:part2:part3:part4')).toThrow(
        'Invalid ciphertext format'
      );
    });

    it('should throw on invalid IV length', () => {
      // IV should be 32 hex chars (16 bytes)
      const invalidIV = 'abcd'; // Too short
      const validAuthTag = 'a'.repeat(32);
      const validData = 'deadbeef';

      expect(() =>
        decrypt(`${invalidIV}:${validAuthTag}:${validData}`)
      ).toThrow('Invalid IV length');
    });

    it('should throw on invalid auth tag length', () => {
      const validIV = 'a'.repeat(32);
      const invalidAuthTag = 'abcd'; // Too short
      const validData = 'deadbeef';

      expect(() =>
        decrypt(`${validIV}:${invalidAuthTag}:${validData}`)
      ).toThrow('Invalid auth tag length');
    });

    it('should throw on tampered ciphertext (integrity check)', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');

      // Tamper with the encrypted data
      const tamperedData =
        parts[2].charAt(0) === 'a'
          ? 'b' + parts[2].slice(1)
          : 'a' + parts[2].slice(1);
      const tampered = `${parts[0]}:${parts[1]}:${tamperedData}`;

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw on tampered auth tag', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');

      // Tamper with the auth tag
      const tamperedAuthTag =
        parts[1].charAt(0) === 'a'
          ? 'b' + parts[1].slice(1)
          : 'a' + parts[1].slice(1);
      const tampered = `${parts[0]}:${tamperedAuthTag}:${parts[2]}`;

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('encryptSafe', () => {
    beforeEach(() => {
      initializeEncryption(testEncryptionKey);
    });

    it('should encrypt and return ciphertext when available', () => {
      const result = encryptSafe('test');
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
      expect(decrypt(result!)).toBe('test');
    });
  });

  describe('decryptSafe', () => {
    beforeEach(() => {
      initializeEncryption(testEncryptionKey);
    });

    it('should decrypt valid ciphertext', () => {
      const encrypted = encrypt('test');
      const result = decryptSafe(encrypted);
      expect(result).toBe('test');
    });

    it('should return null for invalid ciphertext with colons', () => {
      // Data with colons looks like encryption attempt, but invalid format
      const result = decryptSafe('invalid:ciphertext');
      expect(result).toBeNull(); // Decryption fails, returns null
    });

    it('should return plaintext for data without colons', () => {
      // Data without colons is clearly plaintext (legacy data)
      const result = decryptSafe('plaintext-without-colons');
      expect(result).toBe('plaintext-without-colons');
    });

    it('should return null for tampered data', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');
      const tampered = `${parts[0]}:${parts[1]}:ffffffff`;
      const result = decryptSafe(tampered);
      expect(result).toBeNull();
    });
  });

  describe('isEncryptedFormat', () => {
    beforeEach(() => {
      initializeEncryption(testEncryptionKey);
    });

    it('should return true for valid encrypted format', () => {
      const encrypted = encrypt('test');
      expect(isEncryptedFormat(encrypted)).toBe(true);
    });

    it('should return false for plaintext', () => {
      expect(isEncryptedFormat('plain-text')).toBe(false);
      expect(isEncryptedFormat('my-secret-token')).toBe(false);
    });

    it('should return false for invalid format', () => {
      expect(isEncryptedFormat('')).toBe(false);
      expect(isEncryptedFormat('single-part')).toBe(false);
      expect(isEncryptedFormat('two:parts')).toBe(false);
      expect(isEncryptedFormat('four:parts:here:now')).toBe(false);
    });

    it('should return false for wrong IV length', () => {
      const validAuthTag = 'a'.repeat(32);
      const validData = 'deadbeef';
      expect(isEncryptedFormat(`short:${validAuthTag}:${validData}`)).toBe(
        false
      );
    });

    it('should return false for wrong auth tag length', () => {
      const validIV = 'a'.repeat(32);
      const validData = 'deadbeef';
      expect(isEncryptedFormat(`${validIV}:short:${validData}`)).toBe(false);
    });

    it('should return false for non-hex characters', () => {
      const validLength = 'g'.repeat(32); // 'g' is not a hex char
      const validAuthTag = 'a'.repeat(32);
      const validData = 'deadbeef';
      expect(
        isEncryptedFormat(`${validLength}:${validAuthTag}:${validData}`)
      ).toBe(false);
    });

    it('should return false for empty encrypted data', () => {
      const validIV = 'a'.repeat(32);
      const validAuthTag = 'b'.repeat(32);
      expect(isEncryptedFormat(`${validIV}:${validAuthTag}:`)).toBe(false);
    });
  });

  describe('AES-256-GCM properties', () => {
    beforeEach(() => {
      initializeEncryption(testEncryptionKey);
    });

    it('should use 16-byte IV (128 bits)', () => {
      const encrypted = encrypt('test');
      const ivHex = encrypted.split(':')[0];
      expect(ivHex.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('should use 16-byte auth tag (128 bits)', () => {
      const encrypted = encrypt('test');
      const authTagHex = encrypted.split(':')[1];
      expect(authTagHex.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('should encrypt to correct length (includes padding)', () => {
      // AES block size is 16 bytes, GCM is a stream cipher mode
      // so ciphertext length should match plaintext length (in bytes, hex-encoded)
      const plaintext = 'exactly16chars!!'; // 16 chars
      const encrypted = encrypt(plaintext);
      const dataHex = encrypted.split(':')[2];

      // Each character is 1 byte, hex encoding doubles it
      expect(dataHex.length).toBe(plaintext.length * 2);
    });
  });

  describe('PAT-like tokens', () => {
    beforeEach(() => {
      initializeEncryption(testEncryptionKey);
    });

    it('should handle Databricks PAT format', () => {
      // Databricks PAT format: dapi + 32 hex chars
      const pat = 'dapi' + crypto.randomBytes(16).toString('hex');
      const encrypted = encrypt(pat);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(pat);
    });

    it('should handle various token formats', () => {
      const tokens = [
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx',
        'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      ];

      for (const token of tokens) {
        const encrypted = encrypt(token);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(token);
      }
    });
  });
});

describe('encryption without valid key', () => {
  it('should handle empty key (PAT feature disabled)', () => {
    const result = initializeEncryption('');

    expect(result).toBe(false);
    expect(isEncryptionAvailable()).toBe(false);
  });

  it('should return plaintext when encrypting without initialization', () => {
    initializeEncryption(''); // Returns false

    const plaintext = 'my-secret-token';
    const result = encrypt(plaintext);
    expect(result).toBe(plaintext); // Returns as-is
  });

  it('should return plaintext when decrypting without initialization', () => {
    initializeEncryption(''); // Returns false

    const plaintext = 'my-secret-token';
    const result = decrypt(plaintext);
    expect(result).toBe(plaintext); // Returns as-is
  });

  it('should return plaintext from encryptSafe when not initialized', () => {
    initializeEncryption(''); // Returns false

    const plaintext = 'test';
    const result = encryptSafe(plaintext);
    expect(result).toBe(plaintext); // Returns plaintext instead of null
  });

  it('should return plaintext from decryptSafe when not initialized', () => {
    initializeEncryption(''); // Returns false

    const plaintext = 'test';
    const result = decryptSafe(plaintext);
    expect(result).toBe(plaintext); // Returns plaintext instead of null
  });

  it('should handle round-trip in plaintext mode', () => {
    initializeEncryption('');

    const original = 'test-token-12345';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);

    expect(encrypted).toBe(original);
    expect(decrypted).toBe(original);
  });

  it('should warn when storing data in plaintext mode', () => {
    initializeEncryption('');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    encrypt('test');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('PLAINTEXT')
    );

    consoleWarnSpy.mockRestore();
  });
});

describe('mixed mode - plaintext to encrypted migration', () => {
  beforeEach(() => {
    initializeEncryption(testEncryptionKey);
  });

  it('should handle decrypting plaintext data when encryption enabled', () => {
    // Simulate: data stored in plaintext, now encryption is enabled
    const plaintextData = 'my-legacy-token';

    // decrypt() should detect non-encrypted format and return as-is
    const result = decrypt(plaintextData);
    expect(result).toBe(plaintextData);
  });

  it('should handle re-encrypting plaintext data', () => {
    const plaintextData = 'my-legacy-token';

    // Can re-encrypt the plaintext
    const encrypted = encrypt(plaintextData);
    expect(isEncryptedFormat(encrypted)).toBe(true);
    expect(decrypt(encrypted)).toBe(plaintextData);
  });
});
