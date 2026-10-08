import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { checkLlamaHealth } from './ai/gemma-client.js';
import { initDatabase } from './db/index.js';
import { captureRoutes } from './routes/capture.js';
import { companionRoutes } from './routes/companion.js';
import { eventsRoutes } from './routes/events.js';
import { petRoutes } from './routes/pet.js';
import { settingsRoutes } from './routes/settings.js';

const PORT = Number(process.env.PORT) || 3100;
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  console.log('========================================================');
  console.log('Sporeling Server - The Biome Familiar Backend');
  console.log('========================================================');

  // Initialize SQLite database
  initDatabase();
  console.log('[DB] Local SQLite initialized (~/.sporeling/sporeling.db)');

  const fastify = Fastify({
    logger: {
      level: 'info',
    },
  });

  // Enable CORS for PWA and local development origins
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Enable multipart file handling for camera photo uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024, // 15 MB
    },
  });

  // Register API route groups
  await fastify.register(petRoutes, { prefix: '/api/pet' });
  await fastify.register(companionRoutes, { prefix: '/api/companion' });
  await fastify.register(eventsRoutes, { prefix: '/api' });
  await fastify.register(captureRoutes, { prefix: '/api/capture' });
  await fastify.register(settingsRoutes, { prefix: '/api/settings' });

  // Root health check endpoint
  fastify.get('/health', async () => {
    const llamaHealthy = await checkLlamaHealth();
    return {
      status: 'ok',
      service: 'sporeling-backend',
      timestamp: Date.now(),
      llamaServer: llamaHealthy ? 'connected' : 'unreachable',
    };
  });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`[Server] Sporeling API listening on http://${HOST}:${PORT}`);
    console.log(
      `[Server] Live SSE events stream: http://${HOST}:${PORT}/api/events`,
    );

    // Check llama status at startup
    const isLlamaUp = await checkLlamaHealth();
    if (isLlamaUp) {
      console.log(
        '[AI] Gemma 4 E2B Llama Server detected and connected on port 8080.',
      );
    } else {
      console.log(
        '[AI] Note: Llama Server is not running on port 8080 yet. Run start_llama.bat to enable local vision inference.',
      );
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
