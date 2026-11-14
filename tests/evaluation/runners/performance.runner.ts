import { AgentOrchestrator } from '../../../server/src/agent/orchestrator.js';
import { FakeLLMClient } from '../../../server/src/services/llm/openai.js';
import { FakeSearchClient } from '../../../server/src/services/search/tavily.js';
import { computeLatencyDistribution, type LatencyDistribution } from '../metrics/latency.metrics.js';

export interface PerformanceProfileResult {
  profile: string;
  description: string;
  iterations: number;
  ttfe: LatencyDistribution;
  ttft: LatencyDistribution;
  memory: LatencyDistribution;
  search: LatencyDistribution;
  total: LatencyDistribution;
}

export async function runPerformanceSuite(iterationsPerProfile = 10): Promise<{
  profiles: PerformanceProfileResult[];
  overallTotalLatency: LatencyDistribution;
}> {
  const profilesConfig = [
    {
      id: 'A',
      name: 'Basic Question (No Search, No Memory)',
      query: 'What is a binary search tree?',
      hasSearch: false,
      hasMemory: false,
    },
    {
      id: 'B',
      name: 'Memory Retrieval Query',
      query: 'What was my initial database constraint?',
      hasSearch: false,
      hasMemory: true,
    },
    {
      id: 'C',
      name: 'Live Web Search Query',
      query: 'What is the latest release of Fastify?',
      hasSearch: true,
      hasMemory: false,
    },
    {
      id: 'D',
      name: 'Combined Memory + Search Query',
      query: 'Which databases did we discuss earlier? Find their latest updates.',
      hasSearch: true,
      hasMemory: true,
    },
    {
      id: 'E',
      name: 'Long Conversation Context Query',
      query: 'Summarize all 10 points we discussed across our turns.',
      hasSearch: false,
      hasMemory: true,
      longContext: true,
    },
  ];

  const profileResults: PerformanceProfileResult[] = [];
  const allTotalLatencies: number[] = [];

  for (const prof of profilesConfig) {
    const ttfeList: number[] = [];
    const ttftList: number[] = [];
    const memList: number[] = [];
    const searchList: number[] = [];
    const totalList: number[] = [];

    // Setup Mocked Fast Agent
    const fakeLLM = new FakeLLMClient(
      prof.hasSearch
        ? [
            {
              toolCall: {
                id: 'call_perf',
                name: 'web_search',
                arguments: JSON.stringify({ query: prof.query }),
              },
            },
            { tokens: ['Fast ', 'streaming ', 'benchmark ', 'response [1].'] },
          ]
        : [{ tokens: ['Instant ', 'in-memory ', 'response.'] }]
    );

    const fakeSearch = new FakeSearchClient([
      {
        id: 1,
        title: 'Benchmark Page',
        url: 'https://fastify.dev/benchmark',
        content: 'Benchmark details',
        published_date: '2026-11-13',
      },
    ]);

    const orchestrator = new AgentOrchestrator({
      llmClient: fakeLLM,
      searchClient: fakeSearch,
    });

    const recentContext = prof.longContext
      ? Array.from({ length: 10 }).map((_, idx) => ({
          id: `msg-${idx}`,
          conversation_id: 'perf-conv',
          role: idx % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: `Historical turn ${idx} discussing architecture, constraints, and latency profiles.`,
          status: 'complete',
          created_at: new Date(Date.now() - (10 - idx) * 60000),
          sources_json: null,
          search_metadata: null,
        }))
      : [];

    for (let i = 0; i < iterationsPerProfile; i++) {
      fakeLLM.setScript(
        prof.hasSearch
          ? [
              {
                toolCall: {
                  id: 'call_perf',
                  name: 'web_search',
                  arguments: JSON.stringify({ query: prof.query }),
                },
              },
              { tokens: ['Fast ', 'streaming ', 'benchmark ', 'response [1].'] },
            ]
          : [{ tokens: ['Instant ', 'in-memory ', 'response.'] }]
      );

      for await (const ev of orchestrator.runTurn({
        ownerId: '00000000-0000-0000-0000-000000000001',
        conversationId: `perf-conv-${prof.id}-${i}`,
        query: prof.query,
        memoryResult: {
          recentContext,
          temporal: null,
          fts: prof.hasMemory
            ? [
                {
                  conversationId: 'perf-conv',
                  conversationTitle: 'Historical Session',
                  userMessage: {
                    id: 'm-u',
                    conversation_id: 'perf-conv',
                    role: 'user',
                    content: 'Our database constraint is zero vector databases.',
                    status: 'complete',
                    created_at: new Date(),
                    sources_json: null,
                    search_metadata: null,
                  },
                },
              ]
            : [],
          memoryEmptySignal: false,
          timings: { totalMs: prof.hasMemory ? 0.05 : 0, recentMs: 0.02, temporalMs: 0.01, ftsMs: 0.02 },
        },
      })) {
        if (ev.type === 'complete') {
          ttfeList.push(ev.timings.timeToFirstEventMs ?? 0);
          ttftList.push(ev.timings.timeToFirstTokenMs ?? 0);
          memList.push(ev.timings.memoryMs);
          searchList.push(ev.timings.searchMs);
          totalList.push(ev.timings.totalMs);
          allTotalLatencies.push(ev.timings.totalMs);
        }
      }
    }

    profileResults.push({
      profile: prof.id,
      description: prof.name,
      iterations: iterationsPerProfile,
      ttfe: computeLatencyDistribution(ttfeList),
      ttft: computeLatencyDistribution(ttftList),
      memory: computeLatencyDistribution(memList),
      search: computeLatencyDistribution(searchList),
      total: computeLatencyDistribution(totalList),
    });
  }

  return {
    profiles: profileResults,
    overallTotalLatency: computeLatencyDistribution(allTotalLatencies),
  };
}

if (process.argv[1] === import.meta.url) {
  console.log('Running Performance Benchmarking Suite...\n');
  runPerformanceSuite(10).then(({ profiles, overallTotalLatency }) => {
    console.log(`Overall Engine Latency: p50=${overallTotalLatency.p50}ms | p95=${overallTotalLatency.p95}ms | avg=${overallTotalLatency.avg}ms\n`);
    for (const p of profiles) {
      console.log(`Profile ${p.profile} (${p.description}):`);
      console.log(`  Total:  p50=${p.total.p50}ms | p95=${p.total.p95}ms`);
      console.log(`  TTFE:   p50=${p.ttfe.p50}ms | p95=${p.ttfe.p95}ms`);
      console.log(`  TTFT:   p50=${p.ttft.p50}ms | p95=${p.ttft.p95}ms`);
    }
  });
}
