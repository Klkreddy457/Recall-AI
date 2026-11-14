import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentOrchestrator } from '../../../server/src/agent/orchestrator.js';
import { FakeLLMClient } from '../../../server/src/services/llm/openai.js';
import { FakeSearchClient } from '../../../server/src/services/search/tavily.js';
import { MOCK_SEARCH_RESULTS } from '../fixtures/mock-search-results.js';
import { calculateCitationPrecision, calculateCitationCoverage } from '../metrics/accuracy.metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AccuracyTestResult {
  id: string;
  category: string;
  question: string;
  passed: boolean;
  emittedCitationsCount: number;
  validCitationsCount: number;
  actualContent: string;
  notes: string;
}

export async function runAccuracySuite(): Promise<{
  results: AccuracyTestResult[];
  passRate: number;
  total: number;
  passed: number;
  citationPrecision: number;
  citationCoverage: number;
}> {
  const jsonPath = path.resolve(__dirname, '../datasets/accuracy-tests.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const cases = JSON.parse(raw);

  const results: AccuracyTestResult[] = [];

  let totalCitationsEmitted = 0;
  let totalValidCitations = 0;
  let claimsRequiringCitation = 0;
  let claimsSupported = 0;

  for (const c of cases) {
    const requiresCitation = Boolean(c.requiresCitation);
    if (requiresCitation) claimsRequiringCitation++;

    // Prepare search results
    const searchResults = c.mockSearchKey ? MOCK_SEARCH_RESULTS[c.mockSearchKey] || [] : [];

    // Prepare response content
    let responseText = c.referenceFact;
    if (c.id === 'acc-20') {
      // Intentionally insert a phantom citation [99] into LLM response to test stripping
      responseText = 'Fastify is fast [1] and scalable [99].';
    }

    let fakeLLM: FakeLLMClient;
    if (searchResults.length > 0) {
      fakeLLM = new FakeLLMClient([
        {
          toolCall: {
            id: 'call_acc',
            name: 'web_search',
            arguments: JSON.stringify({ query: c.question }),
          },
        },
        { tokens: [responseText] },
      ]);
    } else {
      fakeLLM = new FakeLLMClient([{ tokens: [responseText] }]);
    }

    const fakeSearch = new FakeSearchClient(searchResults);
    const orchestrator = new AgentOrchestrator({
      llmClient: fakeLLM,
      searchClient: fakeSearch,
    });

    let actualContent = '';
    let sourcesCount = 0;

    for await (const ev of orchestrator.runTurn({
      ownerId: '00000000-0000-0000-0000-000000000001',
      conversationId: 'acc-eval',
      query: c.question,
    })) {
      if (ev.type === 'complete') {
        actualContent = ev.content;
        sourcesCount = ev.sources.length;
      }
    }

    // Inspect citations in output
    const citationMatches = [...actualContent.matchAll(/\[(\d+)\]/g)];
    const emittedCitationsCount = citationMatches.length;
    let validCitations = 0;

    for (const match of citationMatches) {
      totalCitationsEmitted++;
      const num = parseInt(match[1]!, 10);
      if (num >= 1 && num <= sourcesCount) {
        validCitations++;
        totalValidCitations++;
      }
    }

    if (requiresCitation && validCitations > 0) {
      claimsSupported++;
    }

    // Assertions
    let passed = true;
    const failures: string[] = [];

    // Check expected keywords
    if (c.expectedKeywords) {
      for (const kw of c.expectedKeywords) {
        if (!actualContent.toLowerCase().includes(kw.toLowerCase())) {
          passed = false;
          failures.push(`Missing expected keyword: "${kw}"`);
        }
      }
    }

    // Check forbidden keywords
    if (c.forbiddenKeywords) {
      for (const fkw of c.forbiddenKeywords) {
        if (actualContent.toLowerCase().includes(fkw.toLowerCase())) {
          passed = false;
          failures.push(`Contains forbidden hallucinated claim: "${fkw}"`);
        }
      }
    }

    // Check citation stripping in phantom citation test
    if (c.id === 'acc-20') {
      if (actualContent.includes('[99]')) {
        passed = false;
        failures.push('Failed to strip phantom citation [99]');
      }
      if (!actualContent.includes('[1]')) {
        passed = false;
        failures.push('Valid citation [1] was improperly stripped');
      }
    }

    // No search means no citations allowed
    if (!requiresCitation && emittedCitationsCount > 0) {
      passed = false;
      failures.push('Non-search turn emitted unsupported citations');
    }

    results.push({
      id: c.id,
      category: c.category,
      question: c.question,
      passed,
      emittedCitationsCount,
      validCitationsCount: validCitations,
      actualContent,
      notes: passed ? 'Accuracy and citation criteria met' : failures.join('; '),
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const passRate = Math.round((passedCount / results.length) * 100);
  const citationPrecision = calculateCitationPrecision(totalValidCitations, totalCitationsEmitted);
  const citationCoverage = calculateCitationCoverage(claimsSupported, claimsRequiringCitation);

  return {
    results,
    passRate,
    total: results.length,
    passed: passedCount,
    citationPrecision,
    citationCoverage,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running Answer Accuracy & Citation Evaluation Suite...\n');
  runAccuracySuite().then(({ results, passRate, total, passed, citationPrecision, citationCoverage }) => {
    console.log(`Summary: ${passed}/${total} passed (${passRate}%)`);
    console.log(`Citation Precision: ${citationPrecision * 100}%`);
    console.log(`Citation Coverage: ${citationCoverage * 100}%\n`);
    for (const r of results) {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.id} (${r.category}): ${r.notes}`);
    }
  });
}
