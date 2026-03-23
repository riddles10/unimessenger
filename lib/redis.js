import IORedis from 'ioredis';

// Parse the Redis URL — Upstash requires TLS (rediss://) on port 6380
const redisUrl = (process.env.REDIS_URL || '').trim();

export function createRedisConnection() {
  const opts = {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  };

  // If using rediss:// (TLS), ensure tls is enabled
  if (redisUrl.startsWith('rediss://')) {
    opts.tls = { rejectUnauthorized: false };
  }

  const conn = new IORedis(redisUrl, opts);

  conn.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  conn.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  return conn;
}
