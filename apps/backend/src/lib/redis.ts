import Redis from 'ioredis';

let redis: Redis;

export function getRedisClient(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      console.info('✅ Redis connected');
    });

    redis.on('error', (err) => {
      console.error('Redis error:', err.message);
    });

    redis.on('close', () => {
      console.warn('⚠️  Redis connection closed');
    });

    redis.on('reconnecting', () => {
      console.info('Redis reconnecting...');
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  if (client.status === 'connecting' || client.status === 'connect' || client.status === 'ready') {
    return;
  }
  try {
    await client.connect();
  } catch (err: any) {
    if (err.message !== 'Redis is already connecting/connected') {
      throw err;
    }
  }
}

// Export singleton for use across the app
export { redis };

// Initialize on module load
const url = process.env.REDIS_URL || 'redis://localhost:6379';
redis = new Redis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('connect', () => console.info('✅ Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err.message));
redis.on('close', () => console.warn('⚠️  Redis connection closed'));
redis.on('reconnecting', () => console.info('Redis reconnecting...'));

export default redis;
