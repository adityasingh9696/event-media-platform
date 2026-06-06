import 'dotenv/config';
import { connectMongoDB } from '../lib/mongodb';
import { connectRedis } from '../lib/redis';
import { loadFaceModels } from '../lib/faceapi';
import { mediaProcessorWorker } from './mediaProcessor';
import { aiTaggerWorker } from './aiTagger';
import { faceDetectorWorker } from './faceDetector';

async function startWorkers() {
  console.info('🚀 Starting BullMQ background workers...');

  // Connect to databases
  await connectMongoDB();
  await connectRedis();

  // Load face detection models
  await loadFaceModels();

  // Active workers
  console.info('🤖 Workers active and listening for jobs:');
  console.info(`  - media.process: active`);
  console.info(`  - media.ai-tag: active`);
  console.info(`  - media.face-detect: active`);

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.info(`Received ${signal}, shutting down workers...`);
    await Promise.all([
      mediaProcessorWorker.close(),
      aiTaggerWorker.close(),
      faceDetectorWorker.close(),
    ]);
    console.info('Workers shut down successfully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorkers().catch((err) => {
  console.error('Fatal error starting background workers:', err);
  process.exit(1);
});
