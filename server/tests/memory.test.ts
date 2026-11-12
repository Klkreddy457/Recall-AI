import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { getTestPool } from './testHelper.js';
import { runMigrations } from '../src/db/migrate.js';
import { retrieve } from '../src/services/memory/retrieval.js';

describe('Memory Retrieval Engine (Parallel A, B, C & Signal)', () => {
  let pool: Pool;
  let dbAvailable = false;

  const ownerA = randomUUID();
  const ownerB = randomUUID();

  // Test reference date: Thursday Nov 12, 2026 12:00:00 UTC
  const testNow = new Date('2026-11-12T12:00:00.000Z');

  beforeAll(async () => {
    pool = getTestPool();
    try {
      await runMigrations(pool);
      dbAvailable = true;

      // Seed test conversations and messages for Owner A
      const convA1 = randomUUID();
      const convA2 = randomUUID();
      const convB1 = randomUUID();

      await pool.query(
        `INSERT INTO conversations (id, owner_id, title, created_at, updated_at) VALUES
         ($1, $2, 'Python Discussion', '2026-11-09T10:00:00Z', '2026-11-09T10:30:00Z'),
         ($3, $2, 'RAG Architecture', '2026-11-11T14:00:00Z', '2026-11-11T14:30:00Z'),
         ($4, $5, 'Owner B Secrets', '2026-11-11T15:00:00Z', '2026-11-11T15:30:00Z')`,
        [convA1, ownerA, convA2, convB1, ownerB]
      );

      // Messages in convA1 (Nov 9, 2026 - Last Monday in NY timezone)
      await pool.query(
        `INSERT INTO messages (id, conversation_id, role, content, status, created_at) VALUES
         (gen_random_uuid(), $1, 'user', 'How do Python metaclasses work?', 'complete', '2026-11-09T10:00:00Z'),
         (gen_random_uuid(), $1, 'assistant', 'Metaclasses in Python define how classes are constructed.', 'complete', '2026-11-09T10:00:05Z')`,
        [convA1]
      );

      // Messages in convA2 (Nov 11, 2026 - Yesterday in NY timezone)
      await pool.query(
        `INSERT INTO messages (id, conversation_id, role, content, status, created_at) VALUES
         (gen_random_uuid(), $1, 'user', 'What did we decide about vector databases?', 'complete', '2026-11-11T14:00:00Z'),
         (gen_random_uuid(), $1, 'assistant', 'We decided to forbid vector databases and use PostgreSQL FTS instead.', 'complete', '2026-11-11T14:00:05Z'),
         (gen_random_uuid(), $1, 'user', 'What about Tavily search?', 'complete', '2026-11-11T14:05:00Z'),
         (gen_random_uuid(), $1, 'assistant', 'Tavily is used with basic depth and at most 5 results.', 'complete', '2026-11-11T14:05:05Z')`,
        [convA2]
      );

      // Messages in convB1 (Owner B - contains Python keyword)
      await pool.query(
        `INSERT INTO messages (id, conversation_id, role, content, status, created_at) VALUES
         (gen_random_uuid(), $1, 'user', 'Python secret algorithm for Owner B', 'complete', '2026-11-11T15:00:00Z'),
         (gen_random_uuid(), $1, 'assistant', 'Owner B secret response', 'complete', '2026-11-11T15:00:05Z')`,
        [convB1]
      );
    } catch {
      console.warn('PostgreSQL not available; skipping DB integration tests.');
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('retrieves topic matches via FTS and pairs questions with answers', async () => {
    if (!dbAvailable) return;

    const res = await retrieve(pool, {
      ownerId: ownerA,
      query: 'what did you tell me about metaclasses in Python?',
      now: testNow,
    });

    expect(res.fts.length).toBeGreaterThan(0);
    const pair = res.fts[0]!;
    expect(pair.userMessage.content).toContain('metaclasses');
    expect(pair.assistantMessage?.content).toContain('constructed');
    expect(res.memoryEmptySignal).toBe(false);
  });

  it('retrieves temporal queries for "yesterday" across conversations', async () => {
    if (!dbAvailable) return;

    const res = await retrieve(pool, {
      ownerId: ownerA,
      query: 'what did I ask yesterday?',
      timezone: 'America/New_York',
      now: testNow,
    });

    expect(res.temporal).not.toBeNull();
    expect(res.temporal!.groups.length).toBeGreaterThan(0);
    const allPairs = res.temporal!.groups.flatMap((g) => g.pairs);
    expect(allPairs.some((p) => p.userMessage.content.includes('vector databases'))).toBe(true);
    expect(res.memoryEmptySignal).toBe(false);
  });

  it('retrieves temporal queries for "last Monday"', async () => {
    if (!dbAvailable) return;

    const res = await retrieve(pool, {
      ownerId: ownerA,
      query: 'what did we discuss last Monday?',
      timezone: 'America/New_York',
      now: testNow,
    });

    expect(res.temporal).not.toBeNull();
    expect(res.temporal!.groups.length).toBeGreaterThan(0);
    const allPairs = res.temporal!.groups.flatMap((g) => g.pairs);
    expect(allPairs.some((p) => p.userMessage.content.includes('metaclasses'))).toBe(true);
  });

  it('enforces owner isolation: Owner A never sees Owner B records', async () => {
    if (!dbAvailable) return;

    const res = await retrieve(pool, {
      ownerId: ownerA,
      query: 'Owner B secret',
      now: testNow,
    });

    // FTS must not return any of Owner B's messages
    expect(res.fts.some((p) => p.userMessage.content.includes('Owner B'))).toBe(false);
    expect(res.fts.some((p) => p.assistantMessage?.content.includes('Owner B'))).toBe(false);
  });

  it('triggers memoryEmptySignal when memory cues are present but retrieval is empty', async () => {
    if (!dbAvailable) return;

    const res = await retrieve(pool, {
      ownerId: ownerA,
      query: 'did I ask about quantum entanglement before?',
      now: testNow,
    });

    expect(res.fts.length).toBe(0);
    expect(res.temporal).toBeNull();
    // Decision 5 requirement: cues present + empty retrieval -> true
    expect(res.memoryEmptySignal).toBe(true);
  });

  it('does NOT trigger memoryEmptySignal for queries without memory cues', async () => {
    if (!dbAvailable) return;

    const res = await retrieve(pool, {
      ownerId: ownerA,
      query: 'quantum entanglement overview',
      now: testNow,
    });

    expect(res.fts.length).toBe(0);
    expect(res.memoryEmptySignal).toBe(false);
  });

  it('records execution timings for all parallel retrieval branches', async () => {
    if (!dbAvailable) return;

    const res = await retrieve(pool, {
      ownerId: ownerA,
      query: 'metaclasses in Python',
      now: testNow,
    });

    expect(res.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(res.timings.recentMs).toBeGreaterThanOrEqual(0);
    expect(res.timings.temporalMs).toBeGreaterThanOrEqual(0);
    expect(res.timings.ftsMs).toBeGreaterThanOrEqual(0);
  });
});

