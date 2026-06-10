import Redis from 'ioredis';

const redisUrl = "rediss://default:gQAAAAAAAjoOAAIgcDlONTllZThiMmI4Yjk0ZGJkOWY5YjM4MWE5NTJiMjk0OQ==@valued-cod-144270.upstash.io:6379";

async function run() {
  console.log('Starting Upstash Redis ping retry loop with new credentials...');
  for (let i = 1; i <= 6; i++) {
    console.log(`\nAttempt ${i}/6...`);
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 10000,
    });

    try {
      await redis.connect();
      console.log('Sending PING...');
      const reply = await redis.ping();
      console.log(`✅ Success! Ping reply: ${reply}`);
      redis.disconnect();
      return;
    } catch (err: any) {
      console.error(`❌ Attempt ${i} failed:`, err.message || err);
    } finally {
      redis.disconnect();
    }

    if (i < 6) {
      console.log('Waiting 5 seconds before next attempt...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

run().catch(console.error);
