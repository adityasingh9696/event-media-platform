import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as HttpServer } from 'http';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { isRedisMocked } from './redis';

// ─── Singleton ────────────────────────────────────────────────────────────────
let ioInstance: SocketIOServer | null = null;

export interface AuthenticatedSocket extends Socket {
  userId: string;
  userRole: string;
}

interface JwtUserPayload {
  sub: string;
  role: string;
  email: string;
  username: string;
  iat?: number;
  exp?: number;
}

// ─── Setup ────────────────────────────────────────────────────────────────────
export function setupSocketIO(httpServer: HttpServer): SocketIOServer {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Attach Redis adapter for multi-node support if Redis is not mocked
  if (!isRedisMocked()) {
    try {
      const pubClient = new Redis(redisUrl, { 
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 0,
      });
      const subClient = new Redis(redisUrl, { 
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 0,
      });

      Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
          io.adapter(createAdapter(pubClient, subClient));
          console.info('✅ Socket.IO Redis adapter attached');
        })
        .catch((err) => {
          console.warn('⚠️  Socket.IO Redis adapter failed, using in-memory:', err.message);
          try { pubClient.disconnect(); } catch {}
          try { subClient.disconnect(); } catch {}
        });
    } catch (err) {
      console.warn('⚠️  Socket.IO Redis adapter init failed:', (err as Error).message);
    }
  } else {
    console.info('ℹ️  Socket.IO: Redis is mocked, using in-memory adapter');
  }

  // ── Authentication Middleware ──────────────────────────────────────────────
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      // Allow unauthenticated connections for public channels (emit to specific rooms only)
      (socket as AuthenticatedSocket).userId = 'anonymous';
      (socket as AuthenticatedSocket).userRole = 'viewer';
      return next();
    }

    try {
      const secret = process.env.JWT_ACCESS_SECRET || 'change-me-in-production';
      const payload = jwt.verify(token, secret) as JwtUserPayload;
      (socket as AuthenticatedSocket).userId = payload.sub;
      (socket as AuthenticatedSocket).userRole = payload.role;
      next();
    } catch {
      next(new Error('Authentication failed: invalid token'));
    }
  });

  // ── Connection Handler ────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const { userId, userRole } = authSocket;

    console.info(`Socket connected: ${socket.id} (user: ${userId})`);

    // Join user-specific room for targeted notifications
    if (userId && userId !== 'anonymous') {
      socket.join(`user:${userId}`);
      console.info(`User ${userId} joined room user:${userId}`);
    }

    // Allow joining specific album/event rooms
    socket.on('join:album', (albumId: string) => {
      socket.join(`album:${albumId}`);
    });

    socket.on('leave:album', (albumId: string) => {
      socket.leave(`album:${albumId}`);
    });

    socket.on('join:event', (eventId: string) => {
      socket.join(`event:${eventId}`);
    });

    socket.on('leave:event', (eventId: string) => {
      socket.leave(`event:${eventId}`);
    });

    socket.on('disconnect', (reason) => {
      console.info(`Socket disconnected: ${socket.id} (reason: ${reason})`);
    });

    socket.on('error', (err) => {
      console.error(`Socket error for ${socket.id}:`, err);
    });
  });

  ioInstance = io;
  return io;
}

// ─── Emitter Helpers ─────────────────────────────────────────────────────────

/**
 * Emit an event to a specific user's private room.
 */
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!ioInstance) {
    console.warn('Socket.IO not initialized — cannot emit to user');
    return;
  }
  ioInstance.to(`user:${userId}`).emit(event, data);
}

/**
 * Emit an event to all users in an album room.
 */
export function emitToAlbum(albumId: string, event: string, data: unknown): void {
  if (!ioInstance) return;
  ioInstance.to(`album:${albumId}`).emit(event, data);
}

/**
 * Emit an event to all users in an event room.
 */
export function emitToEvent(eventId: string, event: string, data: unknown): void {
  if (!ioInstance) return;
  ioInstance.to(`event:${eventId}`).emit(event, data);
}

/**
 * Broadcast to all connected clients.
 */
export function broadcast(event: string, data: unknown): void {
  if (!ioInstance) return;
  ioInstance.emit(event, data);
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}
