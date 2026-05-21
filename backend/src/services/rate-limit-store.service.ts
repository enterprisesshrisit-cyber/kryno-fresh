import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let rateLimitRedis: Redis | null = null;

export function getRateLimitRedisClient() {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!rateLimitRedis) {
    rateLimitRedis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      tls: env.REDIS_TLS ? {} : undefined
    });

    rateLimitRedis.on('error', (error: unknown) => {
      console.error('[REDIS_RATE_LIMIT_ERROR]', error);
    });
  }

  return rateLimitRedis;
}

export async function closeRateLimitRedisClient() {
  if (!rateLimitRedis) {
    return;
  }

  const client = rateLimitRedis;
  rateLimitRedis = null;
  await client.quit().catch(() => client.disconnect());
}
