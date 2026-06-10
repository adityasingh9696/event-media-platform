import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { authenticate } from '../middlewares/authenticate';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, _ and -'),
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(60, 'Display name must be at most 60 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── Token Helpers ────────────────────────────────────────────────────────────

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_SECS = 60 * 60 * 24 * 7; // 7 days

function generateAccessToken(payload: {
  sub: string;
  email: string;
  username: string;
  role: string;
}): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET not configured');
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL });
}

function generateRefreshToken(payload: {
  sub: string;
  tokenId: string;
}): string {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

function getRefreshKey(userId: string, tokenId: string): string {
  return `refresh:${userId}:${tokenId}`;
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /auth/register ──────────────────────────────────────────────────
  app.post(
    '/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user account',
        body: {
          type: 'object',
          required: ['email', 'username', 'displayName', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            username: { type: 'string', minLength: 3, maxLength: 30 },
            displayName: { type: 'string', minLength: 1, maxLength: 60 },
            password: { type: 'string', minLength: 8 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              user: { type: 'object' },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = registerSchema.parse(request.body);

      const [emailExists, usernameExists] = await Promise.all([
        prisma.user.findUnique({ where: { email: body.email } }),
        prisma.user.findUnique({ where: { username: body.username } }),
      ]);

      if (emailExists) {
        return reply.code(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'An account with this email already exists.',
        });
      }

      if (usernameExists) {
        return reply.code(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'This username is already taken.',
        });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);

      const user = await prisma.user.create({
        data: {
          email: body.email,
          username: body.username,
          displayName: body.displayName,
          passwordHash,
          role: 'viewer',
        },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      const tokenId = nanoid(32);
      const accessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      });
      const refreshToken = generateRefreshToken({ sub: user.id, tokenId });

      // Store refresh token in Redis with 7d TTL
      await redis.setex(
        getRefreshKey(user.id, tokenId),
        REFRESH_TOKEN_TTL_SECS,
        refreshToken
      );

      return reply.code(201).send({ user, accessToken, refreshToken });
    }
  );

  // ── POST /auth/login ─────────────────────────────────────────────────────
  app.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: { type: 'object' },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email: body.email },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          avatarUrl: true,
          passwordHash: true,
          isActive: true,
          createdAt: true,
        },
      });

      if (!user || !user.passwordHash) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password.',
        });
      }

      if (!user.isActive) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Your account has been deactivated. Contact support.',
        });
      }

      const passwordValid = await bcrypt.compare(body.password, user.passwordHash);
      if (!passwordValid) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password.',
        });
      }

      const tokenId = nanoid(32);
      const accessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      });
      const refreshToken = generateRefreshToken({ sub: user.id, tokenId });

      await redis.setex(
        getRefreshKey(user.id, tokenId),
        REFRESH_TOKEN_TTL_SECS,
        refreshToken
      );

      // Remove sensitive fields
      const { passwordHash: _, ...safeUser } = user;

      return reply.code(200).send({ user: safeUser, accessToken, refreshToken });
    }
  );

  // ── POST /auth/refresh ───────────────────────────────────────────────────
  app.post(
    '/refresh',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Rotate refresh token and issue new access token',
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { refreshToken } = refreshSchema.parse(request.body);

      const refreshSecret =
        process.env.JWT_REFRESH_SECRET || process.env.JWT_ACCESS_SECRET;
      if (!refreshSecret) {
        return reply.code(500).send({ message: 'Server configuration error' });
      }

      let payload: { sub: string; tokenId: string };
      try {
        payload = jwt.verify(refreshToken, refreshSecret) as {
          sub: string;
          tokenId: string;
        };
      } catch {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or expired refresh token.',
        });
      }

      const redisKey = getRefreshKey(payload.sub, payload.tokenId);
      const storedToken = await redis.get(redisKey);

      if (!storedToken || storedToken !== refreshToken) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Refresh token has been revoked or does not exist.',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        await redis.del(redisKey);
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User not found or deactivated.',
        });
      }

      // Rotate: delete old, create new
      await redis.del(redisKey);

      const newTokenId = nanoid(32);
      const newAccessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      });
      const newRefreshToken = generateRefreshToken({
        sub: user.id,
        tokenId: newTokenId,
      });

      await redis.setex(
        getRefreshKey(user.id, newTokenId),
        REFRESH_TOKEN_TTL_SECS,
        newRefreshToken
      );

      return reply.code(200).send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    }
  );

  // ── POST /auth/logout ────────────────────────────────────────────────────
  app.post(
    '/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Logout by revoking the refresh token',
        security: [{ BearerAuth: [] }],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { refreshToken } = refreshSchema.parse(request.body);

      const refreshSecret =
        process.env.JWT_REFRESH_SECRET || process.env.JWT_ACCESS_SECRET;

      try {
        if (refreshSecret) {
          const payload = jwt.verify(refreshToken, refreshSecret) as {
            sub: string;
            tokenId: string;
          };
          await redis.del(getRefreshKey(payload.sub, payload.tokenId));
        }
      } catch {
        // Token might be expired but we still clear it gracefully
      }

      return reply.code(200).send({ message: 'Logged out successfully.' });
    }
  );

  // ── GET /auth/me ─────────────────────────────────────────────────────────
  app.get(
    '/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get current authenticated user profile',
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              username: { type: 'string' },
              displayName: { type: 'string' },
              role: { type: 'string' },
              avatarUrl: { type: 'string', nullable: true },
              bio: { type: 'string', nullable: true },
              faceEnrollmentEnabled: { type: 'boolean' },
              createdAt: { type: 'string' },
            },
          },
        },
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
          role: true,
          avatarUrl: true,
          bio: true,
          faceEnrollmentEnabled: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
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
          message: 'User not found.',
        });
      }

      return reply.code(200).send(user);
    }
  );

  // ── GET /auth/google ─────────────────────────────────────────────────────
  app.get('/google', async (request: FastifyRequest, reply: FastifyReply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback';

    if (!clientId) {
      return reply.code(500).send({ message: 'Google Client ID not configured.' });
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'email profile');
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');

    return reply.redirect(authUrl.toString());
  });

  // ── GET /auth/google/callback ────────────────────────────────────────────
  app.get('/google/callback', async (request: FastifyRequest<{ Querystring: { code?: string, error?: string } }>, reply: FastifyReply) => {
    const { code, error } = request.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error || !code) {
      return reply.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback';

    if (!clientId || !clientSecret) {
      return reply.code(500).send({ message: 'Google Credentials not configured.' });
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange token');
      }

      // Fetch user profile
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const profile = await userResponse.json();

      if (!profile.email) {
        return reply.redirect(`${frontendUrl}/login?error=no_email`);
      }

      const email = profile.email;

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
          isActive: true,
        },
      });

      if (!user) {
        const username = `user_${profile.id.substring(0, 8)}`;
        user = await prisma.user.create({
          data: {
            email,
            username,
            displayName: profile.name || 'Google User',
            avatarUrl: profile.picture || null,
            role: 'viewer',
            isActive: true,
          },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            role: true,
            avatarUrl: true,
            createdAt: true,
            isActive: true,
          },
        });
      } else if (!user.isActive) {
        return reply.redirect(`${frontendUrl}/login?error=account_deactivated`);
      } else if (!user.avatarUrl && profile.picture) {
          // Update avatar if they didn't have one
          await prisma.user.update({
              where: { email },
              data: { avatarUrl: profile.picture }
          });
      }

      const tokenId = nanoid(32);
      const accessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      });
      const refreshToken = generateRefreshToken({ sub: user.id, tokenId });

      // Store refresh token in Redis
      await redis.setex(
        getRefreshKey(user.id, tokenId),
        REFRESH_TOKEN_TTL_SECS,
        refreshToken
      );

      const redirectUrl = `${frontendUrl}/login?token=${accessToken}&refreshToken=${refreshToken}`;
      return reply.redirect(redirectUrl);
    } catch (err) {
      console.error('Google OAuth Error:', err);
      return reply.redirect(`${frontendUrl}/login?error=oauth_internal_error`);
    }
  });
}
