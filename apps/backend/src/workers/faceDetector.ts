import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import {
  loadFaceModels,
  detectFaceDescriptors,
  findMatchingFaces,
  stringToDescriptor,
} from '../lib/faceapi';
import { createNotification } from '../services/notification';
import { redis } from '../lib/redis';

export const faceDetectorWorker = new Worker(
  'media.face-detect',
  async (job: Job) => {
    const { mediaId, s3Key, clubId } = job.data;
    console.info(`[FaceDetector] Running facial recognition for media ${mediaId} in club ${clubId}`);

    const clCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!clCloudName) {
      throw new Error('CLOUDINARY_CLOUD_NAME environment variable is not set');
    }
    const clUrl = `https://res.cloudinary.com/${clCloudName}/image/upload/${s3Key}`;

    try {
      // 1. Ensure models are loaded
      await loadFaceModels();

      // 2. Detect face descriptors in the photo
      const queryDescriptors = await detectFaceDescriptors(clUrl);
      console.info(`[FaceDetector] Detected ${queryDescriptors.length} faces in media ${mediaId}`);

      if (queryDescriptors.length === 0) {
        return;
      }

      // 3. Fetch all enrolled user face embeddings for this club
      const storedEmbeddings = await prisma.faceEmbedding.findMany({
        where: { clubId },
        select: {
          userId: true,
          rekognitionFaceId: true, // stored as serialized string of 128 float values
        },
      });

      if (storedEmbeddings.length === 0) {
        console.info(`[FaceDetector] No enrolled face embeddings found for club ${clubId}`);
        return;
      }

      // 4. Deserialize stored embeddings
      const stored = storedEmbeddings
        .map((emb) => {
          try {
            return {
              userId: emb.userId,
              descriptor: stringToDescriptor(emb.rekognitionFaceId),
            };
          } catch (err) {
            console.error(`[FaceDetector] Failed to parse descriptor for user ${emb.userId}`, err);
            return null;
          }
        })
        .filter((e): e is { userId: string; descriptor: Float32Array } => e !== null);

      // 5. Match descriptors
      for (const desc of queryDescriptors) {
        const matches = findMatchingFaces(desc, stored, 0.5); // 0.5 is a strict, solid threshold for face-api
        
        for (const match of matches) {
          console.info(`[FaceDetector] Matched user ${match.userId} in media ${mediaId} with distance ${match.distance}`);

          // Save tag in PostgreSQL
          const confidence = Math.round((1 - match.distance) * 100);
          await prisma.photoPerson.upsert({
            where: {
              mediaId_userId: {
                mediaId,
                userId: match.userId,
              },
            },
            update: {
              confidence,
            },
            create: {
              mediaId,
              userId: match.userId,
              confidence,
            },
          });

          // Create notification for tagged user
          try {
            await createNotification({
              type: 'media_tagged',
              recipientId: match.userId,
              message: 'You were automatically detected and tagged in a new photo!',
              metadata: { mediaId },
            });
          } catch (err) {
            console.error(`[FaceDetector] Failed to notify user ${match.userId} of auto-tagging:`, err);
          }
        }
      }
    } catch (err: any) {
      console.error(`[FaceDetector] Error running facial recognition for media ${mediaId}:`, err);
      throw err;
    }
  },
  { connection: redis as any }
);
