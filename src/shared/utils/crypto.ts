import crypto from 'node:crypto';
import { env } from '@/config/env.js';

export interface EncryptedTokenData {
  encrypted: string;
  iv: string;
  authTag: string;
  packed?: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes is standard for AES-GCM (NIST SP 800-38D)
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Validates and normalizes a 256-bit encryption key.
 */
function resolveKey(keyHex?: string): Buffer {
  const hex = keyHex ?? env.APP_ENCRYPTION_KEY;
  const key = Buffer.from(hex, 'hex');

  if (key.length !== 32) {
    throw new Error(
      `Invalid encryption key length: got ${key.length} bytes, expected 32 bytes (64 hex characters).`
    );
  }

  return key;
}

/**
 * Encrypts a sensitive Page Access Token using AES-256-GCM.
 * Never stores tokens in plain text in the database.
 *
 * @param token - Plain text Instagram Page Access Token or user token
 * @param secretKeyHex - Optional 64-character hex key (defaults to APP_ENCRYPTION_KEY)
 * @returns EncryptedTokenData containing `encrypted`, `iv`, `authTag`, and a `packed` string
 */
export function encryptToken(
  token: string,
  secretKeyHex?: string
): EncryptedTokenData & { packed: string } {
  if (!token) {
    throw new Error('Token string cannot be empty');
  }

  const key = resolveKey(secretKeyHex);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');

  return {
    encrypted,
    iv: ivHex,
    authTag,
    packed: `${ivHex}:${authTag}:${encrypted}`,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted token payload.
 * Verifies authenticity tag to prevent tampering (Authenticated Encryption).
 *
 * @param data - Object with { encrypted, iv, authTag } OR packed string "iv:authTag:encrypted"
 * @param secretKeyHex - Optional 64-character hex key (defaults to APP_ENCRYPTION_KEY)
 * @returns Decrypted plain text token
 */
export function decryptToken(
  data: EncryptedTokenData | string,
  secretKeyHex?: string
): string {
  const key = resolveKey(secretKeyHex);

  let ivHex: string;
  let authTagHex: string;
  let encryptedHex: string;

  if (typeof data === 'string') {
    const parts = data.split(':');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new Error('Invalid packed token format. Expected "iv:authTag:encrypted"');
    }
    [ivHex, authTagHex, encryptedHex] = parts;
  } else {
    ivHex = data.iv;
    authTagHex = data.authTag;
    encryptedHex = data.encrypted;
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid auth tag length: got ${authTag.length} bytes, expected ${AUTH_TAG_LENGTH} bytes`
    );
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
