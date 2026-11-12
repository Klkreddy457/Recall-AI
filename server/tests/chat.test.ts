import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { buildApp } from '../src/app.js';
import { getTestPool } from './testHelper.js';
import { runMigrations } from '../src/db/migrate.js';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';
import { FakeLLMClient } from '../src/services/llm/openai.js';
import { FakeSearchClient } from '../src/services/search/tavily.js';

describe('Chat API & SSE Streaming (POST /api/chat)', () => {
  let app: FastifyInstance;
  let pool: Pool;
  let dbAvailable = false;
  let fakeLLM: FakeLLMClient;
  let fakeSearch: FakeSearchClient;

  const testOwner = randomUUID();

  beforeAll(async () => {
    pool = getTestPool();
    try {
      await runMigrations(pool);
      dbAvailable = true;
    } catch {
      console.warn('PostgreSQL not available; DB persistence tests will be skipped.');
    }

    fakeLLM = new FakeLLMClient();
    fakeSearch = new FakeSearchClient();

    const orchestrator = new AgentOrchestrator({
      llmClient: fakeLLM,
      searchClient: fakeSearch,
    });

    app = await buildApp({
      pool,
      orchestrator,
      logger: false,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
  });

  it('validates required headers and rejects missing x-owner-id with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('x-owner-id');
  });

  it('validates body and rejects empty messages with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-owner-id': testOwner },
      payload: { message: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('streams progressive tokens in correct event order over SSE', async () => {
    fakeLLM.setScript([
      { tokens: ['The ', 'capital ', 'of ', 'France ', 'is ', 'Paris.'] },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-owner-id': testOwner },
      payload: { message: 'What is the capital of France?' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const rawPayload = res.payload;
    expect(rawPayload).toContain('event: token');
    expect(rawPayload).toContain('event: complete');

    // Parse SSE lines
    const events = rawPayload
      .split('\n\n')
      .filter((block) => block.trim().length > 0)
      .map((block) => {
        const lines = block.split('\n');
        const eventLine = lines.find((l) => l.startsWith('event: '));
        const dataLine = lines.find((l) => l.startsWith('data: '));
        return {
          type: eventLine ? eventLine.replace('event: ', '') : '',
          data: dataLine ? JSON.parse(dataLine.replace('data: ', '')) : null,
        };
      });

    // Check progressive token events
    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBe(6);
    expect(tokenEvents.map((e) => e.data.content).join('')).toBe('The capital of France is Paris.');

    // Check complete event
    const completeEvent = events.find((e) => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.data.status).toBe('complete');
    expect(completeEvent?.data.content).toBe('The capital of France is Paris.');
    expect(completeEvent?.data.timings).toBeDefined();
  });

  it('persists user message at turn start and assistant message at turn end with search_metadata', async () => {
    if (!dbAvailable) return;

    fakeLLM.setScript([
      { tokens: ['PostgreSQL ', 'is ', 'fast ', 'and ', 'reliable.'] },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-owner-id': testOwner },
      payload: { message: 'Why use PostgreSQL?' },
    });

    expect(res.statusCode).toBe(200);

    // Verify conversation was created
    const convs = await pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM conversations WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [testOwner]
    );
    expect(convs.rows.length).toBe(1);
    const convId = convs.rows[0]!.id;
    expect(convs.rows[0]!.title).toBe('Why use PostgreSQL?');

    // Verify user and assistant messages in DB
    const msgs = await pool.query<{ role: string; content: string; status: string; search_metadata: unknown }>(
      `SELECT role, content, status, search_metadata FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [convId]
    );

    expect(msgs.rows.length).toBe(2);
    expect(msgs.rows[0]!.role).toBe('user');
    expect(msgs.rows[0]!.content).toBe('Why use PostgreSQL?');
    expect(msgs.rows[0]!.status).toBe('complete');

    expect(msgs.rows[1]!.role).toBe('assistant');
    expect(msgs.rows[1]!.content).toBe('PostgreSQL is fast and reliable.');
    expect(msgs.rows[1]!.status).toBe('complete');
    expect(msgs.rows[1]!.search_metadata).toBeDefined();
  });

  it('handles client abort and records interrupted status', async () => {
    const abortController = new AbortController();
    abortController.abort(); // Pre-aborted

    const fakeAbortingLLM = new FakeLLMClient([
      { error: new Error('LLM stream aborted by client') },
    ]);

    const orchestrator = new AgentOrchestrator({
      llmClient: fakeAbortingLLM,
      searchClient: fakeSearch,
    });

    const events: any[] = [];
    for await (const ev of orchestrator.runTurn({
      ownerId: testOwner,
      conversationId: randomUUID(),
      query: 'Aborted query',
      signal: abortController.signal,
    })) {
      events.push(ev);
    }

    const complete = events.find((e) => e.type === 'complete');
    expect(complete).toBeDefined();
    expect(complete.status).toBe('interrupted');
  });

  it('handles and propagates errors without crashing', async () => {
    fakeLLM.setScript([
      { error: new Error('Provider rate limit reached') },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-owner-id': testOwner },
      payload: { message: 'Trigger provider error' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('event: error');
    expect(res.payload).toContain('Provider rate limit reached');
  });
});

