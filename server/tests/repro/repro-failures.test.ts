import { describe, it, expect } from 'vitest';
import { AgentOrchestrator, type AgentEvent } from '../../src/agent/orchestrator.js';
import { FakeLLMClient } from '../../src/services/llm/openai.js';
import { FakeSearchClient, TavilySearchClient } from '../../src/services/search/tavily.js';
import { parseTemporalDate } from '../../src/services/memory/temporal.js';
import type { SearchResult } from '../../src/services/search/types.js';

async function collectEvents(generator: AsyncGenerator<AgentEvent, void, unknown>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of generator) {
    events.push(ev);
  }
  return events;
}

describe('Reproduction Suite: Critical Production Failures', () => {
  // Repro Bug A: Distinguishing created_at vs event_date
  describe('Bug A: Historical Date vs DB created_at Discrepancy', () => {
    it('demonstrates that created_at filtering misses messages discussed for a past date when created today', () => {
      const now = new Date('2026-11-14T10:00:00Z');
      const parsedRange = parseTemporalDate('What did I ask you on November 3, 2026?', 'UTC', now);

      expect(parsedRange).not.toBeNull();
      const start = parsedRange!.start.toISOString();
      const end = parsedRange!.end.toISOString();

      // Database message inserted today (Nov 14) but with historical topic of Nov 3
      const messageInsertedToday = {
        id: 'msg-1',
        content: 'Compare PostgreSQL and MySQL scalability',
        created_at: new Date('2026-11-14T02:00:00Z'), // DB insertion date
        event_date: new Date('2026-11-03T09:00:00Z'), // Event discussion date
      };

      // When querying with created_at, the message is NOT within [start, end)
      const matchesCreatedAt =
        messageInsertedToday.created_at.toISOString() >= start &&
        messageInsertedToday.created_at.toISOString() < end;

      expect(matchesCreatedAt).toBe(false);

      // But when querying against event_date, it correctly matches!
      const matchesEventDate =
        messageInsertedToday.event_date.toISOString() >= start &&
        messageInsertedToday.event_date.toISOString() < end;

      expect(matchesEventDate).toBe(true);
    });
  });

  // Repro Bug E: Malformed/Concatenated Tool-Call JSON
  describe('Bug E: Malformed / Concatenated Tool-Call JSON Arguments', () => {
    it('demonstrates failure when streaming yields duplicated JSON objects', () => {
      const concatenatedJson = '{"query":"CRM pricing updates"}{"query":"CRM pricing updates"}';

      // Standard JSON.parse throws SyntaxError on concatenated JSON
      expect(() => JSON.parse(concatenatedJson)).toThrow(SyntaxError);
    });
  });

  // Repro Bug D: Redundant/Duplicate Searches
  describe('Bug D: Redundant and Duplicate Searches in a Turn', () => {
    it('demonstrates that un-normalized queries trigger duplicate search calls without cache', async () => {
      const fakeSearch = new FakeSearchClient([
        { id: 1, title: 'CRM Pricing', url: 'https://example.com', content: 'Details' },
      ]);

      const q1 = '  crm pricing 2026  ';
      const q2 = 'crm pricing 2026';

      // Without normalization, these are seen as distinct queries
      expect(q1 === q2).toBe(false);
      expect(q1.trim().toLowerCase() === q2.trim().toLowerCase()).toBe(true);
    });
  });

  // Repro Bug C: Domain Prioritization & Aggregator Filtering
  describe('Bug C: Unfiltered Search Results Contain Aggregators & Quizzes', () => {
    it('demonstrates that unfiltered search returns SEO aggregators and quizzes', () => {
      const rawResults: SearchResult[] = [
        {
          id: 1,
          title: 'Wordle Answer and Dropee Quiz Today - Nov 3',
          url: 'https://quizdaily.xyz/dropee-nov-3',
          content: 'Here are the answers for todays cryptocurrency quiz and Wordle puzzle.',
        },
        {
          id: 2,
          title: 'PostgreSQL vs MySQL - Official Postgres Documentation',
          url: 'https://www.postgresql.org/docs/current/intro.html',
          content: 'PostgreSQL is a powerful, open-source object-relational database system.',
        },
      ];

      // Detect quiz / puzzle content mills
      const isQuizOrPuzzle = (r: SearchResult) =>
        /quiz|wordle|dropee|crossword|puzzle/i.test(r.title + ' ' + r.url + ' ' + r.content);

      expect(isQuizOrPuzzle(rawResults[0]!)).toBe(true);
      expect(isQuizOrPuzzle(rawResults[1]!)).toBe(false);
    });
  });
});
