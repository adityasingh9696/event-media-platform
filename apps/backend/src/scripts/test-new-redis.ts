import Redis from 'ioredis';

const redisUrl = "rediss://default:gQAAAAAAAjoOAAIgcDlONTllZThiMmI4Yjk0ZGJkOWY5YjM4MWE5NTJiMjk0OQ==@valued-cod-144270.upstash.io:6379";

async function testRedis() {
  console.log('Testing connection with new REDIS_URL...');
  const redis = new Redis(redisUrl, { lazyConnect: true });
  try {
    await redis.connect();
    console.log('Sending PING command...');
    const reply = await redis.ping();
    console.log(`✅ Success! Redis connected and returned PING reply: ${reply}`);
  } catch (err: any) {
    console.error('❌ Redis connection failed:', err.message || err);
  } finally {
    redis.disconnect();
  }
}

testRedis().catch(console.error);
