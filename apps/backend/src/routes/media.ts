import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma';
import { MediaMetadata } from '../lib/mongodb';
import { generateUploadSignature, deleteFromCloudinary, getOptimizedUrl } from '../lib/cloudinary';
import { mediaProcessQueue } from '../lib/queue';
import { authenticate } from '../middlewares/authenticate';
import { applyWatermark } from '../services/watermark';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const presignSchema = z.object({
  filename: z.string().min(1).max(500),
  mimeType: z
    .string()
    .regex(/^(image|video)\/.+$/, 'Only image/* and video/* MIME types are allowed'),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024, 'Max file size is 500MB'),
  albumId: z.string().cuid(),
});

const confirmSchema = z.object({
  cloudinaryPublicId: z.string().min(1),
  cloudinaryUrl: z.string().url(),
  albumId: z.string().cuid(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'club_only', 'private']).default('public'),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSecs: z.number().positive().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMimeType(mimeType: string): 'image' | 'video' {
  return mimeType.startsWith('image/') ? 'image' : 'video';
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /media/presign ───────────────────────────────────────────────────
  app.post(
    '/presign',
    {
      schema: {
        tags: ['Media'],
        summary: 'Request a signed Cloudinary signature for direct browser upload',
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          required: ['filename', 'mimeType', 'sizeBytes', 'albumId'],
          properties: {
            filename: { type: 'string' },
            mimeType: { type: 'string' },
            sizeBytes: { type: 'integer' },
            albumId: { type: 'string' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = presignSchema.parse(request.body);

      // Verify album exists and user has access
      const album = await prisma.album.findUnique({
        where: { id: body.albumId },
        include: {
          event: {
            include: {
              club: { include: { members: { where: { userId: request.user.sub }, take: 1 } } },
            },
          },
        },
      });

      if (!album) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
      }

      const isAdmin = request.user.role === 'admin';
      const isMember = album.event.club.members.length > 0;

      if (!isAdmin && !isMember) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You must be a club member to upload media.',
        });
      }

      // Generate Cloudinary folder path
      const folder = `media/${album.event.clubId}/${body.albumId}`;

      // Generate signature
      const sigData = await generateUploadSignature(folder);

      return reply.code(200).send(sigData);
    }
  );

  // ── POST /media/confirm ───────────────────────────────────────────────────
  app.post(
    '/confirm',
    {
      schema: {
        tags: ['Media'],
        summary: 'Confirm a completed Cloudinary upload and trigger processing pipeline',
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          required: ['cloudinaryPublicId', 'cloudinaryUrl', 'albumId', 'filename', 'mimeType', 'sizeBytes'],
          properties: {
            cloudinaryPublicId: { type: 'string' },
            cloudinaryUrl: { type: 'string' },
            albumId: { type: 'string' },
            filename: { type: 'string' },
            mimeType: { type: 'string' },
            sizeBytes: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            visibility: { type: 'string' },
            width: { type: 'integer' },
            height: { type: 'integer' },
            durationSecs: { type: 'number' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = confirmSchema.parse(request.body);

      const album = await prisma.album.findUnique({
        where: { id: body.albumId },
        include: { event: { select: { id: true, clubId: true } } },
      });

      if (!album) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
      }

      const mediaId = cuid();

      // Save to PostgreSQL (mapping cloudinaryPublicId to s3Key)
      const media = await prisma.media.create({
        data: {
          id: mediaId,
          s3Key: body.cloudinaryPublicId,
          title: body.title || body.filename,
          description: body.description,
          mimeType: body.mimeType,
          sizeBytes: BigInt(body.sizeBytes),
          mediaType: getMimeType(body.mimeType),
          visibility: body.visibility,
          albumId: body.albumId,
          uploaderId: request.user.sub,
          width: body.width,
          height: body.height,
          durationSecs: body.durationSecs,
          isProcessed: false,
        },
        include: {
          uploader: { select: { id: true, username: true, displayName: true } },
          album: { select: { id: true, name: true, eventId: true } },
        },
      });

      // Save initial metadata to MongoDB (mapping cloudinaryPublicId to s3Key)
      await MediaMetadata.create({
        mediaId,
        s3Key: body.cloudinaryPublicId,
        thumbnails: {},
        processingStatus: 'pending',
        uploadedAt: new Date(),
      });

      // Enqueue processing job
      await mediaProcessQueue.add(
        'process',
        {
          mediaId,
          cloudinaryPublicId: body.cloudinaryPublicId,
          cloudinaryUrl: body.cloudinaryUrl,
          albumId: body.albumId,
          mimeType: body.mimeType,
        },
        { jobId: `process:${mediaId}` }
      );

      return reply.code(201).send({
        ...media,
        sizeBytes: Number(media.sizeBytes),
      });
    }
  );

  // Helper to generate a cuid replacement if cuid package is not loaded
  function cuid() {
    return 'c' + Math.random().toString(36).substr(2, 9);
  }

  // ── GET /media/:id ────────────────────────────────────────────────────────
  app.get(
    '/:id',
    {
      schema: {
        tags: ['Media'],
        summary: 'Get a media item by ID with metadata',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const media = await prisma.media.findUnique({
        where: { id: request.params.id },
        include: {
          uploader: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          album: {
            select: {
              id: true,
              name: true,
              event: { select: { id: true, name: true, date: true } },
            },
          },
          tags: {
            include: {
              tag: { select: { id: true, name: true } },
              taggedUser: { select: { id: true, username: true, displayName: true } },
            },
          },
          _count: { select: { likes: true, comments: true, favorites: true } },
        },
      });

      if (!media) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Media with ID '${request.params.id}' not found.`,
        });
      }

      // Fetch MongoDB metadata
      const mongoMeta = await MediaMetadata.findOne({ mediaId: request.params.id }).lean();

      return reply.code(200).send({
        ...media,
        sizeBytes: Number(media.sizeBytes),
        metadata: mongoMeta || null,
      });
    }
  );

  // ── DELETE /media/:id ─────────────────────────────────────────────────────
  app.delete(
    '/:id',
    {
      schema: {
        tags: ['Media'],
        summary: 'Delete a media item (uploader or admin)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const media = await prisma.media.findUnique({
        where: { id: request.params.id },
      });

      if (!media) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
      }

      const isAdmin = request.user.role === 'admin';
      const isUploader = media.uploaderId === request.user.sub;

      if (!isAdmin && !isUploader) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only the uploader or an admin can delete this media.',
        });
      }

      // Delete from Cloudinary
      try {
        const type = media.mediaType === 'image' ? 'image' : 'video';
        await deleteFromCloudinary(media.s3Key, type);
      } catch (err) {
        request.log.warn({ publicId: media.s3Key, err }, 'Failed to delete Cloudinary object');
      }

      // Delete MongoDB metadata
      await MediaMetadata.deleteOne({ mediaId: media.id });

      // Delete from PostgreSQL (cascades)
      await prisma.media.delete({ where: { id: media.id } });

      return reply.code(204).send();
    }
  );

  // ── GET /media/:id/download ───────────────────────────────────────────────
  app.get(
    '/:id/download',
    {
      schema: {
        tags: ['Media'],
        summary: 'Download media with role-based watermark applied via Sharp',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            watermark: { type: 'boolean', default: true },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const media = await prisma.media.findUnique({
        where: { id: request.params.id },
        include: {
          album: {
            include: {
              event: { select: { id: true, name: true, clubId: true } },
            },
          },
        },
      });

      if (!media) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
      }

      const clCloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const clUrl = `https://res.cloudinary.com/${clCloudName}/image/upload/${media.s3Key}`;

      // Only apply watermark for images
      const applyWm = request.query.watermark !== false && media.mediaType === 'image';

      if (applyWm) {
        try {
          const watermarkedBuffer = await applyWatermark({
            imageUrl: clUrl,
            userId: request.user.sub,
            mediaId: media.id,
            userRole: request.user.role,
            eventName: media.album.event.name,
            clubId: media.album.event.clubId,
          });

          reply
            .header('Content-Type', media.mimeType)
            .header(
              'Content-Disposition',
              `attachment; filename="${media.title || media.id}.jpg"`
            )
            .header('Cache-Control', 'private, no-store');

          return reply.send(watermarkedBuffer);
        } catch (err) {
          request.log.warn({ err }, 'Watermark failed, serving original from Cloudinary');
        }
      }

      // Stream original from Cloudinary
      try {
        const response = await fetch(clUrl);
        if (!response.ok) throw new Error('Cloudinary response not ok');
        const buffer = Buffer.from(await response.arrayBuffer());

        reply
          .header('Content-Type', media.mimeType)
          .header(
            'Content-Disposition',
            `attachment; filename="${media.title || media.id}"`
          )
          .header('Cache-Control', 'private, no-store');

        return reply.send(buffer);
      } catch (err) {
        // Redirect as fallback
        return reply.redirect(clUrl);
      }
    }
  );
}
