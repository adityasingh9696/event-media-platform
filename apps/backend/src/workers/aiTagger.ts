import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { MediaMetadata } from '../lib/mongodb';
import { classifyImage, captionImage, moderateImage } from '../lib/huggingface';
import { faceDetectQueue } from '../lib/queue';
import { redis } from '../lib/redis';

export const aiTaggerWorker = new Worker(
  'media.ai-tag',
  async (job: Job) => {
    const { mediaId, s3Key, albumId } = job.data;
    console.info(`[AITagger] Running AI analysis for media ${mediaId}`);

    const clCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!clCloudName) {
      throw new Error('CLOUDINARY_CLOUD_NAME environment variable is not set');
    }
    const clUrl = `https://res.cloudinary.com/${clCloudName}/image/upload/${s3Key}`;

    try {
      // 1. Run AI tasks in parallel (fetch Hugging Face APIs)
      const [labels, caption, isNsfw] = await Promise.all([
        classifyImage(clUrl),
        captionImage(clUrl),
        moderateImage(clUrl),
      ]);

      console.info(`[AITagger] AI Results for ${mediaId}: tagsCount=${labels.length}, hasCaption=${!!caption}, isNsfw=${isNsfw}`);

      // 2. Filter tags with score > 0.1
      const validLabels = labels.filter((l) => l.score > 0.1);
      const tagNames = validLabels.map((l) => l.label.toLowerCase().trim()).filter(Boolean);

      // 3. Update PostgreSQL with caption and NSFW status
      await prisma.media.update({
        where: { id: mediaId },
        data: {
          isModerationFlagged: isNsfw,
          aiCaptionGenerated: !!caption,
        },
      });

      // 4. Upsert tags and link them to Media in PostgreSQL
      // Delete any previous AI tags to keep it idempotent
      await prisma.mediaTag.deleteMany({
        where: { mediaId, source: 'ai' },
      });

      for (const label of validLabels) {
        const tagName = label.label.toLowerCase().trim();
        if (!tagName) continue;

        const tagObj = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });

        await prisma.mediaTag.create({
          data: {
            mediaId,
            tagId: tagObj.id,
            confidence: Math.round(label.score * 100),
            source: 'ai',
          },
        });
      }

      // 5. Update MongoDB Metadata
      await MediaMetadata.updateOne(
        { mediaId },
        {
          aiCaption: caption || undefined,
          aiTags: tagNames,
          processingStatus: 'done',
        }
      );

      // 6. Enqueue Face Detection
      const album = await prisma.album.findUnique({
        where: { id: albumId },
        include: { event: { select: { clubId: true } } },
      });

      if (album?.event?.clubId) {
        await faceDetectQueue.add(
          'face-detect',
          {
            mediaId,
            s3Key, // Cloudinary public ID
            clubId: album.event.clubId,
            albumId,
          },
          { jobId: `face-detect:${mediaId}` }
        );
      }

      console.info(`[AITagger] Completed AI tagging for media ${mediaId}`);
    } catch (err: any) {
      console.error(`[AITagger] Error analyzing media ${mediaId}:`, err);
      throw err;
    }
  },
  { connection: redis as any }
);
