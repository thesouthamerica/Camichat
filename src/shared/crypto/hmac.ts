import crypto from 'node:crypto';

export interface VerifyMetaSignatureOptions {
  /**
   * Raw request body buffer (MUST be the exact unmodified bytes from the incoming request)
   */
  rawBody: Buffer | string;
  /**
   * The `x-hub-signature-256` header sent by Meta
   * Format: `sha256=<hex_digest>`
   */
  signatureHeader: string | undefined;
  /**
   * Meta App Secret
   */
  appSecret: string;
}

/**
 * Validates Meta webhook signature using HMAC SHA-256 and crypto.timingSafeEqual
 * to defend against timing attacks.
 */
export function verifyMetaSignature({
  rawBody,
  signatureHeader,
  appSecret,
}: VerifyMetaSignatureOptions): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  // Header format should be sha256=<signature>
  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const signature = parts[1];
  if (!signature) {
    return false;
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf-8');

  // Compute expected HMAC SHA-256 digest
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  // Constant time comparison prevents timing attacks
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
