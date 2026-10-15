import { Queue } from 'bullmq';
import { redisConfig } from '@/shared/redis/connection.js';

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: {
        mid: string;
        text?: string;
        quick_reply?: { payload: string };
        attachments?: Array<{
          type: string;
          payload: { url: string };
        }>;
      };
      postback?: {
        mid: string;
        title: string;
        payload: string;
      };
      read?: {
        watermark: number;
      };
    }>;
    changes?: Array<{
      field: string;
      value: Record<string, unknown>;
    }>;
  }>;
}

export interface MetaWebhookJobData {
  jobId: string;
  receivedAt: string;
  rawPayload: MetaWebhookPayload;
}

export const META_EVENTS_QUEUE_NAME = 'meta-events-v1';

export const metaEventsQueue = new Queue<MetaWebhookJobData>(META_EVENTS_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s, 4s, 8s, 16s, 32s
    },
    removeOnComplete: {
      count: 1000,
    },
    removeOnFail: {
      count: 5000,
    },
  },
});
