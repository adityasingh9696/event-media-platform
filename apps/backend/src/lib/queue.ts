import { Queue } from 'bullmq';
import { isRedisMocked, getRealRedisClient } from './redis';

// ─── Queue Names ──────────────────────────────────────────────────────────────
export const QUEUE_MEDIA_PROCESS = 'media.process';
export const QUEUE_MEDIA_AI_TAG = 'media.ai-tag';
export const QUEUE_FACE_DETECT = 'media.face-detect';

// ─── Lazily Initialized Queues ────────────────────────────────────────────────
let mediaProcessQueue: Queue | null = null;
let mediaAiTagQueue: Queue | null = null;
let faceDetectQueue: Queue | null = null;

function initQueues() {
  if (isRedisMocked()) return;
  if (mediaProcessQueue) return;

  const connection = getRealRedisClient() as any;

  mediaProcessQueue = new Queue(QUEUE_MEDIA_PROCESS, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  mediaAiTagQueue = new Queue(QUEUE_MEDIA_AI_TAG, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 8000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  faceDetectQueue = new Queue(QUEUE_FACE_DETECT, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 10000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
}

// ─── Resilient Enqueuer ───────────────────────────────────────────────────────
export async function enqueueJob(queueName: string, data: any): Promise<void> {
  const isMock = isRedisMocked();

  if (isMock) {
    console.info(`[FallbackQueue] Redis is mocked. Running job for '${queueName}' in-memory...`);
    setImmediate(async () => {
      try {
        const { processMedia, tagMediaAI, detectFaces } = await import('../workers/processors');
        if (queueName === QUEUE_MEDIA_PROCESS) {
          await processMedia(data);
        } else if (queueName === QUEUE_MEDIA_AI_TAG) {
          await tagMediaAI(data);
        } else if (queueName === QUEUE_FACE_DETECT) {
          await detectFaces(data);
        }
      } catch (err: any) {
        console.error(`[FallbackQueue] Error running in-memory job for '${queueName}':`, err.message);
      }
    });
    return;
  }

  // Ensure queues are initialized
  initQueues();

  try {
    if (queueName === QUEUE_MEDIA_PROCESS) {
      await mediaProcessQueue!.add('process', data, { jobId: `process:${data.mediaId}` });
    } else if (queueName === QUEUE_MEDIA_AI_TAG) {
      await mediaAiTagQueue!.add('ai-tag', data, { jobId: `ai-tag:${data.mediaId}` });
    } else if (queueName === QUEUE_FACE_DETECT) {
      await faceDetectQueue!.add('face-detect', data, { jobId: `face-detect:${data.mediaId}` });
    }
    console.info(`[Queue] Enqueued job for '${queueName}' via BullMQ`);
  } catch (err: any) {
    console.error(`[Queue] Failed to add to BullMQ queue '${queueName}' (${err.message}). Falling back to in-memory.`);
    
    // Asynchronous local fallback
    setImmediate(async () => {
      try {
        const { processMedia, tagMediaAI, detectFaces } = await import('../workers/processors');
        if (queueName === QUEUE_MEDIA_PROCESS) {
          await processMedia(data);
        } else if (queueName === QUEUE_MEDIA_AI_TAG) {
          await tagMediaAI(data);
        } else if (queueName === QUEUE_FACE_DETECT) {
          await detectFaces(data);
        }
      } catch (fallbackErr: any) {
        console.error(`[Queue-Fallback] Error running in-memory fallback for '${queueName}':`, fallbackErr.message);
      }
    });
  }
}

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
  if (isRedisMocked()) {
    return [
      { name: QUEUE_MEDIA_PROCESS, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
      { name: QUEUE_MEDIA_AI_TAG, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
      { name: QUEUE_FACE_DETECT, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
    ];
  }

  initQueues();
  const queues = [mediaProcessQueue!, mediaAiTagQueue!, faceDetectQueue!];
  const stats = await Promise.all(
    queues.map(async (q) => {
      try {
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
      } catch {
        return {
          name: q.name,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
        };
      }
    })
  );

  return stats;
}
