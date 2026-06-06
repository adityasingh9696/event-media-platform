import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

// ─── Type Augmentation ────────────────────────────────────────────────────────
declare module 'fastify' {
  interface FastifyRequest {
    user: JwtUserPayload;
  }
}

export interface JwtUserPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

// ─── Authenticate Middleware ──────────────────────────────────────────────────

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
  }

  const token = authHeader.slice(7);

  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET not configured');
    }

    const payload = jwt.verify(token, secret) as JwtUserPayload;
    request.user = payload;
  } catch (err) {
    const error = err as Error;
    let message = 'Invalid or expired access token';

    if (error.name === 'TokenExpiredError') {
      message = 'Access token has expired. Please refresh your session.';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Malformed access token.';
    }

    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message,
    });
  }
}

// ─── Role Guard Factory ───────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  club_member: 1,
  photographer: 2,
  admin: 3,
};

/**
 * Returns a Fastify preHandler that requires the user to have one of the specified roles.
 * The user must also be authenticated (authenticate must run first).
 *
 * @param roles - Array of allowed roles (e.g. ['admin', 'photographer'])
 * @param minHierarchy - Optional: instead of explicit roles, require minimum hierarchy level
 */
export function requireRole(roles: string[]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.user) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const { role } = request.user;

    if (!roles.includes(role)) {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Access denied. Required roles: [${roles.join(', ')}]. Your role: ${role}`,
      });
    }
  };
}

/**
 * Returns a Fastify preHandler that requires a minimum role level in hierarchy.
 */
export function requireMinRole(minRole: string) {
  return async function minRoleGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.user) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const userLevel = ROLE_HIERARCHY[request.user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Insufficient permissions. Minimum required role: ${minRole}`,
      });
    }
  };
}

export default authenticate;
