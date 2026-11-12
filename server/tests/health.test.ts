import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../src/app.js';
import { getTestPool } from './testHelper.js';

describe('GET /health', () => {
  let app: FastifyInstance;
  let pool: Pool;

  beforeAll(async () => {
    pool = getTestPool();
    app = await buildApp({ pool, logger: false });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
  });

  it('returns health status correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = JSON.parse(response.payload);
    expect(body.timestamp).toBeDefined();

    if (response.statusCode === 200) {
      expect(body.status).toBe('ok');
      expect(body.db).toBe('connected');
    } else {
      expect(response.statusCode).toBe(503);
      expect(body.status).toBe('error');
      expect(body.db).toBe('disconnected');
    }
  });
});

