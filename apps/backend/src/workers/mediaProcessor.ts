import { Worker, Job } from 'bullmq';
import { processMedia } from './processors';
import { getRealRedisClient } from '../lib/redis';

let worker: Worker | null = null;

export function getMediaProcessorWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      'media.process',
      async (job: Job) => {
        console.info(`[MediaProcessorWorker] Processing job ${job.id} for media ${job.data.mediaId}`);
        await processMedia(job.data);
      },
      { connection: getRealRedisClient() as any }
    );
  }
  return worker;
}

export default getMediaProcessorWorker;
