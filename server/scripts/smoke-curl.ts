import { buildApp } from '../src/app.js';
import { AgentOrchestrator } from '../src/agent/orchestrator.js';
import { FakeLLMClient } from '../src/services/llm/openai.js';
import { FakeSearchClient } from '../src/services/search/tavily.js';
import type { Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runCurlSmokeTest() {
  const fakeLLM = new FakeLLMClient([
    { tokens: ['Tokens ', 'streamed ', 'successfully ', 'over ', 'SSE!'] },
  ]);
  const fakeSearch = new FakeSearchClient([]);

  const orchestrator = new AgentOrchestrator({
    llmClient: fakeLLM,
    searchClient: fakeSearch,
  });

  const dummyPool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => {},
    }),
    end: async () => {},
  } as unknown as Pool;

  const app = await buildApp({
    pool: dummyPool,
    orchestrator,
    logger: false,
    configOverrides: { PORT: 3099 },
  });

  await app.listen({ port: 3099, host: '127.0.0.1' });
  console.log('Smoke server listening on 127.0.0.1:3099');

  try {
    const curlCommand = `curl.exe -s -N -X POST http://127.0.0.1:3099/api/chat -H "Content-Type: application/json" -H "x-owner-id: 00000000-0000-0000-0000-000000000001" -d "{\\"message\\":\\"Test streaming\\"}"`;
    console.log(`Executing: ${curlCommand}`);
    const { stdout: curlOutput } = await execAsync(curlCommand);
    console.log('\n--- CURL OUTPUT START ---');
    console.log(curlOutput);
    console.log('--- CURL OUTPUT END ---');
  } finally {
    await app.close();
  }
}

runCurlSmokeTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Smoke test failed:', err);
    process.exit(1);
  });

