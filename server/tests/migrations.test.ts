import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { getTestPool } from './testHelper.js';
import { runMigrations } from '../src/db/migrate.js';

describe('Database Migrations & Schema Integrity', () => {
  let pool: Pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = getTestPool();
    try {
      const client = await pool.connect();
      client.release();
      dbAvailable = true;
    } catch {
      console.warn('PostgreSQL database not available; skipping DB-dependent migration tests.');
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('successfully applies migrations 001 and 002', async () => {
    if (!dbAvailable) return;
    await runMigrations(pool);

    const { rows: applied } = await pool.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY id ASC;'
    );
    const names = applied.map((r) => r.name);
    expect(names).toContain('001_initial_schema.sql');
    expect(names).toContain('002_conversation_summaries.sql');
  });

  it('verifies all required tables exist', async () => {
    if (!dbAvailable) return;

    const { rows: tables } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
    );
    const tableNames = tables.map((t) => t.table_name);
    expect(tableNames).toContain('conversations');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('conversation_summaries');
    expect(tableNames).toContain('schema_migrations');
  });

  it('verifies GIN full-text indexes exist on messages and conversation_summaries', async () => {
    if (!dbAvailable) return;

    const { rows: indexes } = await pool.query<{ tablename: string; indexname: string }>(
      `SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public';`
    );
    const indexNames = indexes.map((i) => `${i.tablename}.${i.indexname}`);
    expect(indexNames).toContain('messages.idx_messages_content_tsv');
    expect(indexNames).toContain('conversation_summaries.idx_conversation_summaries_tsv');
  });

  it('verifies conversation_summaries trigger automatically maintains summary_tsv', async () => {
    if (!dbAvailable) return;

    // 1. Insert a temporary test conversation
    const convRes = await pool.query<{ id: string }>(
      `INSERT INTO conversations (owner_id, title) VALUES ('00000000-0000-0000-0000-000000000001', 'FTS Trigger Regression Test') RETURNING id;`
    );
    const convId = convRes.rows[0]!.id;

    try {
      // 2. Insert summary with key entities
      const sumRes = await pool.query<{ id: string; summary_tsv: string }>(
        `INSERT INTO conversation_summaries (conversation_id, summary, key_entities)
         VALUES ($1, 'Evaluating PostgreSQL full-text search indexing with triggers', ARRAY['postgres', 'indexing', 'database'])
         RETURNING id, summary_tsv;`,
        [convId]
      );

      const inserted = sumRes.rows[0]!;
      expect(inserted.summary_tsv).toBeDefined();
      expect(inserted.summary_tsv).toContain('databas');
      expect(inserted.summary_tsv).toContain('index');
      expect(inserted.summary_tsv).toContain('trigger');

      // 3. Verify FTS matching query on summary_tsv
      const matchRes = await pool.query<{ matched: boolean }>(
        `SELECT (summary_tsv @@ plainto_tsquery('english', 'database')) as matched
         FROM conversation_summaries WHERE id = $1;`,
        [inserted.id]
      );
      expect(matchRes.rows[0]?.matched).toBe(true);
    } finally {
      // Clean up test conversation (cascades to summary)
      await pool.query(`DELETE FROM conversations WHERE id = $1;`, [convId]);
    }
  });

  it('is idempotent when run multiple times without re-executing', async () => {
    if (!dbAvailable) return;
    const reApplied = await runMigrations(pool);
    expect(reApplied).toEqual([]);
  });
});
