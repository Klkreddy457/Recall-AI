import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { buildApp } from '../src/app.js';
import { PostgresDataStore } from '../src/db/store.js';

describe('Database Disconnection & Resilience', () => {
  it('throws error on production startup when DATABASE_URL cannot connect', async () => {
    await expect(
      buildApp({
        configOverrides: {
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://postgres:wrong@127.0.0.1:54329/nonexistent',
        },
      })
    ).rejects.toThrow(/Production database connection failed/);
  });

  it('PostgresDataStore in production throws on query failure without fallback', async () => {
    const mockPool = {
      query: vi.fn().mockRejectedValue(new Error('FATAL: terminating connection due to administrator command')),
    } as unknown as Pool;

    const store = new PostgresDataStore(mockPool, { allowFallback: false });

    await expect(store.listConversations('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      /Database error in listConversations/
    );
    await expect(store.createConversation('00000000-0000-0000-0000-000000000001', 'Test')).rejects.toThrow(
      /Database error in createConversation/
    );
  });

  it('Health endpoint returns 503 when database disconnects, and 200 after recovery', async () => {
    let isDbHealthy = false;

    const mockRecoverablePool = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT 1 as healthy')) {
          if (!isDbHealthy) {
            throw new Error('connection refused at 5432');
          }
          return { rows: [{ healthy: 1 }] };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;

    const app = await buildApp({
      pool: mockRecoverablePool,
      logger: false,
    });

    // 1. Initial State: DB disconnected
    const res1 = await app.inject({ method: 'GET', url: '/health' });
    expect(res1.statusCode).toBe(503);
    const body1 = JSON.parse(res1.body);
    expect(body1.status).toBe('error');
    expect(body1.db).toBe('disconnected');

    // 2. Recovery: DB becomes healthy
    isDbHealthy = true;
    const res2 = await app.inject({ method: 'GET', url: '/health' });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.status).toBe('ok');
    expect(body2.db).toBe('connected');
  });

  it('Health endpoint in production returns 503 when pool is null', async () => {
    const app = await buildApp({
      pool: null,
      configOverrides: { NODE_ENV: 'production' },
      logger: false,
    });

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.connected).toBe(false);
  });
});

