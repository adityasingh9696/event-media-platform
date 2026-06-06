import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { prisma } from './lib/prisma';
import { connectMongoDB } from './lib/mongodb';
import { connectRedis } from './lib/redis';
import { connectElasticsearch } from './lib/elasticsearch';
import { authRoutes } from './routes/auth';
import { eventRoutes } from './routes/events';
import { albumRoutes } from './routes/albums';
import { mediaRoutes } from './routes/media';
import { socialRoutes } from './routes/social';
import { searchRoutes } from './routes/search';
import { notificationRoutes } from './routes/notifications';
import { userRoutes } from './routes/users';
import { adminRoutes } from './routes/admin';
import { shareRoutes } from './routes/shares';
import { setupSocketIO } from './lib/socket';
import { errorHandler } from './middlewares/errorHandler';

const PORT = Number(process.env.PORT) || 4000;
const HOST = '0.0.0.0';

async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  // ── Security ──────────────────────────────────────────────────────
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // ── Swagger API Docs ──────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Event & Media Management Platform API',
        description: 'CIG Dev 2025 — Complete API Documentation',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${PORT}` }],
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // ── Routes ────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(eventRoutes, { prefix: '/events' });
  await app.register(albumRoutes, { prefix: '/albums' });
  await app.register(mediaRoutes, { prefix: '/media' });
  await app.register(socialRoutes, { prefix: '/social' });
  await app.register(searchRoutes, { prefix: '/search' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(shareRoutes, { prefix: '/share' });

  // ── Health Check ──────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  // ── Error Handler ─────────────────────────────────────────────────
  app.setErrorHandler(errorHandler);

  return app;
}

async function start() {
  try {
    // Connect all databases
    await connectMongoDB();
    await connectRedis();
    await connectElasticsearch();

    const app = await buildApp();

    // Setup Socket.IO (attaches to HTTP server)
    setupSocketIO(app.server);

    // In production, start the background workers inside the same process to stay on Render's free tier
    if (process.env.START_WORKERS === 'true' || process.env.NODE_ENV === 'production') {
      console.info('🚀 Starting background workers inside the API server process (100% Free Stack)...');
      try {
        const { loadFaceModels } = await import('./lib/faceapi');
        await loadFaceModels();
        await import('./workers/mediaProcessor');
        await import('./workers/aiTagger');
        await import('./workers/faceDetector');
        console.info('🤖 Background workers active and listening for jobs.');
      } catch (workerErr) {
        console.error('⚠️  Failed to start background workers inside API process:', workerErr);
      }
    }

    await app.listen({ port: PORT, host: HOST });
    console.info(`🚀 Server running at http://localhost:${PORT}`);
    console.info(`📚 API Docs at http://localhost:${PORT}/api/docs`);
  } catch (err) {
    console.error('Failed to start server:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.info('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

start();
