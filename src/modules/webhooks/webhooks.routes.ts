import { FastifyInstance } from 'fastify';
import { webhooksController } from './webhooks.controller.js';
import { verifyMetaHmacMiddleware } from './webhooks.middleware.js';

export async function webhookRoutes(fastify: FastifyInstance) {
  // 1. Handshake de validação da Meta
  fastify.get('/webhook', (req, reply) =>
    webhooksController.verifyChallenge(req, reply)
  );

  // 2. Ingestão de eventos com validação HMAC SHA-256 e enfileiramento imediato
  fastify.post(
    '/webhook',
    {
      preHandler: [verifyMetaHmacMiddleware],
    },
    (req, reply) => webhooksController.handleWebhook(req, reply)
  );
}
