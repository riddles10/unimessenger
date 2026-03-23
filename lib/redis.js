import IORedis from 'ioredis';

// Parse the Redis URL — Upstash requires TLS (rediss://)
const redisUrl = process.env.REDIS_URL.trim();

export function createRedisConnection() {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false
  });
}
