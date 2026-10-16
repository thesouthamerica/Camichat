import Fastify from 'fastify';
import cors from '@fastify/cors';
import rawBody from 'fastify-raw-body';
import { ZodError } from 'zod';
import { webhookRoutes } from './modules/webhooks/webhooks.routes.js';
import { AppError } from './shared/errors/app-error.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // CORS
  await app.register(cors, {
    origin: '*',
  });

  // Raw body plugin (CRITICAL for Meta HMAC SHA-256 verification)
  await app.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: false, // Keep raw Buffer intact for exact HMAC SHA-256 calculation
    runFirst: true,
    routes: ['/webhook'],
  });

  // Healthcheck endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // Register Webhook routes (POST /webhook, GET /webhook)
  await app.register(webhookRoutes);

  // Global Error Handler
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        issues: error.issues,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.code,
        message: error.message,
      });
    }

    // Fastify native errors or objects with statusCode
    if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      const fastifyErr = error as { statusCode: number; name?: string; message?: string };
      return reply.status(fastifyErr.statusCode).send({
        statusCode: fastifyErr.statusCode,
        error: fastifyErr.name ?? 'ERROR',
        message: fastifyErr.message ?? 'An error occurred',
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
    });
  });

  return app;
}
