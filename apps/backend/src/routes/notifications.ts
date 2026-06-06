import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/authenticate';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  unread: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /notifications ────────────────────────────────────────────────────
  app.get(
    '/',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'List notifications for the authenticated user',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            unread: { type: 'boolean', description: 'Filter to unread notifications only' },
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: { type: 'object' } },
              meta: { type: 'object' },
              unreadCount: { type: 'integer' },
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { unread, page, limit } = listQuerySchema.parse(request.query);
      const userId = request.user.sub;
      const skip = (page - 1) * limit;

      const where: any = { recipientId: userId };
      if (unread) where.isRead = false;

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { recipientId: userId, isRead: false } }),
      ]);

      return reply.code(200).send({
        data: notifications,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        unreadCount,
      });
    }
  );

  // ── PATCH /notifications/:id/read ─────────────────────────────────────────
  app.patch(
    '/:id/read',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Mark a single notification as read',
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
              id: { type: 'string' },
              isRead: { type: 'boolean' },
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const notification = await prisma.notification.findUnique({
        where: { id: request.params.id },
      });

      if (!notification) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Notification not found.',
        });
      }

      if (notification.recipientId !== request.user.sub) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You can only mark your own notifications as read.',
        });
      }

      const updated = await prisma.notification.update({
        where: { id: request.params.id },
        data: { isRead: true },
        select: { id: true, isRead: true, type: true, message: true },
      });

      return reply.code(200).send(updated);
    }
  );

  // ── PATCH /notifications/read-all ─────────────────────────────────────────
  app.patch(
    '/read-all',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read for the authenticated user',
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              updatedCount: { type: 'integer' },
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await prisma.notification.updateMany({
        where: { recipientId: request.user.sub, isRead: false },
        data: { isRead: true },
      });

      return reply.code(200).send({ updatedCount: result.count });
    }
  );
}
