import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '@/config/env.js';
import { instagramWebhooksQueue } from '@/config/redis.js';

// Schema de validação dos parâmetros de query do handshake da Meta
export const metaHandshakeQuerySchema = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z.string().optional(),
});

export type MetaHandshakeQuery = z.infer<typeof metaHandshakeQuerySchema>;

export class WebhooksController {
  /**
   * GET /webhook
   * Validação de Handshake da Meta Graph API.
   * Valida hub.mode e hub.verify_token, respondendo com hub.challenge em caso de sucesso.
   */
  async verifyChallenge(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parseResult = metaHandshakeQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid query parameters for webhook verification',
      });
    }

    const {
      'hub.mode': mode,
      'hub.verify_token': verifyToken,
      'hub.challenge': challenge,
    } = parseResult.data;

    if (mode === 'subscribe' && verifyToken === env.META_VERIFY_TOKEN && challenge) {
      request.log.info('Meta webhook handshake challenge verified successfully');
      // A Meta exige o retorno do challenge como texto plano (text/plain) com HTTP 200
      return reply.status(200).type('text/plain').send(challenge);
    }

    request.log.warn(
      { mode, verifyToken },
      'Meta webhook handshake verification failed: token mismatch'
    );
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Verification token mismatch or invalid hub.mode',
    });
  }

  /**
   * POST /webhook
   * Ingestão imediata de eventos da Meta.
   * - Assinatura HMAC já foi validada pelo middleware de preHandler.
   * - Enfileira o payload bruto na fila BullMQ "instagram-webhooks".
   * - NENHUMA regra de negócio ou chamada externa é realizada aqui.
   * - Responde imediatamente com HTTP 200 "EVENT_RECEIVED" (< 100ms).
   */
  async handleWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const jobId = crypto.randomUUID();
    const payload = request.body as Record<string, unknown>;

    // Despacho assíncrono para a fila BullMQ "instagram-webhooks"
    await instagramWebhooksQueue.add(
      'meta-event',
      {
        jobId,
        receivedAt: new Date().toISOString(),
        payload: payload ?? {},
      },
      {
        jobId,
      }
    );

    // Resposta imediata exigida pela Meta com status 200 EVENT_RECEIVED
    return reply.status(200).type('text/plain').send('EVENT_RECEIVED');
  }
}

export const webhooksController = new WebhooksController();
