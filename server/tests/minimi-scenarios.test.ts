import { describe, it, expect } from 'vitest';
import { AgentOrchestrator, type AgentEvent } from '../src/agent/orchestrator.js';
import { FakeLLMClient } from '../src/services/llm/openai.js';
import { FakeSearchClient } from '../src/services/search/tavily.js';
import { parseTemporalDate } from '../src/services/memory/temporal.js';
import { changeDetector } from '../src/services/comparison/change-detector.js';
import type { MemoryRetrievalResult } from '../src/services/memory/types.js';

async function collectEvents(generator: AsyncGenerator<AgentEvent, void, unknown>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of generator) {
    events.push(ev);
  }
  return events;
}

describe('Phase G: Original Minimi Scenarios End-to-End', () => {
  const OWNER_ID = '00000000-0000-0000-0000-000000000001';
  const CONV_ID = '00000000-0000-0000-0000-000000000002';
  const REF_NOW = new Date('2026-11-14T10:00:00.000Z');

  // Scenario 1: CRM Changes
  it('Scenario 1: Resolves Monday Nov 9 CRM memory, searches live pricing, and calculates deltas', async () => {
    // 1. Temporal resolution
    const range = parseTemporalDate('On Monday we shortlisted five CRM tools', 'UTC', REF_NOW);
    expect(range).not.toBeNull();
    expect(range!.start.toISOString().slice(0, 10)).toBe('2026-11-09');

    // 2. Memory context with 5 products
    const crmMemory: MemoryRetrievalResult = {
      recentContext: [],
      temporal: {
        range: { start: range!.start, end: range!.end, text: 'Monday' },
        groups: [
          {
            conversationId: 'conv-crm',
            conversationTitle: 'CRM Shortlist',
            pairs: [
              {
                conversationId: 'conv-crm',
                userMessage: {
                  id: 'u-crm',
                  conversation_id: 'conv-crm',
                  role: 'user',
                  content: 'Shortlist 5 CRMs for 20 seats: HubSpot ($20), Salesforce ($25), Pipedrive ($24), Zoho ($14), Freshsales ($18).',
                  status: 'complete',
                  created_at: new Date('2026-11-14T02:00:00Z'),
                  event_date: new Date('2026-11-09T14:00:00Z'),
                },
                assistantMessage: {
                  id: 'a-crm',
                  conversation_id: 'conv-crm',
                  role: 'assistant',
                  content: 'HubSpot $20 ($400 total), Salesforce $25 ($500 total), Pipedrive $24 ($480 total), Zoho $14 ($280 total), Freshsales $18 ($360 total). No final decision made.',
                  status: 'complete',
                  created_at: new Date('2026-11-14T02:02:00Z'),
                  event_date: new Date('2026-11-09T14:02:00Z'),
                },
              },
            ],
          },
        ],
      },
      fts: [],
      memoryEmptySignal: false,
      timings: { totalMs: 1, recentMs: 0.3, temporalMs: 0.4, ftsMs: 0.3 },
    };

    // 3. Search and LLM response
    const fakeLLM = new FakeLLMClient([
      { toolCall: { id: 'call_search', name: 'web_search', arguments: '{"query":"HubSpot Salesforce CRM pricing changes 2026"}' } },
      { tokens: ['On Monday, November 9, we shortlisted 5 CRMs for your 20-person sales team (HubSpot $20/seat, Salesforce $25/seat, Pipedrive $24/seat, Zoho $14/seat, Freshsales $18/seat). Official pricing on hubspot.com remains $20/seat on monthly billing [1]. Note that annual billing is $15/seat, which is non-comparable to our monthly baseline.'] },
    ]);
    const fakeSearch = new FakeSearchClient([
      { id: 1, title: 'HubSpot Sales Hub Pricing', url: 'https://www.hubspot.com/pricing/sales', content: 'Starter plan is $20/seat monthly, or $15/seat paid annually.' },
    ]);

    const orchestrator = new AgentOrchestrator({ llmClient: fakeLLM, searchClient: fakeSearch });

    const events = await collectEvents(
      orchestrator.runTurn({
        ownerId: OWNER_ID,
        conversationId: CONV_ID,
        query: 'On Monday we shortlisted five CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
        memoryResult: crmMemory,
        now: REF_NOW,
      })
    );

    expect(fakeSearch.recordedQueries.length).toBe(1);
    const complete = events.find((e) => e.type === 'complete');
    expect(complete).toBeDefined();
    if (complete && complete.type === 'complete') {
      expect(complete.content).toContain('HubSpot');
      expect(complete.content).toContain('Salesforce');
      expect(complete.sources.length).toBe(1);
      expect(complete.sources[0]!.domain).toBe('hubspot.com');
    }
  });

  // Scenario 2: November 3 Question
  it('Scenario 2: Retrieves November 3 conversation from memory and verifies claims without searching memory', async () => {
    const range = parseTemporalDate('What did I ask you on 3 November?', 'UTC', REF_NOW);
    expect(range).not.toBeNull();
    expect(range!.start.toISOString().slice(0, 10)).toBe('2026-11-03');

    const sqlMemory: MemoryRetrievalResult = {
      recentContext: [],
      temporal: {
        range: { start: range!.start, end: range!.end, text: '3 November' },
        groups: [
          {
            conversationId: 'conv-sql',
            conversationTitle: 'Postgres vs MySQL',
            pairs: [
              {
                conversationId: 'conv-sql',
                userMessage: {
                  id: 'u-sql',
                  conversation_id: 'conv-sql',
                  role: 'user',
                  content: 'What is the difference between PostgreSQL and MySQL, and which one should I use for an AI-powered application?',
                  status: 'complete',
                  created_at: new Date('2026-11-14T02:00:00Z'),
                  event_date: new Date('2026-11-03T16:00:00Z'),
                },
                assistantMessage: {
                  id: 'a-sql',
                  conversation_id: 'conv-sql',
                  role: 'assistant',
                  content: 'PostgreSQL provides advanced SQL, JSONB, and vector extensions, while MySQL is widely used for standard web apps.',
                  status: 'complete',
                  created_at: new Date('2026-11-14T02:02:00Z'),
                  event_date: new Date('2026-11-03T16:02:00Z'),
                },
              },
            ],
          },
        ],
      },
      fts: [],
      memoryEmptySignal: false,
      timings: { totalMs: 1, recentMs: 0.3, temporalMs: 0.4, ftsMs: 0.3 },
    };

    const fakeLLM = new FakeLLMClient([
      { tokens: ['On November 3, you asked: "What is the difference between PostgreSQL and MySQL, and which one should I use for an AI-powered application?" My answer remains fully correct today. PostgreSQL remains the recommended choice for AI applications requiring structured data, JSONB, and vector extensions.'] },
    ]);
    const fakeSearch = new FakeSearchClient([]);
    const orchestrator = new AgentOrchestrator({ llmClient: fakeLLM, searchClient: fakeSearch });

    const events = await collectEvents(
      orchestrator.runTurn({
        ownerId: OWNER_ID,
        conversationId: CONV_ID,
        query: 'What did I ask you on 3 November? Is your answer still correct today?',
        memoryResult: sqlMemory,
        now: REF_NOW,
      })
    );

    // Memory was retrieved without web search tool
    expect(fakeSearch.recordedQueries.length).toBe(0);
    const complete = events.find((e) => e.type === 'complete');
    expect(complete).toBeDefined();
    if (complete && complete.type === 'complete') {
      expect(complete.content).toContain('What is the difference between PostgreSQL and MySQL');
      expect(complete.content).toContain('remains fully correct');
    }
  });

  // Scenario 3: PostgreSQL Hosting
  it('Scenario 3: Resolves last Tuesday to Nov 10, retrieves hosting options, and checks pricing', async () => {
    const range = parseTemporalDate('Last Tuesday I asked you about Postgres hosting', 'UTC', REF_NOW);
    expect(range).not.toBeNull();
    expect(range!.start.toISOString().slice(0, 10)).toBe('2026-11-10');

    const hostingMemory: MemoryRetrievalResult = {
      recentContext: [],
      temporal: {
        range: { start: range!.start, end: range!.end, text: 'Last Tuesday' },
        groups: [
          {
            conversationId: 'conv-pg',
            conversationTitle: 'Postgres Hosting',
            pairs: [
              {
                conversationId: 'conv-pg',
                userMessage: {
                  id: 'u-pg',
                  conversation_id: 'conv-pg',
                  role: 'user',
                  content: 'Compare managed PostgreSQL hosting options: Neon, Supabase, and Railway. What do their entry tiers cost?',
                  status: 'complete',
                  created_at: new Date('2026-11-14T02:00:00Z'),
                  event_date: new Date('2026-11-10T11:00:00Z'),
                },
                assistantMessage: {
                  id: 'a-pg',
                  conversation_id: 'conv-pg',
                  role: 'assistant',
                  content: 'Neon is $19/mo (Launch), Supabase is $25/mo (Pro), and Railway is $5/mo (Hobby base). You preferred Neon.',
                  status: 'complete',
                  created_at: new Date('2026-11-14T02:02:00Z'),
                  event_date: new Date('2026-11-10T11:02:00Z'),
                },
              },
            ],
          },
        ],
      },
      fts: [],
      memoryEmptySignal: false,
      timings: { totalMs: 1, recentMs: 0.3, temporalMs: 0.4, ftsMs: 0.3 },
    };

    const fakeLLM = new FakeLLMClient([
      { toolCall: { id: 'call_search_pg', name: 'web_search', arguments: '{"query":"Neon Supabase Railway Postgres pricing updates 2026"}' } },
      { tokens: ['Last Tuesday (November 10), we compared Neon ($19/mo), Supabase ($25/mo), and Railway ($5/mo). Based on current official documentation [1], Neon Launch remains $19/mo. Railway charges $5 base subscription plus resource usage, which is a different billing model.'] },
    ]);
    const fakeSearch = new FakeSearchClient([
      { id: 1, title: 'Neon Pricing', url: 'https://neon.tech/pricing', content: 'Launch plan is $19/month' },
    ]);
    const orchestrator = new AgentOrchestrator({ llmClient: fakeLLM, searchClient: fakeSearch });

    const events = await collectEvents(
      orchestrator.runTurn({
        ownerId: OWNER_ID,
        conversationId: CONV_ID,
        query: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since?',
        memoryResult: hostingMemory,
        now: REF_NOW,
      })
    );

    expect(fakeSearch.recordedQueries.length).toBe(1);
    const complete = events.find((e) => e.type === 'complete');
    expect(complete).toBeDefined();
    if (complete && complete.type === 'complete') {
      expect(complete.content).toContain('Neon');
      expect(complete.content).toContain('Supabase');
      expect(complete.content).toContain('Railway');
      expect(complete.sources[0]!.domain).toBe('neon.tech');
    }
  });
});
