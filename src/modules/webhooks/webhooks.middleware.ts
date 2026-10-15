import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { env } from '@/config/env.js';

/**
 * Middleware para validação criptográfica obrigatória de Webhooks da Meta.
 * - Captura o rawBody antes do parse JSON.
 * - Valida a assinatura HMAC SHA-256 contra o header x-hub-signature-256.
 * - Utiliza crypto.timingSafeEqual para impedir ataques de temporização (Timing Attacks).
 * - Rejeita requisições não autenticadas imediatamente com HTTP 401 Unauthorized.
 */
export async function verifyMetaHmacMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const signatureHeader = request.headers['x-hub-signature-256'];

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing x-hub-signature-256 header',
    });
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256' || !parts[1]) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid signature header format. Expected sha256=<hash>',
    });
  }

  const signature = parts[1];

  // Obtém o raw body capturado pelo plugin fastify-raw-body
  const rawBody = (request as unknown as { rawBody?: Buffer | string }).rawBody;

  if (!rawBody) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Raw body buffer is missing for HMAC verification',
    });
  }

  const payloadBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf-8');

  // Calcula o HMAC SHA-256 esperado usando o META_APP_SECRET
  const expectedHash = crypto
    .createHmac('sha256', env.META_APP_SECRET)
    .update(payloadBuffer)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  // Proteção contra Timing Attacks com timingSafeEqual
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    request.log.warn({ signatureHeader }, 'HMAC signature verification failed');
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid webhook signature',
    });
  }
}
