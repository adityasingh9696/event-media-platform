import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/authenticate';
import { createNotification } from '../services/notification';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const commentSchema = z.object({
  text: z.string().min(1, 'Comment text is required').max(2000),
  parentId: z.string().cuid().optional(),
});

const tagUserSchema = z.object({
  taggedUserId: z.string().cuid('Invalid user ID'),
  xPos: z.number().min(0).max(1, 'xPos must be 0-1'),
  yPos: z.number().min(0).max(1, 'yPos must be 0-1'),
});

const shareSchema = z.object({
  expiresIn: z.number().int().positive().optional(), // seconds
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function socialRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /media/:id/like (toggle) ─────────────────────────────────────────
  app.post(
    '/media/:id/like',
    {
      schema: {
        tags: ['Social'],
        summary: 'Toggle like on a media item',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              liked: { type: 'boolean' },
              likeCount: { type: 'integer' },
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const { id: mediaId } = request.params;
      const userId = request.user.sub;

      const media = await prisma.media.findUnique({
        where: { id: mediaId },
        select: { id: true, uploaderId: true, title: true },
      });
      if (!media) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
      }

      const existingLike = await prisma.like.findUnique({
        where: { mediaId_userId: { mediaId, userId } },
      });

      let liked: boolean;
      if (existingLike) {
        await prisma.like.delete({ where: { mediaId_userId: { mediaId, userId } } });
        liked = false;
      } else {
        await prisma.like.create({ data: { mediaId, userId } });
        liked = true;

        // Notify media owner
        if (media.uploaderId !== userId) {
          await createNotification({
            type: 'media_liked',
            recipientId: media.uploaderId,
            senderId: userId,
            message: `liked your photo${media.title ? ` "${media.title}"` : ''}`,
            metadata: { mediaId },
          });
        }
      }

      const likeCount = await prisma.like.count({ where: { mediaId } });
      return reply.code(200).send({ liked, likeCount });
    }
  );

  // ── GET /media/:id/likes ──────────────────────────────────────────────────
  app.get(
    '/media/:id/likes',
    {
      schema: {
        tags: ['Social'],
        summary: 'Get users who liked a media item',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    async (request: any, reply: any) => {
      const { page, limit } = paginationSchema.parse(request.query);

      const [likes, total] = await Promise.all([
        prisma.like.findMany({
          where: { mediaId: request.params.id },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        }),
        prisma.like.count({ where: { mediaId: request.params.id } }),
      ]);

      return reply.code(200).send({
        data: likes.map((l) => ({ ...l.user, likedAt: l.createdAt })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // ── POST /media/:id/comments ──────────────────────────────────────────────
  app.post(
    '/media/:id/comments',
    {
      schema: {
        tags: ['Social'],
        summary: 'Post a comment (supports threaded replies via parentId)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string', maxLength: 2000 },
            parentId: { type: 'string' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const { id: mediaId } = request.params;
      const { text, parentId } = commentSchema.parse(request.body);

      const media = await prisma.media.findUnique({
        where: { id: mediaId },
        select: { id: true, uploaderId: true, title: true },
      });
      if (!media) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
      }

      if (parentId) {
        const parent = await prisma.comment.findUnique({ where: { id: parentId } });
        if (!parent || parent.mediaId !== mediaId) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Parent comment not found on this media.',
          });
        }
      }

      const comment = await prisma.comment.create({
        data: { text, mediaId, userId: request.user.sub, parentId },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          replies: {
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            },
          },
        },
      });

      // Notify media owner
      if (media.uploaderId !== request.user.sub) {
        await createNotification({
          type: 'media_commented',
          recipientId: media.uploaderId,
          senderId: request.user.sub,
          message: `commented on your photo${media.title ? ` "${media.title}"` : ''}: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`,
          metadata: { mediaId, commentId: comment.id },
        });
      }

      return reply.code(201).send(comment);
    }
  );

  // ── GET /media/:id/comments ───────────────────────────────────────────────
  app.get(
    '/media/:id/comments',
    {
      schema: {
        tags: ['Social'],
        summary: 'Get paginated threaded comments for a media item',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    async (request: any, reply: any) => {
      const { page, limit } = paginationSchema.parse(request.query);

      const [comments, total] = await Promise.all([
        prisma.comment.findMany({
          where: { mediaId: request.params.id, parentId: null }, // Top-level only
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            replies: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              },
            },
          },
        }),
        prisma.comment.count({ where: { mediaId: request.params.id, parentId: null } }),
      ]);

      return reply.code(200).send({
        data: comments,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // ── DELETE /media/:id/comments/:commentId ─────────────────────────────────
  app.delete(
    '/media/:id/comments/:commentId',
    {
      schema: {
        tags: ['Social'],
        summary: 'Delete a comment (author or admin)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'commentId'],
          properties: {
            id: { type: 'string' },
            commentId: { type: 'string' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const comment = await prisma.comment.findUnique({
        where: { id: request.params.commentId },
      });

      if (!comment || comment.mediaId !== request.params.id) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Comment not found.' });
      }

      const isAdmin = request.user.role === 'admin';
      const isAuthor = comment.userId === request.user.sub;

      if (!isAdmin && !isAuthor) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only the comment author or an admin can delete this comment.',
        });
      }

      await prisma.comment.delete({ where: { id: comment.id } });
      return reply.code(204).send();
    }
  );

  // ── POST /media/:id/favorite (toggle) ─────────────────────────────────────
  app.post(
    '/media/:id/favorite',
    {
      schema: {
        tags: ['Social'],
        summary: 'Toggle favorite on a media item',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              favorited: { type: 'boolean' },
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const { id: mediaId } = request.params;
      const userId = request.user.sub;

      const media = await prisma.media.findUnique({ where: { id: mediaId }, select: { id: true } });
      if (!media) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
      }

      const existing = await prisma.favorite.findUnique({
        where: { mediaId_userId: { mediaId, userId } },
      });

      let favorited: boolean;
      if (existing) {
        await prisma.favorite.delete({ where: { mediaId_userId: { mediaId, userId } } });
        favorited = false;
      } else {
        await prisma.favorite.create({ data: { mediaId, userId } });
        favorited = true;
      }

      return reply.code(200).send({ favorited });
    }
  );

  // ── GET /users/me/favorites ───────────────────────────────────────────────
  app.get(
    '/users/me/favorites',
    {
      schema: {
        tags: ['Social'],
        summary: "Get the current user's favorite media items",
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

      const [favorites, total] = await Promise.all([
        prisma.favorite.findMany({
          where: { userId: request.user.sub },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            media: {
              include: {
                uploader: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
                _count: { select: { likes: true, comments: true } },
              },
            },
          },
        }),
        prisma.favorite.count({ where: { userId: request.user.sub } }),
      ]);

      return reply.code(200).send({
        data: favorites.map((f) => ({
          ...f.media,
          sizeBytes: Number(f.media.sizeBytes),
          savedAt: f.createdAt,
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // ── POST /media/:id/tags ──────────────────────────────────────────────────
  app.post(
    '/media/:id/tags',
    {
      schema: {
        tags: ['Social'],
        summary: 'Tag a user in a media item at a specific position',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['taggedUserId', 'xPos', 'yPos'],
          properties: {
            taggedUserId: { type: 'string' },
            xPos: { type: 'number', minimum: 0, maximum: 1 },
            yPos: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const { id: mediaId } = request.params;
      const { taggedUserId, xPos, yPos } = tagUserSchema.parse(request.body);

      const [media, taggedUser] = await Promise.all([
        prisma.media.findUnique({ where: { id: mediaId }, select: { id: true } }),
        prisma.user.findUnique({ where: { id: taggedUserId }, select: { id: true, displayName: true } }),
      ]);

      if (!media) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
      if (!taggedUser) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'User to tag not found.' });

      const tag = await prisma.mediaTag.create({
        data: {
          mediaId,
          taggedUserId,
          taggedById: request.user.sub,
          xPos,
          yPos,
          source: 'manual',
        },
        include: {
          taggedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          tagger: { select: { id: true, username: true, displayName: true } },
        },
      });

      // Notify tagged user
      if (taggedUserId !== request.user.sub) {
        await createNotification({
          type: 'media_tagged',
          recipientId: taggedUserId,
          senderId: request.user.sub,
          message: `tagged you in a photo`,
          metadata: { mediaId },
        });
      }

      return reply.code(201).send(tag);
    }
  );

  // ── GET /users/me/tagged ──────────────────────────────────────────────────
  app.get(
    '/users/me/tagged',
    {
      schema: {
        tags: ['Social'],
        summary: 'Get all media where the current user is tagged',
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

      const [tags, total] = await Promise.all([
        prisma.mediaTag.findMany({
          where: { taggedUserId: request.user.sub },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            media: {
              include: {
                uploader: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
                album: { select: { id: true, name: true, event: { select: { id: true, name: true } } } },
                _count: { select: { likes: true } },
              },
            },
          },
        }),
        prisma.mediaTag.count({ where: { taggedUserId: request.user.sub } }),
      ]);

      return reply.code(200).send({
        data: tags.map((t) => ({
          tagId: t.id,
          xPos: t.xPos,
          yPos: t.yPos,
          taggedAt: t.createdAt,
          media: { ...t.media, sizeBytes: Number(t.media.sizeBytes) },
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // ── POST /media/:id/share ─────────────────────────────────────────────────
  app.post(
    '/media/:id/share',
    {
      schema: {
        tags: ['Social'],
        summary: 'Create a shareable short link for a media item',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            expiresIn: { type: 'integer', description: 'Expiry in seconds from now' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              shortCode: { type: 'string' },
              shareUrl: { type: 'string' },
              expiresAt: { type: 'string', nullable: true },
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const { id: mediaId } = request.params;
      const { expiresIn } = shareSchema.parse(request.body ?? {});

      const media = await prisma.media.findUnique({ where: { id: mediaId }, select: { id: true } });
      if (!media) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
      }

      const shortCode = nanoid(10);
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

      const share = await prisma.share.create({
        data: {
          mediaId,
          userId: request.user.sub,
          shortCode,
          expiresAt,
        },
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const shareUrl = `${frontendUrl}/s/${share.shortCode}`;

      return reply.code(201).send({ shortCode: share.shortCode, shareUrl, expiresAt });
    }
  );
}
