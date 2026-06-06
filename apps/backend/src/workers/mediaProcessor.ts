import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { MediaMetadata } from '../lib/mongodb';
import { getResourceDetails, getOptimizedUrl } from '../lib/cloudinary';
import { mediaAiTagQueue } from '../lib/queue';
import { redis } from '../lib/redis';

export const mediaProcessorWorker = new Worker(
  'media.process',
  async (job: Job) => {
    const { mediaId, cloudinaryPublicId, mimeType, albumId } = job.data;
    console.info(`[MediaProcessor] Processing job ${job.id} for media ${mediaId}`);

    try {
      // 1. Mark MongoDB metadata as processing
      await MediaMetadata.updateOne(
        { mediaId },
        { processingStatus: 'processing' }
      );

      let width = 0;
      let height = 0;
      let sizeBytes = 0;

      // 2. Fetch image/video metadata from Cloudinary if image
      if (mimeType.startsWith('image/')) {
        const details = await getResourceDetails(cloudinaryPublicId);
        width = details.width;
        height = details.height;
        sizeBytes = details.bytes;
      }

      // 3. Generate optimized delivery URLs
      const sm = getOptimizedUrl(cloudinaryPublicId, 200);
      const md = getOptimizedUrl(cloudinaryPublicId, 600);
      const lg = getOptimizedUrl(cloudinaryPublicId, 1200);

      // 4. Update MongoDB with thumbnail URLs
      await MediaMetadata.updateOne(
        { mediaId },
        {
          thumbnails: { sm, md, lg },
          processingStatus: 'done', // will be overwritten if AI tags run, but done for now
        }
      );

      // 5. Update PostgreSQL
      await prisma.media.update({
        where: { id: mediaId },
        data: {
          isProcessed: true,
          ...(width && { width }),
          ...(height && { height }),
          ...(sizeBytes && { sizeBytes }),
        },
      });

      // 6. Enqueue next step: AI Tagging
      await mediaAiTagQueue.add(
        'ai-tag',
        {
          mediaId,
          s3Key: cloudinaryPublicId, // s3Key in DB stores Cloudinary public id
          albumId,
        },
        { jobId: `ai-tag:${mediaId}` }
      );

      console.info(`[MediaProcessor] Successfully processed media ${mediaId}`);
    } catch (err: any) {
      console.error(`[MediaProcessor] Error processing job ${job.id}:`, err);
      
      await MediaMetadata.updateOne(
        { mediaId },
        {
          processingStatus: 'failed',
          processingError: err.message,
        }
      );

      throw err;
    }
  },
  { connection: redis as any }
);
