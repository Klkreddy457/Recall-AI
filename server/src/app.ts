import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { Pool } from 'pg';
import { loadConfig, type EnvConfig } from './config/env.js';
import { getPool } from './db/pool.js';
import { healthRoutes } from './routes/health.js';
import { conversationRoutes } from './routes/conversations.js';
import { chatRoutes } from './routes/chat.js';
import { AgentOrchestrator } from './agent/orchestrator.js';
import { OpenAILLMClient } from './services/llm/openai.js';
import { TavilySearchClient } from './services/search/tavily.js';
import { type DataStore, PostgresDataStore, globalInMemoryStore } from './db/store.js';

export interface BuildAppOptions {
  configOverrides?: Partial<EnvConfig>;
  pool?: Pool | null;
  store?: DataStore;
  orchestrator?: AgentOrchestrator;
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const cfg = loadConfig(opts.configOverrides);

  let pool: Pool | null = null;
  let store: DataStore = opts.store || globalInMemoryStore;

  if (opts.store) {
    store = opts.store;
    pool = opts.pool ?? null;
  } else if (opts.pool !== undefined) {
    pool = opts.pool;
    if (pool) {
      store = new PostgresDataStore(pool, { allowFallback: cfg.NODE_ENV !== 'production' });
    } else {
      store = globalInMemoryStore;
    }
  } else {
    // Check if default pool can connect
    try {
      const candidatePool = getPool(cfg);
      const client = await candidatePool.connect();
      client.release();
      pool = candidatePool;
      store = new PostgresDataStore(pool, { allowFallback: cfg.NODE_ENV !== 'production' });
    } catch (err) {
      if (cfg.NODE_ENV === 'production') {
        throw new Error(
          `Production database connection failed: Unable to connect to PostgreSQL using DATABASE_URL. Reason: ${(err as Error).message}`
        );
      }
      // Non-production fallback with explicit warning
      console.warn(`[WARN] PostgreSQL offline (${(err as Error).message}). Using in-memory fallback for local development.`);
      pool = null;
      store = globalInMemoryStore;
    }
  }

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

  // Global Rate Limiting
  await app.register(rateLimit, {
    max: cfg.RATE_LIMIT_MAX,
    timeWindow: cfg.RATE_LIMIT_WINDOW,
  });

  // Global Error Handler
  app.setErrorHandler((error: unknown, _request, reply) => {
    app.log.error(error);

    const err =
      error && typeof error === 'object'
        ? (error as { statusCode?: number; name?: string; message?: string })
        : {};
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const response = {
      statusCode,
      error: err.name || 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
    };

    reply.status(statusCode).send(response);
  });

  // Resolve Orchestrator
  const orchestrator =
    opts.orchestrator ||
    new AgentOrchestrator({
      llmClient: new OpenAILLMClient({
        apiKey: cfg.OPENAI_API_KEY,
        model: cfg.OPENAI_MODEL,
        baseURL: cfg.OPENAI_BASE_URL || undefined,
      }),
      searchClient: new TavilySearchClient({
        apiKey: cfg.TAVILY_API_KEY,
      }),
    });

  // Register Routes
  if (pool) {
    await app.register(healthRoutes(pool));
  } else {
    // Health route when postgres pool is offline
    app.get('/health', async (_req, reply) => {
      const isProd = cfg.NODE_ENV === 'production';
      return reply.status(isProd ? 503 : 200).send({
        status: isProd ? 'error' : 'degraded',
        db: 'in-memory (postgres offline)',
        connected: false,
        timestamp: new Date().toISOString(),
      });
    });
  }

  await app.register(conversationRoutes(store));
  await app.register(
    chatRoutes({
      pool: pool ?? undefined,
      store,
      orchestrator,
      rateLimitMax: cfg.RATE_LIMIT_MAX,
      rateLimitWindow: cfg.RATE_LIMIT_WINDOW,
    })
  );

  return app;
}
