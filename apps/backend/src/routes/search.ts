import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { searchMedia, suggestMedia } from '../lib/elasticsearch';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const searchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  tags: z.string().optional(), // comma-separated
  eventId: z.string().optional(),
  albumId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  mediaType: z.enum(['image', 'video']).optional(),
  visibility: z.enum(['public', 'club_only', 'private']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const suggestQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

// ─── PostgreSQL FTS Helper ────────────────────────────────────────────────────
async function searchPostgres(params: {
  q?: string;
  tags?: string[];
  eventId?: string;
  albumId?: string;
  from?: string;
  to?: string;
  mediaType?: string;
  visibility?: string;
  page: number;
  limit: number;
}) {
  const { q, tags, eventId, albumId, from, to, mediaType, visibility, page, limit } = params;
  const skip = (page - 1) * limit;

  const where: any = { isModerationFlagged: false };

  if (visibility) {
    where.visibility = visibility;
  } else {
    where.visibility = 'public';
  }

  if (mediaType) where.mediaType = mediaType;

  if (eventId) {
    where.album = { eventId };
  } else if (albumId) {
    where.albumId = albumId;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { tags: { some: { tag: { name: { contains: q, mode: 'insensitive' } } } } },
      { album: { name: { contains: q, mode: 'insensitive' } } },
      { album: { event: { name: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  if (tags && tags.length > 0) {
    where.tags = { some: { tag: { name: { in: tags } } } };
  }

  const [media, total] = await Promise.all([
    prisma.media.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        album: {
          select: {
            id: true,
            name: true,
            event: { select: { id: true, name: true } },
          },
        },
        tags: {
          include: { tag: { select: { id: true, name: true } } },
        },
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.media.count({ where }),
  ]);

  return {
    data: media.map((m) => ({ ...m, sizeBytes: Number(m.sizeBytes) })),
    total,
    source: 'postgresql' as const,
  };
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /search ───────────────────────────────────────────────────────────
  app.get(
    '/',
    {
      schema: {
        tags: ['Search'],
        summary: 'Full-text search across media (uses Elasticsearch if available, else PostgreSQL FTS)',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            tags: { type: 'string', description: 'Comma-separated tag names' },
            eventId: { type: 'string' },
            albumId: { type: 'string' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            mediaType: { type: 'string', enum: ['image', 'video'] },
            visibility: { type: 'string' },
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
              source: { type: 'string', enum: ['elasticsearch', 'postgresql'] },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = searchQuerySchema.parse(request.query);
      const tags = query.tags ? query.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

      // Try Elasticsearch first
      const esResult = await searchMedia({
        q: query.q,
        tags,
        from: query.from,
        to: query.to,
        visibility: query.visibility || 'public',
        page: query.page,
        limit: query.limit,
      });

      if (esResult) {
        // Elasticsearch hit — enrich with Prisma data
        const mediaIds = esResult.hits.map((h: any) => h.id).filter(Boolean);

        let enriched: any[] = esResult.hits;

        if (mediaIds.length > 0) {
          const dbRecords = await prisma.media.findMany({
            where: { id: { in: mediaIds } },
            include: {
              uploader: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              album: {
                select: {
                  id: true,
                  name: true,
                  event: { select: { id: true, name: true } },
                },
              },
              _count: { select: { likes: true, comments: true } },
            },
          });

          // Preserve ES score order
          const dbMap = new Map(dbRecords.map((r) => [r.id, r]));
          enriched = mediaIds
            .map((id) => {
              const db = dbMap.get(id);
              if (!db) return null;
              return { ...db, sizeBytes: Number(db.sizeBytes) };
            })
            .filter(Boolean);
        }

        return reply.code(200).send({
          data: enriched,
          meta: {
            total: esResult.total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(esResult.total / query.limit),
          },
          source: 'elasticsearch',
        });
      }

      // Fall back to PostgreSQL FTS
      const pgResult = await searchPostgres({
        q: query.q,
        tags,
        eventId: query.eventId,
        albumId: query.albumId,
        from: query.from,
        to: query.to,
        mediaType: query.mediaType,
        visibility: query.visibility,
        page: query.page,
        limit: query.limit,
      });

      return reply.code(200).send({
        data: pgResult.data,
        meta: {
          total: pgResult.total,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(pgResult.total / query.limit),
        },
        source: pgResult.source,
      });
    }
  );

  // ── GET /search/suggest ───────────────────────────────────────────────────
  app.get(
    '/suggest',
    {
      schema: {
        tags: ['Search'],
        summary: 'Autocomplete suggestions for search query',
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string' },
            limit: { type: 'integer' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              suggestions: { type: 'array', items: { type: 'string' } },
              source: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { q, limit } = suggestQuerySchema.parse(request.query);

      // Try Elasticsearch suggestions
      const esSuggestions = await suggestMedia(q);
      if (esSuggestions.length > 0) {
        return reply.code(200).send({
          suggestions: esSuggestions.slice(0, limit),
          source: 'elasticsearch',
        });
      }

      // PostgreSQL fallback — query distinct tag names, event names, album names
      const [tags, events, albums] = await Promise.all([
        prisma.tag.findMany({
          where: { name: { contains: q, mode: 'insensitive' } },
          take: limit,
          select: { name: true },
          orderBy: { name: 'asc' },
        }),
        prisma.event.findMany({
          where: {
            name: { contains: q, mode: 'insensitive' },
            visibility: 'public',
          },
          take: 5,
          select: { name: true },
        }),
        prisma.album.findMany({
          where: {
            name: { contains: q, mode: 'insensitive' },
            visibility: 'public',
          },
          take: 5,
          select: { name: true },
        }),
      ]);

      const suggestions = [
        ...tags.map((t) => t.name),
        ...events.map((e) => e.name),
        ...albums.map((a) => a.name),
      ]
        .filter((v, i, arr) => arr.indexOf(v) === i) // unique
        .slice(0, limit);

      return reply.code(200).send({ suggestions, source: 'postgresql' });
    }
  );
}
