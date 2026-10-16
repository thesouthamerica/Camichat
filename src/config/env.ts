import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Meta App Credentials
  META_APP_ID: z.string().min(1, 'META_APP_ID is required'),
  META_APP_SECRET: z.string().min(1, 'META_APP_SECRET is required'),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().min(1, 'META_VERIFY_TOKEN is required'),

  // AES-256-GCM Key (must be 32 bytes = 64 hex characters)
  APP_ENCRYPTION_KEY: z
    .string()
    .length(64, 'APP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'),

  // Database URL
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  DIRECT_URL: z.string().url('DIRECT_URL must be a valid connection URL').optional(),

  // Redis Config
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }

  return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
