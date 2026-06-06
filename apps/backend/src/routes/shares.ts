import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma';

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /share/:shortCode ─────────────────────────────────────────────────
  app.get(
    '/:shortCode',
    {
      schema: {
        tags: ['Shares'],
        summary: 'Resolve a share short code, increment view count, and return media info',
        params: {
          type: 'object',
          required: ['shortCode'],
          properties: { shortCode: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              media: { type: 'object' },
              share: { type: 'object' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { shortCode: string } }>,
      reply: FastifyReply
    ) => {
      const { shortCode } = request.params;

      const share = await prisma.share.findUnique({
        where: { shortCode },
        include: {
          media: {
            include: {
              uploader: {
                select: { id: true, username: true, displayName: true, avatarUrl: true },
              },
              album: {
                select: {
                  id: true,
                  name: true,
                  event: {
                    select: { id: true, name: true, date: true },
                  },
                },
              },
              _count: { select: { likes: true, comments: true } },
            },
          },
        },
      });

      if (!share) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Share link '${shortCode}' does not exist.`,
        });
      }

      // Check expiry
      if (share.expiresAt && share.expiresAt < new Date()) {
        return reply.code(410).send({
          statusCode: 410,
          error: 'Gone',
          message: 'This share link has expired.',
        });
      }

      // Increment view count (fire-and-forget)
      prisma.share
        .update({
          where: { id: share.id },
          data: { viewCount: { increment: 1 } },
        })
        .catch((err) => {
          request.log.warn({ err }, 'Failed to increment share viewCount');
        });

      // Check if client wants a redirect
      const acceptHeader = request.headers.accept || '';
      const wantsHtml = acceptHeader.includes('text/html');

      if (wantsHtml) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return reply.redirect(`${frontendUrl}/media/${share.mediaId}?ref=share&code=${shortCode}`);
      }

      return reply.code(200).send({
        media: {
          ...share.media,
          sizeBytes: Number(share.media.sizeBytes),
        },
        share: {
          id: share.id,
          shortCode: share.shortCode,
          viewCount: share.viewCount + 1,
          expiresAt: share.expiresAt,
          createdAt: share.createdAt,
        },
      });
    }
  );
}
