import { Queue, QueueEvents } from 'bullmq';
import { redis } from './redis';

// ─── Queue Names ──────────────────────────────────────────────────────────────
export const QUEUE_MEDIA_PROCESS = 'media.process';
export const QUEUE_MEDIA_AI_TAG = 'media.ai-tag';
export const QUEUE_FACE_DETECT = 'media.face-detect';

// ─── Shared Redis connection for BullMQ ───────────────────────────────────────
const connection = redis as any;

// ─── Queues ───────────────────────────────────────────────────────────────────

export const mediaProcessQueue = new Queue(QUEUE_MEDIA_PROCESS, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const mediaAiTagQueue = new Queue(QUEUE_MEDIA_AI_TAG, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 8000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const faceDetectQueue = new Queue(QUEUE_FACE_DETECT, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 10000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// ─── Queue Stats ──────────────────────────────────────────────────────────────

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export async function getQueueStats(): Promise<QueueStats[]> {
  const queues = [mediaProcessQueue, mediaAiTagQueue, faceDetectQueue];

  const stats = await Promise.all(
    queues.map(async (q) => {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getCompletedCount(),
        q.getFailedCount(),
        q.getDelayedCount(),
        typeof (q as any).getPausedCount === 'function' ? await (q as any).getPausedCount() : 0,
      ]);

      return {
        name: q.name,
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused,
      };
    })
  );

  return stats;
}

// ─── Job Type Definitions ─────────────────────────────────────────────────────

export interface MediaProcessJobData {
  mediaId: string;
  s3Key: string;
  albumId: string;
  mimeType: string;
}

export interface MediaAiTagJobData {
  mediaId: string;
  s3Key: string;
  albumId: string;
  eventId?: string;
}

export interface FaceDetectJobData {
  mediaId: string;
  s3Key: string;
  clubId: string;
  albumId: string;
}
