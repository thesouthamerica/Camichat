import { Redis, RedisOptions } from 'ioredis';
import { Queue } from 'bullmq';
import { env } from './env.js';

const getRedisOptions = (): RedisOptions => {
  let host = env.REDIS_HOST;
  let port = env.REDIS_PORT;
  let password = env.REDIS_PASSWORD;
  let isTls = env.REDIS_HOST.includes('upstash.io');

  if (env.REDIS_URL) {
    try {
      const parsed = new URL(env.REDIS_URL);
      host = parsed.hostname;
      port = Number(parsed.port) || 6379;
      password = parsed.password ? decodeURIComponent(parsed.password) : password;
      isTls = parsed.protocol === 'rediss:';
    } catch {
      // fallback to host/port/password
    }
  }

  return {
    host,
    port,
    password: password || undefined,
    tls: isTls ? {} : undefined,
    maxRetriesPerRequest: null, // Obrigatório para funcionamento do BullMQ
    enableReadyCheck: false,
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  };
};

export const redisConfig: RedisOptions = getRedisOptions();

// Cliente Redis singleton
export const redisClient = new Redis(redisConfig);

redisClient.on('connect', () => {
  console.log('✅ [Redis] Conectado com sucesso');
});

redisClient.on('error', (err) => {
  console.error('❌ [Redis] Erro na conexão:', err.message);
});

// Nome da fila do BullMQ
export const INSTAGRAM_WEBHOOKS_QUEUE_NAME = 'instagram-webhooks';

// Definição tipada dos dados do Job
export interface InstagramWebhookJobData {
  jobId: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

// Fila BullMQ conectada ao Redis
export const instagramWebhooksQueue = new Queue<InstagramWebhookJobData>(
  INSTAGRAM_WEBHOOKS_QUEUE_NAME,
  {
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
  }
);

// Fila BullMQ para nós de atraso inteligente (action:smart_delay)
export const FLOW_DELAY_QUEUE_NAME = 'flow-delayed-steps';

export interface FlowDelayedJobData {
  organizationId: string;
  instagramAccountId: string;
  contactId: string;
  igScopedId: string;
  flowId: string;
  targetStepKey: string;
  accessToken: string;
}

export const flowDelayQueue = new Queue<FlowDelayedJobData>(
  FLOW_DELAY_QUEUE_NAME,
  {
    connection: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        count: 1000,
      },
      removeOnFail: {
        count: 5000,
      },
    },
  }
);
