import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/authenticate';
import { uploadBuffer } from '../lib/cloudinary';
import { extractSelfieDescriptor, descriptorToString } from '../lib/faceapi';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(72).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  mediaType: z.enum(['image', 'video']).optional(),
});

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /users/me ──────────────────────────────────────────────────────────
  app.get(
    '/me',
    {
      schema: {
        tags: ['Users'],
        summary: 'Get the current user full profile',
        security: [{ BearerAuth: [] }],
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          role: true,
          faceEnrollmentEnabled: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          clubMemberships: {
            select: {
              role: true,
              joinedAt: true,
              club: { select: { id: true, name: true, slug: true, logoUrl: true } },
            },
          },
          _count: {
            select: {
              uploadedMedia: true,
              likes: true,
              favorites: true,
              taggedIn: true,
            },
          },
        },
      });

      if (!user) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });
      }

      return reply.code(200).send(user);
    }
  );

  // ── PATCH /users/me ────────────────────────────────────────────────────────
  app.patch(
    '/me',
    {
      schema: {
        tags: ['Users'],
        summary: 'Update current user profile or change password',
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            displayName: { type: 'string' },
            bio: { type: 'string' },
            avatarUrl: { type: 'string' },
            currentPassword: { type: 'string' },
            newPassword: { type: 'string' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = updateProfileSchema.parse(request.body);

      // Password change flow
      if (body.newPassword) {
        if (!body.currentPassword) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'currentPassword is required when setting a new password.',
          });
        }

        const user = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { passwordHash: true },
        });

        if (!user?.passwordHash) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Account uses OAuth authentication and does not have a password.',
          });
        }

        const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
        if (!valid) {
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Current password is incorrect.',
          });
        }

        const newHash = await bcrypt.hash(body.newPassword, 12);
        await prisma.user.update({
          where: { id: request.user.sub },
          data: { passwordHash: newHash },
        });
      }

      const updated = await prisma.user.update({
        where: { id: request.user.sub },
        data: {
          ...(body.displayName !== undefined && { displayName: body.displayName }),
          ...(body.bio !== undefined && { bio: body.bio }),
          ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
        },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          role: true,
          updatedAt: true,
        },
      });

      return reply.code(200).send(updated);
    }
  );

  // ── GET /users/me/uploads ──────────────────────────────────────────────────
  app.get(
    '/me/uploads',
    {
      schema: {
        tags: ['Users'],
        summary: "Get the current user's uploaded media with pagination",
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            mediaType: { type: 'string', enum: ['image', 'video'] },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, limit, mediaType } = paginationSchema.parse(request.query);

      const where: any = { uploaderId: request.user.sub };
      if (mediaType) where.mediaType = mediaType;

      const [uploads, total] = await Promise.all([
        prisma.media.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            album: {
              select: {
                id: true,
                name: true,
                event: { select: { id: true, name: true } },
              },
            },
            _count: { select: { likes: true, comments: true } },
          },
        }),
        prisma.media.count({ where }),
      ]);

      return reply.code(200).send({
        data: uploads.map((m) => ({ ...m, sizeBytes: Number(m.sizeBytes) })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // ── GET /users/me/my-photos ────────────────────────────────────────────────
  app.get(
    '/me/my-photos',
    {
      schema: {
        tags: ['Users'],
        summary: 'Get photos where the current user was detected via facial recognition',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, limit } = paginationSchema.parse(request.query);

      const [photoPersons, total] = await Promise.all([
        prisma.photoPerson.findMany({
          where: { userId: request.user.sub },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            media: {
              include: {
                uploader: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
                album: {
                  select: {
                    id: true,
                    name: true,
                    event: { select: { id: true, name: true } },
                  },
                },
                _count: { select: { likes: true } },
              },
            },
          },
        }),
        prisma.photoPerson.count({ where: { userId: request.user.sub } }),
      ]);

      return reply.code(200).send({
        data: photoPersons.map((pp) => ({
          confidence: pp.confidence,
          detectedAt: pp.createdAt,
          media: { ...pp.media, sizeBytes: Number(pp.media.sizeBytes) },
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // ── POST /users/me/face-enroll ─────────────────────────────────────────────
  app.post(
    '/me/face-enroll',
    {
      schema: {
        tags: ['Users'],
        summary: 'Enroll face using a selfie — uploads to Cloudinary and generates 128-d descriptor',
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          required: ['selfieBase64', 'clubId'],
          properties: {
            selfieBase64: { type: 'string', description: 'Base64-encoded image data' },
            clubId: { type: 'string' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { selfieBase64, clubId } = request.body as {
        selfieBase64: string;
        clubId: string;
      };

      if (!selfieBase64 || !clubId) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'selfieBase64 and clubId are required.',
        });
      }

      // Convert base64 to buffer
      let selfieBuffer: Buffer;
      try {
        const cleanBase64 = selfieBase64.replace(/^data:image\/\w+;base64,/, '');
        selfieBuffer = Buffer.from(cleanBase64, 'base64');
      } catch (err) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid base64 string provided.',
        });
      }

      // Upload selfie to Cloudinary
      const folder = `selfies/${clubId}`;
      const uploadResult = await uploadBuffer(selfieBuffer, folder);

      // Extract 128-d descriptor using face-api.js
      let descriptor: Float32Array | null = null;
      try {
        descriptor = await extractSelfieDescriptor(uploadResult.secure_url);
      } catch (err: any) {
        request.log.error(err, 'Failed to extract face descriptor');
      }

      if (!descriptor) {
        return reply.code(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'No face detected in the provided image. Please use a clear, well-lit selfie.',
        });
      }

      const descriptorStr = descriptorToString(descriptor);

      // Remove existing enrollment for this club if any
      const existing = await prisma.faceEmbedding.findUnique({
        where: { userId_clubId: { userId: request.user.sub, clubId } },
      });

      if (existing) {
        await prisma.faceEmbedding.delete({
          where: { userId_clubId: { userId: request.user.sub, clubId } },
        });
      }

      // Save new enrollment
      await prisma.faceEmbedding.create({
        data: {
          userId: request.user.sub,
          clubId,
          rekognitionFaceId: descriptorStr, // Store serialized Float32Array here
          selfieS3Key: uploadResult.secure_url, // Store Cloudinary secure_url here
        },
      });

      await prisma.user.update({
        where: { id: request.user.sub },
        data: { faceEnrollmentEnabled: true },
      });

      return reply.code(201).send({
        message: 'Face enrolled successfully.',
        clubId,
        imageUrl: uploadResult.secure_url,
      });
    }
  );

  // ── DELETE /users/me/face-enrollment ──────────────────────────────────────
  app.delete(
    '/me/face-enrollment',
    {
      schema: {
        tags: ['Users'],
        summary: 'Remove face enrollment from all clubs',
        security: [{ BearerAuth: [] }],
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await prisma.faceEmbedding.deleteMany({ where: { userId: request.user.sub } });
      await prisma.user.update({
        where: { id: request.user.sub },
        data: { faceEnrollmentEnabled: false },
      });

      return reply.code(200).send({ message: 'Face enrollment removed successfully.' });
    }
  );

  // ── GET /users/:id/profile ─────────────────────────────────────────────────
  app.get(
    '/:id/profile',
    {
      schema: {
        tags: ['Users'],
        summary: 'Get a public user profile by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              uploadedMedia: true,
              likes: true,
            },
          },
          clubMemberships: {
            select: {
              role: true,
              club: { select: { id: true, name: true, slug: true, logoUrl: true } },
            },
          },
        },
      });

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `User '${request.params.id}' not found.`,
        });
      }

      return reply.code(200).send(user);
    }
  );
}
