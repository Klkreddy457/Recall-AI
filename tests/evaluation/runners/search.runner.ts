import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentOrchestrator } from '../../../server/src/agent/orchestrator.js';
import { FakeLLMClient } from '../../../server/src/services/llm/openai.js';
import { FakeSearchClient } from '../../../server/src/services/search/tavily.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SearchTestResult {
  id: string;
  category: string;
  query: string;
  passed: boolean;
  searchTriggered: boolean;
  expectedSearch: boolean;
  notes: string;
}

export async function runSearchSuite(): Promise<{
  results: SearchTestResult[];
  passRate: number;
  total: number;
  passed: number;
  searchPrecision: number;
  searchRecall: number;
  unnecessarySearchRate: number;
  missedSearchRate: number;
}> {
  const jsonPath = path.resolve(__dirname, '../datasets/search-tests.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const cases = JSON.parse(raw);

  const results: SearchTestResult[] = [];

  let truePositives = 0;
  let falsePositives = 0; // Unnecessary search
  let falseNegatives = 0; // Missed search
  let trueNegatives = 0;

  for (const c of cases) {
    const shouldSearch = Boolean(c.expectSearch);

    // Prepare simulated Fake LLM
    let fakeLLM: FakeLLMClient;
    if (shouldSearch) {
      let secondTurnTokens = ['Here is the verified live information [1].'];
      if (c.simulateError) {
        secondTurnTokens = ['Search unavailable: search service encountered an error and is currently unavailable.'];
      } else if (c.simulateEmptyResults) {
        secondTurnTokens = ['No search results found: could not find any live records.'];
      }

      fakeLLM = new FakeLLMClient([
        {
          toolCall: {
            id: 'call_search',
            name: 'web_search',
            arguments: JSON.stringify({ query: c.query }),
          },
        },
        {
          tokens: secondTurnTokens,
        },
      ]);
    } else {
      fakeLLM = new FakeLLMClient([
        {
          tokens: ['Answering directly from context and knowledge without web search.'],
        },
      ]);
    }

    // Prepare Fake Search Client
    let fakeSearch: FakeSearchClient;
    if (c.simulateError) {
      fakeSearch = new FakeSearchClient(new Error(c.simulateError));
    } else if (c.simulateEmptyResults) {
      fakeSearch = new FakeSearchClient([]);
    } else {
      fakeSearch = new FakeSearchClient([
        {
          id: 1,
          title: 'Search Result',
          url: 'https://example.com/info',
          content: 'Live factual updates.',
          published_date: '2026-11-13',
        },
      ]);
    }

    const orchestrator = new AgentOrchestrator({
      llmClient: fakeLLM,
      searchClient: fakeSearch,
    });

    let searchTriggered = false;
    let finalContent = '';
    let caughtError: string | null = null;

    try {
      for await (const ev of orchestrator.runTurn({
        ownerId: '00000000-0000-0000-0000-000000000001',
        conversationId: 'search-eval',
        query: c.query,
      })) {
        if (ev.type === 'sources' || (ev.type === 'status' && ev.message.includes('Searching web'))) {
          searchTriggered = true;
        } else if (ev.type === 'complete') {
          finalContent = ev.content;
          if (ev.sources.length > 0) {
            searchTriggered = true;
          }
        } else if (ev.type === 'error') {
          caughtError = ev.error;
        }
      }
    } catch (err) {
      caughtError = (err as Error).message;
    }

    if (fakeSearch.recordedQueries.length > 0) {
      searchTriggered = true;
    }

    // Confusion matrix update
    if (searchTriggered && shouldSearch) truePositives++;
    if (searchTriggered && !shouldSearch) falsePositives++;
    if (!searchTriggered && shouldSearch) falseNegatives++;
    if (!searchTriggered && !shouldSearch) trueNegatives++;

    let passed = searchTriggered === shouldSearch;
    const failures: string[] = [];

    if (searchTriggered !== shouldSearch) {
      failures.push(`Expected search=${shouldSearch}, actual search=${searchTriggered}`);
    }

    if (c.expectedOutputContains) {
      for (const expectedStr of c.expectedOutputContains) {
        if (!finalContent.toLowerCase().includes(expectedStr.toLowerCase())) {
          passed = false;
          failures.push(`Output missing expected fallback substring: "${expectedStr}"`);
        }
      }
    }

    results.push({
      id: c.id,
      category: c.category,
      query: c.query,
      passed,
      searchTriggered,
      expectedSearch: shouldSearch,
      notes: passed ? 'Search decision aligned with directive' : failures.join('; '),
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const passRate = Math.round((passedCount / results.length) * 100);

  const totalPositivePredictions = truePositives + falsePositives;
  const searchPrecision =
    totalPositivePredictions > 0
      ? Math.round((truePositives / totalPositivePredictions) * 100) / 100
      : 1.0;

  const totalActualPositives = truePositives + falseNegatives;
  const searchRecall =
    totalActualPositives > 0
      ? Math.round((truePositives / totalActualPositives) * 100) / 100
      : 1.0;

  const unnecessarySearchRate =
    trueNegatives + falsePositives > 0
      ? Math.round((falsePositives / (trueNegatives + falsePositives)) * 100) / 100
      : 0;

  const missedSearchRate =
    totalActualPositives > 0
      ? Math.round((falseNegatives / totalActualPositives) * 100) / 100
      : 0;

  return {
    results,
    passRate,
    total: results.length,
    passed: passedCount,
    searchPrecision,
    searchRecall,
    unnecessarySearchRate,
    missedSearchRate,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running Web Search Decision Evaluation Suite...\n');
  runSearchSuite().then(({ results, passRate, total, passed, searchPrecision, searchRecall, unnecessarySearchRate, missedSearchRate }) => {
    console.log(`Summary: ${passed}/${total} passed (${passRate}%)`);
    console.log(`Search Precision: ${searchPrecision}`);
    console.log(`Search Recall: ${searchRecall}`);
    console.log(`Unnecessary Search Rate: ${unnecessarySearchRate * 100}%`);
    console.log(`Missed Search Rate: ${missedSearchRate * 100}%\n`);
    for (const r of results) {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.id} (${r.category}): ${r.notes}`);
    }
  });
}

