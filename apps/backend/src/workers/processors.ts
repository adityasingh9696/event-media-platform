import { prisma } from '../lib/prisma';
import { MediaMetadata } from '../lib/mongodb';
import { getResourceDetails, getOptimizedUrl } from '../lib/cloudinary';
import { classifyImage, captionImage, moderateImage } from '../lib/huggingface';
import {
  loadFaceModels,
  detectFaceDescriptors,
  findMatchingFaces,
  stringToDescriptor,
} from '../lib/faceapi';
import { createNotification } from '../services/notification';
import { enqueueJob } from '../lib/queue';

// ─── 1. Core Media Processor ────────────────────────────────────────────────
export async function processMedia(data: {
  mediaId: string;
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
  albumId: string;
  mimeType: string;
}): Promise<void> {
  const { mediaId, cloudinaryPublicId, mimeType, albumId } = data;
  console.info(`[MediaProcessor] Processing mediaId=${mediaId}`);

  try {
    await MediaMetadata.updateOne(
      { mediaId },
      { processingStatus: 'processing' }
    );

    let width = 0;
    let height = 0;
    let sizeBytes = 0;

    if (mimeType.startsWith('image/')) {
      const details = await getResourceDetails(cloudinaryPublicId);
      width = details.width;
      height = details.height;
      sizeBytes = details.bytes;
    }

    const sm = getOptimizedUrl(cloudinaryPublicId, 200);
    const md = getOptimizedUrl(cloudinaryPublicId, 600);
    const lg = getOptimizedUrl(cloudinaryPublicId, 1200);

    await MediaMetadata.updateOne(
      { mediaId },
      {
        thumbnails: { sm, md, lg },
        processingStatus: 'done',
      }
    );

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        isProcessed: true,
        ...(width && { width }),
        ...(height && { height }),
        ...(sizeBytes && { sizeBytes }),
      },
    });

    // Enqueue next step: AI Tagging
    await enqueueJob('media.ai-tag', {
      mediaId,
      s3Key: cloudinaryPublicId,
      albumId,
    });

    console.info(`[MediaProcessor] Successfully processed mediaId=${mediaId}`);
  } catch (err: any) {
    console.error(`[MediaProcessor] Error processing mediaId=${mediaId}:`, err);
    await MediaMetadata.updateOne(
      { mediaId },
      {
        processingStatus: 'failed',
        processingError: err.message,
      }
    );
    throw err;
  }
}

// ─── 2. AI Tagging & Moderation ──────────────────────────────────────────────
export async function tagMediaAI(data: {
  mediaId: string;
  s3Key: string;
  albumId: string;
}): Promise<void> {
  const { mediaId, s3Key, albumId } = data;
  console.info(`[AITagger] Running AI analysis for mediaId=${mediaId}`);

  const clCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!clCloudName) {
    throw new Error('CLOUDINARY_CLOUD_NAME is not set');
  }
  const clUrl = `https://res.cloudinary.com/${clCloudName}/image/upload/${s3Key}`;

  try {
    const [labels, caption, isNsfw] = await Promise.all([
      classifyImage(clUrl),
      captionImage(clUrl),
      moderateImage(clUrl),
    ]);

    console.info(`[AITagger] Results for ${mediaId}: tagsCount=${labels.length}, caption=${!!caption}, nsfw=${isNsfw}`);

    const validLabels = labels.filter((l) => l.score > 0.1);
    const tagNames = validLabels.map((l) => l.label.toLowerCase().trim()).filter(Boolean);

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        isModerationFlagged: isNsfw,
        aiCaptionGenerated: !!caption,
      },
    });

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

    await MediaMetadata.updateOne(
      { mediaId },
      {
        aiCaption: caption || undefined,
        aiTags: tagNames,
        processingStatus: 'done',
      }
    );

    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: { event: { select: { clubId: true } } },
    });

    if (album?.event?.clubId) {
      await enqueueJob('media.face-detect', {
        mediaId,
        s3Key,
        clubId: album.event.clubId,
        albumId,
      });
    }

    console.info(`[AITagger] Completed AI tagging for mediaId=${mediaId}`);
  } catch (err: any) {
    console.error(`[AITagger] Error analyzing mediaId=${mediaId}:`, err);
    throw err;
  }
}

// ─── 3. Facial Recognition Matching ─────────────────────────────────────────
export async function detectFaces(data: {
  mediaId: string;
  s3Key: string;
  clubId: string;
  albumId: string;
}): Promise<void> {
  const { mediaId, s3Key, clubId } = data;
  console.info(`[FaceDetector] Running face matching for mediaId=${mediaId}`);

  const clCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!clCloudName) {
    throw new Error('CLOUDINARY_CLOUD_NAME is not set');
  }
  const clUrl = `https://res.cloudinary.com/${clCloudName}/image/upload/${s3Key}`;

  try {
    await loadFaceModels();
    const queryDescriptors = await detectFaceDescriptors(clUrl);
    console.info(`[FaceDetector] Detected ${queryDescriptors.length} faces in mediaId=${mediaId}`);

    if (queryDescriptors.length === 0) return;

    const storedEmbeddings = await prisma.faceEmbedding.findMany({
      where: { clubId },
      select: { userId: true, rekognitionFaceId: true },
    });

    if (storedEmbeddings.length === 0) {
      console.info('[FaceDetector] No enrolled face embeddings for this club.');
      return;
    }

    const stored = storedEmbeddings
      .map((emb) => {
        try {
          return {
            userId: emb.userId,
            descriptor: stringToDescriptor(emb.rekognitionFaceId),
          };
        } catch {
          return null;
        }
      })
      .filter((e): e is { userId: string; descriptor: Float32Array } => e !== null);

    for (const desc of queryDescriptors) {
      const matches = findMatchingFaces(desc, stored, 0.5);

      for (const match of matches) {
        console.info(`[FaceDetector] Matched user ${match.userId} (distance ${match.distance})`);

        const confidence = Math.round((1 - match.distance) * 100);
        await prisma.photoPerson.upsert({
          where: { mediaId_userId: { mediaId, userId: match.userId } },
          update: { confidence },
          create: { mediaId, userId: match.userId, confidence },
        });

        try {
          await createNotification({
            type: 'media_tagged',
            recipientId: match.userId,
            message: 'You were automatically detected and tagged in a new photo!',
            metadata: { mediaId },
          });
        } catch (err) {
          console.error('[FaceDetector] Failed to notify tagged user:', err);
        }
      }
    }
  } catch (err: any) {
    console.error(`[FaceDetector] Error executing face-matching:`, err);
    throw err;
  }
}
