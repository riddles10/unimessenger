import IORedis from 'ioredis';

// Parse Upstash Redis URL into components for reliable TLS connection
// Upstash works better with explicit host/port/password options than URL string
function parseRedisUrl(url) {
  try {
    const parsed = new URL(url.trim());
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      password: decodeURIComponent(parsed.password),
      username: parsed.username || 'default',
      tls: url.startsWith('rediss://') ? {} : undefined,
    };
  } catch {
    return null;
  }
}

export function createRedisConnection() {
  const redisUrl = (process.env.REDIS_URL || '').trim();
  const parsed = parseRedisUrl(redisUrl);

  const opts = parsed
    ? {
        host: parsed.host,
        port: parsed.port,
        password: parsed.password,
        username: parsed.username,
        tls: parsed.tls,
        maxRetriesPerRequest: null, // required by BullMQ
        enableReadyCheck: false,
        connectTimeout: 10000,
        retryStrategy(times) {
          const delay = Math.min(times * 500, 10000);
          console.log(`[Redis] Retry #${times} in ${delay}ms`);
          return delay;
        },
      }
    : { maxRetriesPerRequest: null, enableReadyCheck: false };

  const conn = parsed
    ? new IORedis(opts)
    : new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });

  conn.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  conn.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  conn.on('ready', () => {
    console.log('[Redis] Ready');
  });

  return conn;
}
