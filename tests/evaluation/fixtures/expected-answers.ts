export interface ReferenceFact {
  id: string;
  category: string;
  question: string;
  expectedKeywords: string[];
  forbiddenKeywords?: string[];
  requiresSearch: boolean;
  requiresMemory: boolean;
  temporalDate?: string;
}

export const REFERENCE_FACTS: ReferenceFact[] = [
  {
    id: 'fact-1',
    category: 'stable_factual',
    question: 'What is the capital of France?',
    expectedKeywords: ['Paris'],
    requiresSearch: false,
    requiresMemory: false,
  },
  {
    id: 'fact-2',
    category: 'stable_factual',
    question: 'What is a prime number?',
    expectedKeywords: ['greater than 1', 'divisible only by 1 and itself'],
    requiresSearch: false,
    requiresMemory: false,
  },
  {
    id: 'fact-3',
    category: 'technical_explanation',
    question: 'Explain how PostgreSQL tsvector works.',
    expectedKeywords: ['lexeme', 'sorted', 'stemming', 'full-text'],
    requiresSearch: false,
    requiresMemory: false,
  },
  {
    id: 'fact-4',
    category: 'unsupported_memory',
    question: 'Did we discuss quantum computing yesterday?',
    expectedKeywords: ['could not find', 'no matching records'],
    requiresSearch: false,
    requiresMemory: true,
  },
  {
    id: 'fact-5',
    category: 'current_events',
    question: 'What is the current version and latest feature of Fastify?',
    expectedKeywords: ['Fastify'],
    requiresSearch: true,
    requiresMemory: false,
  },
];
