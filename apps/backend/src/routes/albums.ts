import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/authenticate';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createAlbumSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'club_only', 'private']).default('public'),
  coverImageUrl: z.string().url().optional(),
  sharePassword: z.string().max(100).optional(),
});

const updateAlbumSchema = createAlbumSchema.partial();

const mediaQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  mediaType: z.enum(['image', 'video']).optional(),
  sort: z.enum(['newest', 'oldest', 'most_liked']).default('newest'),
});

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function albumRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /albums ──────────────────────────────────────────────────────────
  app.get(
    '/',
    {
      schema: {
        tags: ['Albums'],
        summary: 'List all public albums',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const albums = await prisma.album.findMany({
        where: { visibility: 'public' },
        include: {
          event: { select: { id: true, name: true } },
          _count: { select: { media: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return reply.code(200).send(albums);
    }
  );

  // ── POST /events/:eventId/albums ─────────────────────────────────────────
  app.post(
    '/events/:eventId/albums',
    {
      schema: {
        tags: ['Albums'],
        summary: 'Create a new album within an event',
        security: [{ BearerAuth: [] }],
        params: {
          type: 'object',
          required: ['eventId'],
          properties: { eventId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            visibility: { type: 'string' },
            coverImageUrl: { type: 'string' },
            sharePassword: { type: 'string' },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: any, reply: any) => {
      const body = createAlbumSchema.parse(request.body);

      const event = await prisma.event.findUnique({
        where: { id: request.params.eventId },
        include: {
          club: {
            include: { members: { where: { userId: request.user.sub }, take: 1 } },
          },
        },
      });

      if (!event) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Event not found.' });
      }

      const isAdmin = request.user.role === 'admin';
      const isMember = event.club.members.length > 0;

      if (!isAdmin && !isMember) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You must be a club member to create albums.',
        });
      }

      const shareCode = nanoid(10);

      const album = await prisma.album.create({
        data: {
          name: body.name,
          description: body.description,
          visibility: body.visibility,
          coverImageUrl: body.coverImageUrl,
          sharePassword: body.sharePassword,
          shareCode,
          eventId: request.params.eventId,
        },
        include: {
          event: { select: { id: true, name: true, clubId: true } },
          _count: { select: { media: true } },
        },
      });

      return reply.code(201).send(album);
    }
  );

  // ── GET /albums/:id ───────────────────────────────────────────────────────
  app.get(
    '/:id',
    {
      schema: {
        tags: ['Albums'],
        summary: 'Get a single album by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const album = await prisma.album.findUnique({
        where: { id: request.params.id },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              date: true,
              club: { select: { id: true, name: true, slug: true, logoUrl: true } },
            },
          },
          _count: { select: { media: true } },
        },
      });

      if (!album) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Album with ID '${request.params.id}' not found.`,
        });
      }

      return reply.code(200).send(album);
    }
  );

  // ── PATCH /albums/:id ─────────────────────────────────────────────────────
  app.patch(
    '/:id',
    {
      schema: {
        tags: ['Albums'],
        summary: 'Update album metadata',
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
      const body = updateAlbumSchema.parse(request.body);

      const album = await prisma.album.findUnique({
        where: { id: request.params.id },
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
      const isClubAdmin =
        album.event.club.members.length > 0 &&
        ['admin', 'photographer'].includes(album.event.club.members[0].role);

      if (!isAdmin && !isClubAdmin) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only club admins or photographers can update albums.',
        });
      }

      const updated = await prisma.album.update({
        where: { id: request.params.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.visibility !== undefined && { visibility: body.visibility }),
          ...(body.coverImageUrl !== undefined && { coverImageUrl: body.coverImageUrl }),
          ...(body.sharePassword !== undefined && { sharePassword: body.sharePassword }),
        },
      });

      return reply.code(200).send(updated);
    }
  );

  // ── DELETE /albums/:id ────────────────────────────────────────────────────
  app.delete(
    '/:id',
    {
      schema: {
        tags: ['Albums'],
        summary: 'Delete an album and all its media',
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
      const album = await prisma.album.findUnique({
        where: { id: request.params.id },
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
      const isClubAdmin =
        album.event.club.members.length > 0 &&
        album.event.club.members[0].role === 'admin';

      if (!isAdmin && !isClubAdmin) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only club admins can delete albums.',
        });
      }

      await prisma.album.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    }
  );

  // ── GET /albums/:id/media ─────────────────────────────────────────────────
  app.get(
    '/:id/media',
    {
      schema: {
        tags: ['Albums'],
        summary: 'Paginated media list for an album (cursor-based)',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'integer' },
            mediaType: { type: 'string' },
            sort: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const query = mediaQuerySchema.parse(request.query);

      const album = await prisma.album.findUnique({ where: { id: request.params.id } });
      if (!album) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
      }

      const where: any = {
        albumId: request.params.id,
        isModerationFlagged: false,
      };
      if (query.mediaType) where.mediaType = query.mediaType;
      if (query.cursor) {
        where.createdAt = { lt: new Date(query.cursor) };
      }

      const orderBy: any =
        query.sort === 'oldest'
          ? { createdAt: 'asc' }
          : query.sort === 'most_liked'
          ? { likes: { _count: 'desc' } }
          : { createdAt: 'desc' };

      const media = await prisma.media.findMany({
        where,
        take: query.limit + 1,
        orderBy,
        include: {
          uploader: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          _count: { select: { likes: true, comments: true } },
        },
      });

      const hasMore = media.length > query.limit;
      const items = hasMore ? media.slice(0, query.limit) : media;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      return reply.code(200).send({
        data: items,
        meta: {
          hasMore,
          nextCursor,
          limit: query.limit,
        },
      });
    }
  );

  // ── GET /albums/:id/qr ────────────────────────────────────────────────────
  app.get(
    '/:id/qr',
    {
      schema: {
        tags: ['Albums'],
        summary: 'Generate a QR code PNG for the album share link',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const album = await prisma.album.findUnique({
        where: { id: request.params.id },
        select: { id: true, name: true, shareCode: true },
      });

      if (!album) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const shareUrl = album.shareCode
        ? `${frontendUrl}/share/${album.shareCode}`
        : `${frontendUrl}/albums/${album.id}`;

      const qrBuffer = await QRCode.toBuffer(shareUrl, {
        type: 'png',
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      reply
        .header('Content-Type', 'image/png')
        .header('Content-Disposition', `inline; filename="album-${album.id}-qr.png"`)
        .header('Cache-Control', 'public, max-age=86400')
        .send(qrBuffer);
    }
  );
}
