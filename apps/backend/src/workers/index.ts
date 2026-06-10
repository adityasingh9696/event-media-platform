import 'dotenv/config';
import { connectMongoDB } from '../lib/mongodb';
import { connectRedis, isRedisMocked } from '../lib/redis';
import { loadFaceModels } from '../lib/faceapi';
import { getMediaProcessorWorker } from './mediaProcessor';
import { getAiTaggerWorker } from './aiTagger';
import { getFaceDetectorWorker } from './faceDetector';

async function startWorkers() {
  console.info('🚀 Starting BullMQ background workers...');

  // Connect to databases
  await connectMongoDB();
  await connectRedis();

  if (isRedisMocked()) {
    console.warn('⚠️  Redis is mocked. BullMQ workers will not be started (jobs will run in-memory inside the main server instead).');
    
    // We keep the process alive so that the process manager doesn't restart it or report it as crashed
    console.info('💤 Worker process is sleeping/idle.');
    await new Promise(() => {}); // sleep forever
    return;
  }

  // Load face detection models
  await loadFaceModels();

  // Active workers
  const mediaProcessorWorker = getMediaProcessorWorker();
  const aiTaggerWorker = getAiTaggerWorker();
  const faceDetectorWorker = getFaceDetectorWorker();

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
