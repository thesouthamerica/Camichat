import crypto from 'node:crypto';
import {
  metaEventsQueue,
  MetaWebhookPayload,
} from '@/modules/queues/meta-events.queue.js';

export class WebhooksService {
  /**
   * Enqueues the raw webhook payload into BullMQ for asynchronous background processing.
   * Ensures the HTTP handler completes in under 100ms with zero business logic executed.
   */
  async enqueueMetaWebhook(payload: MetaWebhookPayload): Promise<{ jobId: string }> {
    const jobId = crypto.randomUUID();

    await metaEventsQueue.add(
      'meta-webhook-event',
      {
        jobId,
        receivedAt: new Date().toISOString(),
        rawPayload: payload,
      },
      {
        jobId,
      }
    );

    return { jobId };
  }
}

export const webhooksService = new WebhooksService();
