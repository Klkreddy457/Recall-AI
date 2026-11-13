import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { OpenAILLMClient, FakeLLMClient } from '../services/llm/openai.js';
import { TavilySearchClient, FakeSearchClient } from '../services/search/tavily.js';
import { config } from '../config/env.js';
import type { TurnTimings } from '../agent/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return Math.round((sorted[lower] ?? 0) * 100) / 100;
  }
  return Math.round(((sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight) * 100) / 100;
}

export async function runBenchmark(n = 20) {
  console.log(`Starting Recall AI benchmark (${n} iterations)...\n`);

  const hasLiveKeys = Boolean(config.OPENAI_API_KEY && config.TAVILY_API_KEY);

  let orchestrator: AgentOrchestrator;
  let modeDescription: string;

  if (hasLiveKeys) {
    modeDescription = 'LIVE PROVIDERS (Real OpenAI & Tavily APIs)';
    console.log(`Using: ${modeDescription}`);
    orchestrator = new AgentOrchestrator({
      llmClient: new OpenAILLMClient({
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_MODEL,
        baseURL: config.OPENAI_BASE_URL || undefined,
      }),
      searchClient: new TavilySearchClient({
        apiKey: config.TAVILY_API_KEY,
      }),
    });
  } else {
    modeDescription = 'MOCKED PROVIDER HARNESS (No API Keys configured in environment)';
    console.log(`Notice: Neither OPENAI_API_KEY nor TAVILY_API_KEY was provided.`);
    console.log(`Running benchmark in ${modeDescription} to measure local engine overhead.\n`);

    const fakeLLM = new FakeLLMClient([
      {
        toolCall: {
          id: 'bench_call',
          name: 'web_search',
          arguments: JSON.stringify({ query: 'Fastify performance benchmark' }),
        },
      },
      {
        tokens: ['Fastify ', 'is ', 'exceptionally ', 'fast ', 'and ', 'efficient [1].'],
      },
    ]);

    const fakeSearch = new FakeSearchClient([
      {
        id: 1,
        title: 'Fastify Benchmarks',
        url: 'https://fastify.dev/benchmarks',
        content: 'Fastify overhead is minimal under high throughput.',
        published_date: '2026-11-13',
      },
    ]);

    orchestrator = new AgentOrchestrator({
      llmClient: fakeLLM,
      searchClient: fakeSearch,
    });
  }

  const recordedTimings: TurnTimings[] = [];

  for (let i = 1; i <= n; i++) {
    process.stdout.write(`Turn ${i}/${n}... `);
    const turnStream = orchestrator.runTurn({
      ownerId: '00000000-0000-0000-0000-000000000001',
      conversationId: `bench-conv-${i}`,
      query: `Benchmark query turn #${i}: What is the latency profile of Fastify?`,
    });

    for await (const ev of turnStream) {
      if (ev.type === 'complete') {
        recordedTimings.push(ev.timings);
        console.log(`completed in ${ev.timings.totalMs}ms (TTFT: ${ev.timings.timeToFirstTokenMs}ms)`);
      } else if (ev.type === 'error') {
        console.log(`error: ${ev.error}`);
      }
    }
  }

  const ttfeList = recordedTimings.map((t) => t.timeToFirstEventMs ?? 0);
  const ttftList = recordedTimings.map((t) => t.timeToFirstTokenMs ?? 0);
  const totalList = recordedTimings.map((t) => t.totalMs);
  const memoryList = recordedTimings.map((t) => t.memoryMs);
  const searchList = recordedTimings.map((t) => t.searchMs);

  const stats = {
    mode: modeDescription,
    iterations: n,
    hasLiveKeys,
    ttfe: { p50: calculatePercentile(ttfeList, 50), p95: calculatePercentile(ttfeList, 95) },
    ttft: { p50: calculatePercentile(ttftList, 50), p95: calculatePercentile(ttftList, 95) },
    total: { p50: calculatePercentile(totalList, 50), p95: calculatePercentile(totalList, 95) },
    memory: { p50: calculatePercentile(memoryList, 50), p95: calculatePercentile(memoryList, 95) },
    search: { p50: calculatePercentile(searchList, 50), p95: calculatePercentile(searchList, 95) },
  };

  console.log('------------------------------------------------------------');
  console.log(`BENCHMARK RESULTS (${n} turns)`);
  console.log('------------------------------------------------------------');
  console.log(`Mode: ${stats.mode}`);
  console.log(`Time-to-first-event (TTFE): p50 = ${stats.ttfe.p50} ms | p95 = ${stats.ttfe.p95} ms`);
  console.log(`Time-to-first-token (TTFT): p50 = ${stats.ttft.p50} ms | p95 = ${stats.ttft.p95} ms`);
  console.log(`Memory retrieval time:     p50 = ${stats.memory.p50} ms | p95 = ${stats.memory.p95} ms`);
  console.log(`Web search latency:        p50 = ${stats.search.p50} ms | p95 = ${stats.search.p95} ms`);
  console.log(`Total turn duration:       p50 = ${stats.total.p50} ms | p95 = ${stats.total.p95} ms`);
  console.log('------------------------------------------------------------\n');

  // Write results to docs/benchmarks.md
  const docsDir = path.resolve(__dirname, '../../../docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const markdownContent = `# Recall AI Benchmark Report

Generated at: ${new Date().toISOString()}
Turns measured (N): ${n}
Mode: **${stats.mode}**

## Latency Summary

| Metric | p50 (Median) | p95 (95th Percentile) | Unit |
|---|---|---|---|
| **Time-to-First-Event (TTFE)** | ${stats.ttfe.p50} | ${stats.ttfe.p95} | ms |
| **Time-to-First-Token (TTFT)** | ${stats.ttft.p50} | ${stats.ttft.p95} | ms |
| **Memory Retrieval (A + B + C)** | ${stats.memory.p50} | ${stats.memory.p95} | ms |
| **Web Search Tool Latency** | ${stats.search.p50} | ${stats.search.p95} | ms |
| **Total Turn Duration** | ${stats.total.p50} | ${stats.total.p95} | ms |

## Honest Measurement Disclosure

${
  hasLiveKeys
    ? 'All numbers reported above reflect real network round-trips to OpenAI and Tavily.'
    : `> [!NOTE]
> **API Key Disclosure:** No external API keys (\`OPENAI_API_KEY\` or \`TAVILY_API_KEY\`) were present in the test environment during this run.
> 
> As mandated by **AGENTS.md** (*"Claim no performance number you did not measure. If something cannot run here, say so. Do not fake it"*), these numbers measure the **local engine overhead** (context building, citation stripping, state transitions, event stream dispatch) and **do NOT represent live OpenAI/Tavily network latencies**.
>
> ### To Run Live Paid Benchmarks:
> 1. Set \`OPENAI_API_KEY=your_key\` and \`TAVILY_API_KEY=your_key\` in \`.env\`.
> 2. Run:
>    \`\`\`bash
>    npm run bench
>    \`\`\`
> 3. The script will measure live external API round-trips and update this file.`
}
`;

  fs.writeFileSync(path.join(docsDir, 'benchmarks.md'), markdownContent, 'utf-8');
  console.log(`Benchmark written to docs/benchmarks.md`);

  return stats;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const n = parseInt(process.env.BENCH_N || '10', 10);
  runBenchmark(n).catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}

