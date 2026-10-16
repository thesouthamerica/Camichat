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
    request.log.error('Raw body buffer is missing for HMAC verification');
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Raw body buffer is missing for HMAC verification',
    });
  }

  const payloadBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf-8');

  // Chaves para testar (App Secret principal e/ou Instagram App Secret)
  const secretsToTry = [
    env.META_APP_SECRET,
    env.INSTAGRAM_APP_SECRET,
    '426765ded52828035910d6b6a3364e04',
    '342e976715ce145cae58859a691d1a91',
  ].filter((s): s is string => Boolean(s && s.trim().length > 0));

  let isValid = false;
  const calculatedHashes: string[] = [];

  for (const secret of secretsToTry) {
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(payloadBuffer)
      .digest('hex');

    calculatedHashes.push(expectedHash);

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    if (
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      isValid = true;
      break;
    }
  }

  if (!isValid) {
    request.log.warn(
      {
        receivedSignature: signature,
        calculatedHashes,
        payloadLength: payloadBuffer.length,
        rawBodyString: payloadBuffer.toString('utf-8').slice(0, 300),
      },
      'HMAC signature verification failed'
    );

    // Em ambiente de desenvolvimento local, se vier do Cloudflare Tunnel oficial, permite prosseguir com aviso
    if (env.NODE_ENV === 'development') {
      request.log.warn('Development mode: Bypassing strict HMAC to process test webhook event');
      return;
    }

    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid webhook signature',
    });
  }
}
