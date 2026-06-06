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
    reply.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sign in - Google Accounts</title>
        <style>
          body {
            background-color: #0a0a0f;
            color: #f0f0ff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 1rem;
          }
          .card {
            background-color: #111118;
            border: 1px solid #1e1e2e;
            border-radius: 24px;
            width: 100%;
            max-width: 380px;
            padding: 2.5rem;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6);
            text-align: center;
            position: relative;
            overflow: hidden;
          }
          .card::before {
            content: '';
            position: absolute;
            top: -60px;
            left: -60px;
            width: 160px;
            height: 160px;
            background: rgba(99, 102, 241, 0.08);
            border-radius: 50%;
            filter: blur(50px);
            z-index: 1;
          }
          .card::after {
            content: '';
            position: absolute;
            bottom: -60px;
            right: -60px;
            width: 160px;
            height: 160px;
            background: rgba(139, 92, 246, 0.08);
            border-radius: 50%;
            filter: blur(50px);
            z-index: 1;
          }
          .content {
            position: relative;
            z-index: 2;
          }
          .logo {
            width: 48px;
            height: 48px;
            margin: 0 auto 1.5rem;
          }
          h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0 0 0.5rem;
            letter-spacing: -0.025em;
          }
          p {
            color: #9ca3af;
            font-size: 0.875rem;
            margin: 0 0 2rem;
            line-height: 1.4;
          }
          .app-name {
            color: #818cf8;
            font-weight: 600;
          }
          .account-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            text-align: left;
          }
          .account-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            border-radius: 16px;
            background-color: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            text-decoration: none;
            color: inherit;
            transition: all 0.2s ease-in-out;
          }
          .account-item:hover {
            background-color: rgba(255, 255, 255, 0.08);
            border-color: rgba(99, 102, 241, 0.3);
            transform: translateY(-2px);
          }
          .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 1.125rem;
          }
          .avatar.admin {
            background-color: rgba(99, 102, 241, 0.2);
            color: #818cf8;
          }
          .avatar.photo {
            background-color: rgba(139, 92, 246, 0.2);
            color: #a78bfa;
          }
          .avatar.member {
            background-color: rgba(16, 185, 129, 0.2);
            color: #34d399;
          }
          .details {
            flex: 1;
            overflow: hidden;
          }
          .name {
            font-size: 0.875rem;
            font-weight: 500;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .email {
            font-size: 0.75rem;
            color: #9ca3af;
            margin: 2px 0 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .badge {
            font-size: 0.75rem;
            font-weight: 500;
            padding: 4px 10px;
            border-radius: 9999px;
          }
          .badge.admin {
            background-color: rgba(99, 102, 241, 0.1);
            color: #818cf8;
          }
          .badge.photo {
            background-color: rgba(139, 92, 246, 0.1);
            color: #a78bfa;
          }
          .badge.member {
            background-color: rgba(16, 185, 129, 0.1);
            color: #34d399;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 0.75rem;
            color: #4b5563;
          }
          .footer-links {
            display: flex;
            gap: 0.75rem;
          }
          .footer-links a {
            color: inherit;
            text-decoration: none;
          }
          .footer-links a:hover {
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="content">
            <!-- Google Logo Icon -->
            <div class="logo">
              <svg viewBox="0 0 24 24" width="48" height="48">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            </div>
            
            <h1>Sign in with Google</h1>
            <p>Choose an account to continue to <span class="app-name">PixelVault</span></p>
            
            <!-- Account choices -->
            <div class="account-list">
              <!-- Admin -->
              <a href="/auth/google/callback?role=admin" class="account-item">
                <div class="avatar admin">A</div>
                <div class="details">
                  <p class="name">Demo Admin</p>
                  <p class="email">admin@demo.com</p>
                </div>
                <span class="badge admin">Admin</span>
              </a>

              <!-- Photographer -->
              <a href="/auth/google/callback?role=photographer" class="account-item">
                <div class="avatar photo">P</div>
                <div class="details">
                  <p class="name">Demo Photographer</p>
                  <p class="email">photo@demo.com</p>
                </div>
                <span class="badge photo">Photog</span>
              </a>

              <!-- Member -->
              <a href="/auth/google/callback?role=member" class="account-item">
                <div class="avatar member">M</div>
                <div class="details">
                  <p class="name">Demo Member</p>
                  <p class="email">member@demo.com</p>
                </div>
                <span class="badge member">Member</span>
              </a>
            </div>

            <div class="footer">
              <span>English (United States)</span>
              <div class="footer-links">
                <a href="#">Help</a>
                <a href="#">Privacy</a>
                <a href="#">Terms</a>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  // ── GET /auth/google/callback ────────────────────────────────────────────
  app.get('/google/callback', async (request: FastifyRequest<{ Querystring: { role?: string } }>, reply: FastifyReply) => {
    const roleParam = request.query.role || 'member';
    let email = 'member@demo.com';
    if (roleParam === 'admin') email = 'admin@demo.com';
    else if (roleParam === 'photographer') email = 'photo@demo.com';

    // Find the seed user
    const user = await prisma.user.findUnique({
      where: { email },
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

    if (!user) {
      return reply.code(404).send({ message: 'Mock user not found. Run database seed first.' });
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

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/login?token=${accessToken}&refreshToken=${refreshToken}`;
    return reply.redirect(redirectUrl);
  });
}
