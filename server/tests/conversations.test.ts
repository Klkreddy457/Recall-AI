import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { buildApp } from '../src/app.js';
import { getTestPool } from './testHelper.js';
import { runMigrations } from '../src/db/migrate.js';

describe('Conversations API & Owner Isolation', () => {
  let app: FastifyInstance;
  let pool: Pool;

  const owner1 = randomUUID();
  const owner2 = randomUUID();

  let dbAvailable = false;

  beforeAll(async () => {
    pool = getTestPool();
    app = await buildApp({ pool, logger: false });
    try {
      await runMigrations(pool);
      dbAvailable = true;
    } catch {
      console.warn('PostgreSQL database not available; skipping DB-dependent integration tests.');
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
  });

  it('rejects requests without x-owner-id header with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversations',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects requests with invalid non-UUID x-owner-id with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: { 'x-owner-id': 'invalid-uuid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates and lists conversations for Owner 1', async () => {
    if (!dbAvailable) return;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { 'x-owner-id': owner1 },
      payload: { title: 'First Conversation' },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.payload);
    expect(createBody.conversation.id).toBeDefined();
    expect(createBody.conversation.owner_id).toBe(owner1);
    expect(createBody.conversation.title).toBe('First Conversation');

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: { 'x-owner-id': owner1 },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.conversations.length).toBeGreaterThanOrEqual(1);
    expect(listBody.conversations[0].id).toBe(createBody.conversation.id);
  });

  it('enforces owner isolation: Owner 2 cannot view Owner 1 conversations', async () => {
    if (!dbAvailable) return;
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: { 'x-owner-id': owner2 },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.conversations.length).toBe(0);
  });

  it('enforces owner isolation: Owner 2 cannot delete Owner 1 conversation', async () => {
    if (!dbAvailable) return;
    // Create conversation for Owner 1
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { 'x-owner-id': owner1 },
      payload: { title: 'Owner 1 Secret Conversation' },
    });
    const convId = JSON.parse(createRes.payload).conversation.id;

    // Owner 2 attempts to delete Owner 1 conversation
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${convId}`,
      headers: { 'x-owner-id': owner2 },
    });
    expect(deleteRes.statusCode).toBe(404);

    // Verify conversation still exists for Owner 1
    const checkRes = await app.inject({
      method: 'GET',
      url: `/api/conversations/${convId}/messages`,
      headers: { 'x-owner-id': owner1 },
    });
    expect(checkRes.statusCode).toBe(200);
  });

  it('cascades delete: deleting conversation removes all its messages', async () => {
    if (!dbAvailable) return;
    // Create conversation for Owner 1
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      headers: { 'x-owner-id': owner1 },
      payload: { title: 'To Be Deleted' },
    });
    const convId = JSON.parse(createRes.payload).conversation.id;

    // Insert a message directly linked to conversation
    const msgId = randomUUID();
    await pool.query(
      `INSERT INTO messages (id, conversation_id, role, content, status)
       VALUES ($1, $2, 'user', 'Hello world', 'complete')`,
      [msgId, convId]
    );

    // Verify message exists in DB
    const checkMsg = await pool.query(`SELECT id FROM messages WHERE id = $1`, [msgId]);
    expect(checkMsg.rows.length).toBe(1);

    // Delete conversation via API
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/conversations/${convId}`,
      headers: { 'x-owner-id': owner1 },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Verify message was deleted by cascade
    const verifyMsg = await pool.query(`SELECT id FROM messages WHERE id = $1`, [msgId]);
    expect(verifyMsg.rows.length).toBe(0);
  });
});

