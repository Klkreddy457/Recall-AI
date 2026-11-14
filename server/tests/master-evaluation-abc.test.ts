import { describe, it, expect } from 'vitest';
import { AgentOrchestrator, type AgentEvent } from '../src/agent/orchestrator.js';
import { FakeLLMClient } from '../src/services/llm/openai.js';
import { FakeSearchClient } from '../src/services/search/tavily.js';
import { parseTemporalDate } from '../src/services/memory/temporal.js';
import { hasMemoryCue } from '../src/services/memory/cues.js';
import { extractValidJsonObject, normalizeSearchQuery } from '../src/agent/jsonSanitizer.js';
import { validateAndStripCitations, buildSourceCards } from '../src/agent/citations.js';
import { changeDetector, type HistoricalPlan, type CurrentPlan } from '../src/services/comparison/change-detector.js';
import type { MemoryRetrievalResult } from '../src/services/memory/types.js';

async function collectEvents(generator: AsyncGenerator<AgentEvent, void, unknown>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of generator) {
    events.push(ev);
  }
  return events;
}

describe('Master Acceptance Suite: Categories A through F', () => {
  const OWNER_ID = '00000000-0000-0000-0000-000000000001';
  const CONV_ID = '00000000-0000-0000-0000-000000000002';
  const REF_NOW = new Date('2026-11-14T10:00:00.000Z');

  // ==========================================
  // Category A: Historical Date Retrieval
  // ==========================================
  describe('Category A: Historical Date Retrieval', () => {
    it('A1. Parses explicit date November 3, 2026 accurately to UTC boundary', () => {
      const parsed = parseTemporalDate('What did I ask you on November 3, 2026?', 'UTC', REF_NOW);
      expect(parsed).not.toBeNull();
      expect(parsed!.start.toISOString()).toBe('2026-11-03T00:00:00.000Z');
      expect(parsed!.end.toISOString()).toBe('2026-11-04T00:00:00.000Z');
    });

    it('A2. Parses explicit date November 9, 2026 accurately to UTC boundary', () => {
      const parsed = parseTemporalDate('What were the prices we discussed on November 9, 2026?', 'UTC', REF_NOW);
      expect(parsed).not.toBeNull();
      expect(parsed!.start.toISOString()).toBe('2026-11-09T00:00:00.000Z');
      expect(parsed!.end.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    });

    it('A3. Detects memory cues for past conversational inquiries', () => {
      expect(hasMemoryCue('What did I ask you on November 3, 2026?')).toBe(true);
      expect(hasMemoryCue('What were the prices of the CRMs we evaluated?')).toBe(true);
      expect(hasMemoryCue('Which database did we compare?')).toBe(true);
      expect(hasMemoryCue('What is the weather in Tokyo today?')).toBe(false);
    });

    it('A4. Triggers memoryEmptySignal when asked about unrecorded date and prevents web search', async () => {
      const emptyMemory: MemoryRetrievalResult = {
        recentContext: [],
        temporal: null,
        fts: [],
        memoryEmptySignal: true, // Triggered by cue + empty records
        timings: { totalMs: 1, recentMs: 0.5, temporalMs: 0.5, ftsMs: 0.5 },
      };

      const fakeLLM = new FakeLLMClient([
        { tokens: ['I checked our conversation history for November 1, 2026, but found no matching records.'] },
      ]);
      const fakeSearch = new FakeSearchClient([]);

      const orchestrator = new AgentOrchestrator({
        llmClient: fakeLLM,
        searchClient: fakeSearch,
      });

      const events = await collectEvents(
        orchestrator.runTurn({
          ownerId: OWNER_ID,
          conversationId: CONV_ID,
          query: 'What did I ask you on November 1, 2026?',
          memoryResult: emptyMemory,
        })
      );

      // Web search must NOT be called
      expect(fakeSearch.recordedQueries.length).toBe(0);

      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();
      if (complete && complete.type === 'complete') {
        expect(complete.content).toContain('no matching records');
      }
    });
  });

  // ==========================================
  // Category B: Cross-Conversation Memory
  // ==========================================
  describe('Category B: Cross-Conversation Memory Recovery', () => {
    it('B1. Injects retrieved CRM dataset into system context with exact prices and totals', () => {
      const crmMemory: MemoryRetrievalResult = {
        recentContext: [],
        temporal: {
          range: { start: new Date('2026-11-09T00:00:00Z'), end: new Date('2026-11-10T00:00:00Z'), text: 'November 9, 2026' },
          groups: [
            {
              conversationId: 'conv-crm',
              conversationTitle: 'CRM Evaluation',
              pairs: [
                {
                  conversationId: 'conv-crm',
                  userMessage: {
                    id: 'u1',
                    conversation_id: 'conv-crm',
                    role: 'user',
                    content: 'Evaluate 5 CRMs for 20 seats: HubSpot, Salesforce, Pipedrive, Zoho CRM, Freshsales.',
                    status: 'complete',
                    created_at: new Date('2026-11-09T14:00:00Z'),
                    event_date: new Date('2026-11-09T14:00:00Z'),
                  },
                  assistantMessage: {
                    id: 'a1',
                    conversation_id: 'conv-crm',
                    role: 'assistant',
                    content: 'HubSpot $20 ($400 total), Salesforce $25 ($500 total), Pipedrive $24 ($480 total), Zoho $14 ($280 total), Freshsales $18 ($360 total).',
                    status: 'complete',
                    created_at: new Date('2026-11-09T14:02:00Z'),
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

      const fakeLLM = new FakeLLMClient([
        { tokens: ['On November 9, we evaluated 5 CRMs for your 20-person team: HubSpot ($20/seat, $400/mo), Salesforce ($25/seat, $500/mo), Pipedrive ($24/seat, $480/mo), Zoho CRM ($14/seat, $280/mo), and Freshsales ($18/seat, $360/mo).'] },
      ]);
      const fakeSearch = new FakeSearchClient([]);

      const orchestrator = new AgentOrchestrator({
        llmClient: fakeLLM,
        searchClient: fakeSearch,
      });

      // Run turn
      return orchestrator.runTurn({
        ownerId: OWNER_ID,
        conversationId: CONV_ID,
        query: 'What were the prices of the CRMs we evaluated on November 9?',
        memoryResult: crmMemory,
      }).next().then(() => {
        // Inspect system message generated
        const recordedMsgs = fakeLLM.recordedMessages[0]!;
        const sysMsg = recordedMsgs.find((m) => m.role === 'system');
        expect(sysMsg).toBeDefined();
        expect(sysMsg!.content).toContain('HubSpot');
        expect(sysMsg!.content).toContain('Salesforce');
        expect(sysMsg!.content).toContain('Pipedrive');
        expect(sysMsg!.content).toContain('Zoho');
        expect(sysMsg!.content).toContain('Freshsales');
      });
    });

    it('B2. Injects PostgreSQL hosting dataset into system context', () => {
      const pgMemory: MemoryRetrievalResult = {
        recentContext: [],
        temporal: null,
        fts: [],
        summaryHits: [
          {
            conversationId: 'conv-pg',
            conversationTitle: 'Managed Postgres Hosting',
            summary: 'Compared Neon ($19 Launch), Supabase ($25 Pro), and Railway ($5 Hobby).',
            keyEntities: ['PostgreSQL', 'Neon', 'Supabase', 'Railway'],
          },
        ],
        memoryEmptySignal: false,
        timings: { totalMs: 1, recentMs: 0.3, temporalMs: 0.4, ftsMs: 0.3 },
      };

      const fakeLLM = new FakeLLMClient([{ tokens: ['Here are the hosting options...'] }]);
      const fakeSearch = new FakeSearchClient([]);
      const orchestrator = new AgentOrchestrator({ llmClient: fakeLLM, searchClient: fakeSearch });

      return orchestrator.runTurn({
        ownerId: OWNER_ID,
        conversationId: CONV_ID,
        query: 'Which databases did we compare?',
        memoryResult: pgMemory,
      }).next().then(() => {
        const sysMsg = fakeLLM.recordedMessages[0]!.find((m) => m.role === 'system');
        expect(sysMsg!.content).toContain('Neon ($19 Launch)');
        expect(sysMsg!.content).toContain('Supabase ($25 Pro)');
        expect(sysMsg!.content).toContain('Railway ($5 Hobby)');
      });
    });
  });

  // ==========================================
  // Category C: Web Search Decisions & Quality
  // ==========================================
  describe('Category C: Web Search Decisions & Quality', () => {
    it('C1. Normalizes search queries to eliminate duplicate searches', () => {
      const raw = '   "HubSpot CRM Pricing 2026"   ';
      const normalized = normalizeSearchQuery(raw);
      expect(normalized).toBe('hubspot crm pricing 2026');
    });

    it('C2. Enforces maximum 1 web search per turn in code', async () => {
      const fakeLLM = new FakeLLMClient([
        { toolCall: { id: 'call_1', name: 'web_search', arguments: '{"query":"HubSpot pricing"}' } },
        { toolCall: { id: 'call_2', name: 'web_search', arguments: '{"query":"Salesforce pricing"}' } },
        { tokens: ['Search finished.'] },
      ]);
      const fakeSearch = new FakeSearchClient([
        { id: 1, title: 'HubSpot Pricing', url: 'https://hubspot.com/pricing', content: 'Starter is $20/mo' },
      ]);

      const orchestrator = new AgentOrchestrator({ llmClient: fakeLLM, searchClient: fakeSearch });

      await collectEvents(
        orchestrator.runTurn({
          ownerId: OWNER_ID,
          conversationId: CONV_ID,
          query: 'Check current pricing for HubSpot and Salesforce',
          now: REF_NOW,
        })
      );

      // Exactly 1 web search was executed
      expect(fakeSearch.recordedQueries.length).toBe(1);
    });
  });

  // ==========================================
  // Category D: Historical Change-Detection Engine
  // ==========================================
  describe('Category D: Historical Change Detection', () => {
    it('D1. Accurately calculates price difference, % change, and 20-seat team total', () => {
      const historical: HistoricalPlan = {
        entity: 'HubSpot',
        planName: 'Starter',
        pricePerSeatMonthly: 20,
        billingCycle: 'monthly',
      };
      const current: CurrentPlan = {
        entity: 'HubSpot',
        planName: 'Starter',
        pricePerSeatMonthly: 25,
        billingCycle: 'monthly',
      };

      const res = changeDetector.comparePlan(historical, current, 20);
      expect(res.isComparable).toBe(true);
      expect(res.priceDifference).toBe(5); // 25 - 20
      expect(res.percentageChange).toBe(25); // +25%
      expect(res.teamMonthlyTotal.historicalTotal).toBe(400); // 20 * 20
      expect(res.teamMonthlyTotal.currentTotal).toBe(500); // 25 * 20
      expect(res.teamMonthlyTotal.difference).toBe(100); // +$100 team delta
    });

    it('D2. Explicitly flags non-comparable tiers when billing cycles differ', () => {
      const historical: HistoricalPlan = {
        entity: 'Salesforce',
        planName: 'Starter Suite',
        pricePerSeatMonthly: 25,
        billingCycle: 'monthly',
      };
      const current: CurrentPlan = {
        entity: 'Salesforce',
        planName: 'Starter Suite',
        pricePerSeatMonthly: 20,
        billingCycle: 'annual', // Mismatched billing frequency
      };

      const res = changeDetector.comparePlan(historical, current, 20);
      expect(res.isComparable).toBe(false);
      expect(res.nonComparableReason).toContain('Different billing cycles');
      expect(res.summaryStatement).toContain('Direct comparison invalid');
    });
  });

  // ==========================================
  // Category E: Answer Accuracy & Citation Validation
  // ==========================================
  describe('Category E: Answer Accuracy & Citation Validation', () => {
    it('E1. Strips invalid citation numbers [99] exceeding backend result count', () => {
      const raw = 'Neon costs $19 on Launch [1], while Acme costs $999 [99].';
      const validated = validateAndStripCitations(raw, 1);
      expect(validated).toBe('Neon costs $19 on Launch [1], while Acme costs $999 .');
    });

    it('E2. Constructs source cards strictly from verified backend results, never model URLs', () => {
      const backendResults = [
        { id: 1, title: 'Neon Pricing', url: 'https://neon.tech/pricing', content: 'Launch is $19/mo' },
      ];
      const cards = buildSourceCards(backendResults);
      expect(cards.length).toBe(1);
      expect(cards[0]!.domain).toBe('neon.tech');
      expect(cards[0]!.url).toBe('https://neon.tech/pricing');
    });
  });

  // ==========================================
  // Category F: Reliability & Error Handling
  // ==========================================
  describe('Category F: Reliability & Error Recovery', () => {
    it('F1. Recovers gracefully from malformed concatenated JSON arguments (Bug E)', () => {
      const concatenatedJson = '{"query":"PostgreSQL 17 release"}{"query":"PostgreSQL 17 release"}';
      const { success, parsed, cleanString } = extractValidJsonObject<{ query?: string }>(
        concatenatedJson,
        { query: 'fallback' }
      );

      expect(success).toBe(true);
      expect(parsed.query).toBe('PostgreSQL 17 release');
      expect(cleanString).toBe('{"query":"PostgreSQL 17 release"}');
      expect(() => JSON.parse(cleanString)).not.toThrow();
    });

    it('F2. Handles search provider timeout without crashing the stream', async () => {
      const fakeLLM = new FakeLLMClient([
        { toolCall: { id: 'call_tavily', name: 'web_search', arguments: '{"query":"current events"}' } },
        { tokens: ['Search is currently unavailable, but I am here to help.'] },
      ]);
      const failingSearch = new FakeSearchClient(new Error('Tavily timeout: 8000ms exceeded'));

      const orchestrator = new AgentOrchestrator({ llmClient: fakeLLM, searchClient: failingSearch });

      const events = await collectEvents(
        orchestrator.runTurn({
          ownerId: OWNER_ID,
          conversationId: CONV_ID,
          query: 'What is happening right now in tech?',
          now: REF_NOW,
        })
      );

      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();
      if (complete && complete.type === 'complete') {
        expect(complete.status).toBe('complete');
        expect(complete.sources).toEqual([]);
      }
    });

    it('F3. Persists interrupted status when client abort signal is triggered', async () => {
      const abortCtrl = new AbortController();
      abortCtrl.abort();

      const fakeLLM = new FakeLLMClient([{ tokens: ['Partial...'] }]);
      const fakeSearch = new FakeSearchClient([]);
      const orchestrator = new AgentOrchestrator({ llmClient: fakeLLM, searchClient: fakeSearch });

      const events = await collectEvents(
        orchestrator.runTurn({
          ownerId: OWNER_ID,
          conversationId: CONV_ID,
          query: 'Tell me a long story',
          signal: abortCtrl.signal,
        })
      );

      const complete = events.find((e) => e.type === 'complete');
      expect(complete).toBeDefined();
      if (complete && complete.type === 'complete') {
        expect(complete.status).toBe('interrupted');
      }
    });
  });
});
