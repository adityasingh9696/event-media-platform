import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middlewares/authenticate';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z
    .enum(['workshop', 'trip', 'cultural', 'party', 'competition', 'photoshoot', 'other'])
    .default('other'),
  date: z.string().datetime({ message: 'date must be an ISO datetime string' }),
  location: z.string().max(300).optional(),
  visibility: z.enum(['public', 'club_only', 'private']).default('public'),
  clubId: z.string().cuid('clubId must be a valid CUID'),
  coverImageUrl: z.string().url().optional(),
});

const updateEventSchema = createEventSchema.partial().omit({ clubId: true });

const listEventsQuerySchema = z.object({
  sort: z.enum(['name', 'date', 'category']).default('date'),
  category: z
    .enum(['workshop', 'trip', 'cultural', 'party', 'competition', 'photoshoot', 'other'])
    .optional(),
  clubId: z.string().optional(),
  visibility: z.enum(['public', 'club_only', 'private']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /events ─────────────────────────────────────────────────────────
  app.post(
    '/',
    {
      schema: {
        tags: ['Events'],
        summary: 'Create a new event (club_member+ required)',
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'date', 'clubId'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
            location: { type: 'string' },
            visibility: { type: 'string' },
            clubId: { type: 'string' },
            coverImageUrl: { type: 'string' },
          },
        },
      },
      preHandler: [authenticate, requireRole(['admin', 'photographer', 'club_member'])],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createEventSchema.parse(request.body);

      // Verify club exists and user is a member
      const club = await prisma.club.findUnique({
        where: { id: body.clubId },
        include: {
          members: { where: { userId: request.user.sub }, take: 1 },
        },
      });

      if (!club) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Club not found.' });
      }

      if (request.user.role !== 'admin' && club.members.length === 0) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You must be a member of this club to create events.',
        });
      }

      const event = await prisma.event.create({
        data: {
          name: body.name,
          description: body.description,
          category: body.category,
          date: new Date(body.date),
          location: body.location,
          visibility: body.visibility,
          clubId: body.clubId,
          coverImageUrl: body.coverImageUrl,
        },
        include: {
          club: { select: { id: true, name: true, slug: true } },
          _count: { select: { albums: true } },
        },
      });

      return reply.code(201).send(event);
    }
  );

  // ── GET /events ───────────────────────────────────────────────────────────
  app.get(
    '/',
    {
      schema: {
        tags: ['Events'],
        summary: 'List events with filtering and pagination',
        querystring: {
          type: 'object',
          properties: {
            sort: { type: 'string', enum: ['name', 'date', 'category'] },
            category: { type: 'string' },
            clubId: { type: 'string' },
            visibility: { type: 'string' },
            search: { type: 'string' },
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listEventsQuerySchema.parse(request.query);
      const skip = (query.page - 1) * query.limit;

      const where: any = {};

      // Public visibility by default for unauthenticated users
      if (query.visibility) {
        where.visibility = query.visibility;
      } else {
        where.visibility = 'public';
      }

      if (query.category) where.category = query.category;
      if (query.clubId) where.clubId = query.clubId;

      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { location: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const orderBy: any =
        query.sort === 'name'
          ? { name: 'asc' }
          : query.sort === 'category'
          ? { category: 'asc' }
          : { date: 'desc' };

      const [events, total] = await Promise.all([
        prisma.event.findMany({
          where,
          skip,
          take: query.limit,
          orderBy,
          include: {
            club: { select: { id: true, name: true, slug: true, logoUrl: true } },
            _count: { select: { albums: true } },
          },
        }),
        prisma.event.count({ where }),
      ]);

      return reply.code(200).send({
        data: events,
        meta: {
          total,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    }
  );

  // ── GET /events/:id ───────────────────────────────────────────────────────
  app.get(
    '/:id',
    {
      schema: {
        tags: ['Events'],
        summary: 'Get a single event by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const event = await prisma.event.findUnique({
        where: { id: request.params.id },
        include: {
          club: { select: { id: true, name: true, slug: true, logoUrl: true } },
          albums: {
            select: {
              id: true,
              name: true,
              description: true,
              coverImageUrl: true,
              visibility: true,
              createdAt: true,
              _count: { select: { media: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          _count: { select: { albums: true } },
        },
      });

      if (!event) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Event with ID '${request.params.id}' not found.`,
        });
      }

      return reply.code(200).send(event);
    }
  );

  // ── PATCH /events/:id ─────────────────────────────────────────────────────
  app.patch(
    '/:id',
    {
      schema: {
        tags: ['Events'],
        summary: 'Update an event (organizer or admin)',
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
      const body = updateEventSchema.parse(request.body);

      const event = await prisma.event.findUnique({
        where: { id: request.params.id },
        include: {
          club: {
            include: { members: { where: { userId: request.user.sub }, take: 1 } },
          },
        },
      });

      if (!event) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Event not found.',
        });
      }

      const isAdmin = request.user.role === 'admin';
      const isOrganizerOrAdmin =
        isAdmin ||
        (event.club.members.length > 0 &&
          ['admin', 'photographer'].includes(event.club.members[0].role));

      if (!isOrganizerOrAdmin) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only club admins or photographers can update events.',
        });
      }

      const updated = await prisma.event.update({
        where: { id: request.params.id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.category && { category: body.category }),
          ...(body.date && { date: new Date(body.date) }),
          ...(body.location !== undefined && { location: body.location }),
          ...(body.visibility && { visibility: body.visibility }),
          ...(body.coverImageUrl !== undefined && { coverImageUrl: body.coverImageUrl }),
        },
        include: {
          club: { select: { id: true, name: true, slug: true } },
        },
      });

      return reply.code(200).send(updated);
    }
  );

  // ── DELETE /events/:id ────────────────────────────────────────────────────
  app.delete(
    '/:id',
    {
      schema: {
        tags: ['Events'],
        summary: 'Delete an event (admin only)',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: [authenticate, requireRole(['admin'])],
    },
    async (request: any, reply: any) => {
      const event = await prisma.event.findUnique({ where: { id: request.params.id } });

      if (!event) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Event not found.',
        });
      }

      await prisma.event.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    }
  );

  // ── GET /events/:id/albums ────────────────────────────────────────────────
  app.get(
    '/:id/albums',
    {
      schema: {
        tags: ['Events'],
        summary: 'List all albums for an event',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const event = await prisma.event.findUnique({ where: { id: request.params.id } });

      if (!event) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Event not found.',
        });
      }

      const albums = await prisma.album.findMany({
        where: { eventId: request.params.id },
        include: {
          _count: { select: { media: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      return reply.code(200).send(albums);
    }
  );
}
