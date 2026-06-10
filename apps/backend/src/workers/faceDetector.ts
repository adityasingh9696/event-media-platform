import { Worker, Job } from 'bullmq';
import { detectFaces } from './processors';
import { getRealRedisClient } from '../lib/redis';

let worker: Worker | null = null;

export function getFaceDetectorWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      'media.face-detect',
      async (job: Job) => {
        console.info(`[FaceDetectorWorker] Processing job ${job.id} for media ${job.data.mediaId}`);
        await detectFaces(job.data);
      },
      { connection: getRealRedisClient() as any }
    );
  }
  return worker;
}

export default getFaceDetectorWorker;
