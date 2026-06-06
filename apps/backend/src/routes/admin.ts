import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getQueueStats } from '../lib/queue';
import { authenticate, requireRole } from '../middlewares/authenticate';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateUserRoleSchema = z.object({
  role: z.enum(['admin', 'photographer', 'club_member', 'viewer']),
});

const updateWatermarkSchema = z.object({
  includeClubName: z.boolean().optional(),
  includeEventName: z.boolean().optional(),
  includeUserRole: z.boolean().optional(),
  includeTimestamp: z.boolean().optional(),
  memberOpacity: z.number().min(0).max(1).optional(),
  adminOpacity: z.number().min(0).max(1).optional(),
  memberDiagonal: z.boolean().optional(),
  adminDiagonal: z.boolean().optional(),
  position: z.enum(['southeast', 'center']).optional(),
});

const moderationSchema = z.object({
  approved: z.boolean(),
});

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Guard all admin routes with authentication and requireRole('admin')
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole(['admin']));

  // ── GET /admin/analytics ───────────────────────────────────────────────────
  app.get(
    '/analytics',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Get platform analytics overview',
        security: [{ BearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [totalUsers, totalEvents, totalMedia, totalClubs] = await Promise.all([
        prisma.user.count(),
        prisma.event.count(),
        prisma.media.count(),
        prisma.club.count(),
      ]);

      // Get last 30 days uploads
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const uploads = await prisma.media.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      });

      // Group uploads per day
      const uploadsMap: Record<string, number> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        uploadsMap[dayStr] = 0;
      }

      for (const upload of uploads) {
        const dayStr = upload.createdAt.toISOString().split('T')[0];
        if (uploadsMap[dayStr] !== undefined) {
          uploadsMap[dayStr]++;
        }
      }

      const uploadsPerDay = Object.entries(uploadsMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Get top events by media count
      const events = await prisma.event.findMany({
        select: {
          id: true,
          name: true,
          albums: {
            select: {
              _count: { select: { media: true } },
            },
          },
        },
      });

      const topEvents = events
        .map((e) => ({
          id: e.id,
          name: e.name,
          mediaCount: e.albums.reduce((sum, alb) => sum + alb._count.media, 0),
        }))
        .sort((a, b) => b.mediaCount - a.mediaCount)
        .slice(0, 5);

      // Get top tags by usage
      const tags = await prisma.tag.findMany({
        take: 10,
        select: {
          id: true,
          name: true,
          _count: { select: { media: true } },
        },
        orderBy: {
          media: { _count: 'desc' },
        },
      });

      const topTags = tags.map((t) => ({
        id: t.id,
        name: t.name,
        count: t._count.media,
      }));

      return reply.code(200).send({
        counts: {
          users: totalUsers,
          events: totalEvents,
          media: totalMedia,
          clubs: totalClubs,
        },
        uploadsPerDay,
        topEvents,
        topTags,
      });
    }
  );

  // ── GET /admin/users ───────────────────────────────────────────────────────
  app.get(
    '/users',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Manage user profiles and roles',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, limit } = userQuerySchema.parse(request.query);

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        }),
        prisma.user.count(),
      ]);

      return reply.code(200).send({
        data: users,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // ── PATCH /admin/users/:id ─────────────────────────────────────────────────
  app.patch(
    '/users/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Change a users role',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['role'],
          properties: {
            role: { type: 'string', enum: ['admin', 'photographer', 'club_member', 'viewer'] },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const body = updateUserRoleSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: request.params.id },
      });

      if (!user) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { role: body.role },
        select: { id: true, email: true, role: true },
      });

      return reply.code(200).send(updated);
    }
  );

  // ── GET /admin/clubs ───────────────────────────────────────────────────────
  app.get(
    '/clubs',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Get all clubs for administration',
        security: [{ BearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const clubs = await prisma.club.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { members: true, events: true } },
        },
      });

      return reply.code(200).send(clubs);
    }
  );

  // ── GET /admin/watermark/:clubId ──────────────────────────────────────────
  app.get(
    '/watermark/:clubId',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Get club watermark configuration',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['clubId'],
          properties: { clubId: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { clubId: string } }>, reply: FastifyReply) => {
      let config = await prisma.watermarkConfig.findUnique({
        where: { clubId: request.params.clubId },
      });

      if (!config) {
        config = await prisma.watermarkConfig.create({
          data: { clubId: request.params.clubId },
        });
      }

      return reply.code(200).send(config);
    }
  );

  // ── PUT /admin/watermark/:clubId ──────────────────────────────────────────
  app.put(
    '/watermark/:clubId',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Update club watermark configuration',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['clubId'],
          properties: { clubId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            includeClubName: { type: 'boolean' },
            includeEventName: { type: 'boolean' },
            includeUserRole: { type: 'boolean' },
            includeTimestamp: { type: 'boolean' },
            memberOpacity: { type: 'number', minimum: 0, maximum: 1 },
            adminOpacity: { type: 'number', minimum: 0, maximum: 1 },
            memberDiagonal: { type: 'boolean' },
            adminDiagonal: { type: 'boolean' },
            position: { type: 'string', enum: ['southeast', 'center'] },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { clubId: string } }>, reply: FastifyReply) => {
      const body = updateWatermarkSchema.parse(request.body);

      const config = await prisma.watermarkConfig.upsert({
        where: { clubId: request.params.clubId },
        update: body,
        create: {
          clubId: request.params.clubId,
          ...body,
        },
      });

      return reply.code(200).send(config);
    }
  );

  // ── GET /admin/queues ──────────────────────────────────────────────────────
  app.get(
    '/queues',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Get BullMQ queue statuses',
        security: [{ BearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stats = await getQueueStats();
      return reply.code(200).send(stats);
    }
  );

  // ── GET /admin/flagged ─────────────────────────────────────────────────────
  app.get(
    '/flagged',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Get moderation-flagged media items',
        security: [{ BearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const media = await prisma.media.findMany({
        where: { isModerationFlagged: true },
        include: {
          uploader: { select: { id: true, username: true, displayName: true } },
          album: {
            select: {
              id: true,
              name: true,
              event: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      return reply.code(200).send(media.map((m) => ({ ...m, sizeBytes: Number(m.sizeBytes) })));
    }
  );

  // ── PATCH /admin/flagged/:id ───────────────────────────────────────────────
  app.patch(
    '/flagged/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Resolve flagged moderation items (approve or remove)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['approved'],
          properties: { approved: { type: 'boolean', description: 'True to unflag, false to delete' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { approved } = moderationSchema.parse(request.body);

      const media = await prisma.media.findUnique({
        where: { id: request.params.id },
      });

      if (!media) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
      }

      if (approved) {
        // Unflag/Approve
        const updated = await prisma.media.update({
          where: { id: media.id },
          data: { isModerationFlagged: false },
        });
        return reply.code(200).send({ message: 'Media approved and unflagged.', data: { ...updated, sizeBytes: Number(updated.sizeBytes) } });
      } else {
        // Delete completely
        await prisma.media.delete({
          where: { id: media.id },
        });
        return reply.code(200).send({ message: 'Moderation review complete. Media deleted.' });
      }
    }
  );
}
