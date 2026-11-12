import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Pool } from 'pg';
import { loadConfig, type EnvConfig } from './config/env.js';
import { getPool } from './db/pool.js';
import { healthRoutes } from './routes/health.js';
import { conversationRoutes } from './routes/conversations.js';

export interface BuildAppOptions {
  configOverrides?: Partial<EnvConfig>;
  pool?: Pool;
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const cfg = loadConfig(opts.configOverrides);
  const pool = opts.pool ?? getPool(cfg);

  const app = Fastify({
    logger: opts.logger ?? (cfg.NODE_ENV !== 'test'),
    bodyLimit: 1048576, // 1MB body limit
  });

  // CORS configuration
  await app.register(cors, {
    origin: cfg.CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-owner-id'],
    credentials: true,
  });

  // Global Error Handler
  app.setErrorHandler((error: unknown, _request, reply) => {
    app.log.error(error);

    const err = (error && typeof error === 'object') ? (error as { statusCode?: number; name?: string; message?: string }) : {};
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const response = {
      statusCode,
      error: err.name || 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
    };

    reply.status(statusCode).send(response);
  });

  // Register Routes
  await app.register(healthRoutes(pool));
  await app.register(conversationRoutes(pool));

  return app;
}

