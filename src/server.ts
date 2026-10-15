import { buildApp } from './app.js';
import { env } from './config/env.js';
import { createEngineWorker } from './modules/engine/engine.worker.js';
import { createFlowDelayedWorker } from './modules/engine/flow-delayed.worker.js';
import { redisClient } from './config/redis.js';
import { prisma } from './shared/database/prisma.js';

async function main() {
  const app = await buildApp();

  // Initialize BullMQ workers for Instagram event processing and delayed flows
  const engineWorker = createEngineWorker();
  const delayedWorker = createFlowDelayedWorker();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await app.close();
      await engineWorker.close();
      await delayedWorker.close();
      await redisClient.quit();
      await prisma.$disconnect();
      app.log.info('Graceful shutdown completed.');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`
🚀 Camichat Server is running!
📡 URL: http://${env.HOST}:${env.PORT}
🏥 Health: http://${env.HOST}:${env.PORT}/health
🔗 Meta Webhook: http://${env.HOST}:${env.PORT}/webhook
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal bootstrapping error:', err);
  process.exit(1);
});
