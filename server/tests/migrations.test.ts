import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { getTestPool, resetDatabase } from './testHelper.js';
import { runMigrations } from '../src/db/migrate.js';

describe('Database Migrations', () => {
  let pool: Pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = getTestPool();
    try {
      await resetDatabase(pool);
      dbAvailable = true;
    } catch {
      console.warn('PostgreSQL database not available; skipping DB-dependent migration tests.');
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('runs migrations on a clean database', async () => {
    if (!dbAvailable) return;
    const applied = await runMigrations(pool);
    expect(applied).toContain('001_initial_schema.sql');

    // Verify conversations table exists
    const convTable = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'conversations'`
    );
    expect(convTable.rows.length).toBe(1);

    // Verify messages table exists
    const msgTable = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'messages'`
    );
    expect(msgTable.rows.length).toBe(1);

    // Verify GIN index on content_tsv exists
    const ginIndex = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'idx_messages_content_tsv'`
    );
    expect(ginIndex.rows.length).toBe(1);
  });

  it('is idempotent when run multiple times', async () => {
    if (!dbAvailable) return;
    const reApplied = await runMigrations(pool);
    expect(reApplied).toEqual([]);
  });
});

