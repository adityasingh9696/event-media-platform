import { Worker, Job } from 'bullmq';
import { tagMediaAI } from './processors';
import { getRealRedisClient } from '../lib/redis';

let worker: Worker | null = null;

export function getAiTaggerWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      'media.ai-tag',
      async (job: Job) => {
        console.info(`[AITaggerWorker] Processing job ${job.id} for media ${job.data.mediaId}`);
        await tagMediaAI(job.data);
      },
      { connection: getRealRedisClient() as any }
    );
  }
  return worker;
}

export default getAiTaggerWorker;
