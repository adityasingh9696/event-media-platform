import Redis from 'ioredis';

let isMocked = true; // Default to mock for safety

// ─── Lightweight In-Memory Mock Redis client ────────────────────────────────
class MockRedis {
  private store: Map<string, string> = new Map();
  public status: string = 'ready';

  constructor() {
    console.warn('⚠️  Redis: Using in-memory mock client fallback');
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    setTimeout(() => {
      this.store.delete(key);
    }, seconds * 1000);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const deleted = this.store.delete(key);
    return deleted ? 1 : 0;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async ping(): Promise<'PONG'> { return 'PONG'; }

  on(event: string, handler: (...args: any[]) => void) {
    if (event === 'connect' || event === 'ready') {
      setTimeout(() => handler(), 10);
    }
    return this;
  }
}

const mockRedis = new MockRedis();
let realRedis: Redis | null = null;

const url = process.env.REDIS_URL || 'redis://localhost:6379';

try {
  realRedis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 0, // Fail commands immediately if not connected (prevents hangs)
    retryStrategy(times) {
      // Limit reconnect attempts if credentials are bad or database is offline
      if (times > 3) {
        console.warn('⚠️  Redis: Max connection retries reached. Staying in mock mode.');
        isMocked = true;
        return null; // stop retrying
      }
      return Math.min(times * 2000, 10000); // Backoff retry
    }
  });

  realRedis.on('error', (err) => {
    // Suppress spammy connection errors since we handle fallback gracefully
    console.error('⚠️  Redis client reported connection issue:', err.message);
    isMocked = true;
  });

  realRedis.on('close', () => {
    isMocked = true;
  });
} catch (err: any) {
  console.error('⚠️  Failed to initialize real Redis:', err.message);
  isMocked = true;
}

// ─── Exported Proxy Client ───────────────────────────────────────────────────
export const redis = new Proxy({}, {
  get(target, prop) {
    const activeClient = (isMocked || !realRedis) ? mockRedis : realRedis;
    const value = (activeClient as any)[prop];
    if (typeof value === 'function') {
      return value.bind(activeClient);
    }
    return value;
  },
  getPrototypeOf(target) {
    const activeClient = (isMocked || !realRedis) ? mockRedis : realRedis;
    return Object.getPrototypeOf(activeClient);
  }
}) as any as Redis;

export function getRedisClient(): Redis {
  return redis;
}

export function getRealRedisClient(): Redis | null {
  return realRedis;
}

export async function connectRedis(): Promise<void> {
  if (!realRedis) {
    isMocked = true;
    return;
  }
  
  try {
    console.info('🔌 Redis: Attempting to connect...');
    
    // Race connection attempt against a hard timeout to prevent TLS handshake hangs
    const connectionTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection attempt timed out (TLS/Handshake hang prevention)')), 3000)
    );

    await Promise.race([
      realRedis.connect(),
      connectionTimeout
    ]);
    
    // Verify connection is authenticated and working by sending PING
    const reply = await realRedis.ping();
    if (reply === 'PONG') {
      isMocked = false;
      console.info('✅ Redis: Connected and authenticated successfully');
    } else {
      throw new Error(`Unexpected ping response: ${reply}`);
    }
  } catch (err: any) {
    console.warn('⚠️  Redis connection/auth failed. Falling back to in-memory mock:', err.message);
    isMocked = true;
    try {
      realRedis.disconnect();
    } catch {
      // ignore
    }
  }
}

export function isRedisMocked(): boolean {
  return isMocked;
}

export default redis;
