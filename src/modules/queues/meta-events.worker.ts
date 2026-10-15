import { Worker, Job } from 'bullmq';
import { redisConfig } from '@/shared/redis/connection.js';
import {
  META_EVENTS_QUEUE_NAME,
  MetaWebhookJobData,
} from './meta-events.queue.js';

/**
 * Worker that processes Meta Webhook events asynchronously in the background.
 * Keeps business logic strictly separated from the fast HTTP webhook handler.
 */
export function createMetaEventsWorker() {
  const worker = new Worker<MetaWebhookJobData>(
    META_EVENTS_QUEUE_NAME,
    async (job: Job<MetaWebhookJobData>) => {
      const { jobId, receivedAt, rawPayload } = job.data;
      console.log(`[Worker] Processing job ${jobId} received at ${receivedAt}`);

      // Business logic, multi-tenant resolution, and automation triggers happen here.
      for (const entry of rawPayload.entry) {
        if (entry.messaging) {
          for (const msg of entry.messaging) {
            console.log(
              `[Worker] Event from ${msg.sender.id} to ${msg.recipient.id}: ${msg.message?.text ?? 'non-text'}`
            );
          }
        }
      }

      return { status: 'processed', entriesCount: rawPayload.entry.length };
    },
    {
      connection: redisConfig,
      concurrency: 10,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
