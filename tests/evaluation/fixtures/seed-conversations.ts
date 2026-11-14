export interface SeedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string; // ISO 8601 UTC
}

export interface SeedConversation {
  id: string;
  title: string;
  ownerId: string;
  summary?: string;
  keyEntities?: string[];
  messages: SeedMessage[];
}

export const EVAL_OWNER_ID = '00000000-0000-0000-0000-000000000001';
export const ISOLATED_OWNER_ID = '00000000-0000-0000-0000-000000000002';

export const SEED_CONVERSATIONS: SeedConversation[] = [
  {
    id: 'conv-a-1010',
    title: 'RAG and Vector Databases',
    ownerId: EVAL_OWNER_ID,
    summary: 'Discussion of Retrieval-Augmented Generation, vector databases, pgvector, Qdrant, Milvus, and Pinecone.',
    keyEntities: ['RAG', 'database', 'vector search', 'pgvector', 'Qdrant', 'Milvus', 'Pinecone'],
    messages: [
      {
        id: 'msg-a-1',
        role: 'user',
        content: 'What is Retrieval-Augmented Generation?',
        created_at: '2026-10-10T10:00:00.000Z',
      },
      {
        id: 'msg-a-2',
        role: 'assistant',
        content: 'RAG combines retrieval of external knowledge with language model generation to provide accurate facts.',
        created_at: '2026-10-10T10:01:00.000Z',
      },
      {
        id: 'msg-a-3',
        role: 'user',
        content: 'What databases support vector search?',
        created_at: '2026-10-10T10:05:00.000Z',
      },
      {
        id: 'msg-a-4',
        role: 'assistant',
        content: 'Databases that support vector search include PostgreSQL with pgvector, Qdrant, Milvus, and Pinecone.',
        created_at: '2026-10-10T10:06:00.000Z',
      },
    ],
  },
  {
    id: 'conv-b-1011',
    title: 'PostgreSQL FTS vs Vector Search',
    ownerId: EVAL_OWNER_ID,
    summary: 'Comparison between PostgreSQL database full-text search (tsvector) and semantic vector search engines.',
    keyEntities: ['PostgreSQL', 'database', 'FTS', 'tsvector', 'vector search'],
    messages: [
      {
        id: 'msg-b-1',
        role: 'user',
        content: 'Compare PostgreSQL FTS and vector search.',
        created_at: '2026-10-11T11:00:00.000Z',
      },
      {
        id: 'msg-b-2',
        role: 'assistant',
        content: 'PostgreSQL FTS uses lexical matching via tsvector and tsquery, while vector search uses high-dimensional embeddings for semantic similarity.',
        created_at: '2026-10-11T11:02:00.000Z',
      },
    ],
  },
  {
    id: 'conv-c-1012',
    title: 'Agentic AI Systems',
    ownerId: EVAL_OWNER_ID,
    summary: 'Definition and architecture of Agentic AI, autonomous planning, and multi-step tool calls.',
    keyEntities: ['Agentic AI', 'autonomous', 'planning', 'tools'],
    messages: [
      {
        id: 'msg-c-1',
        role: 'user',
        content: 'What is Agentic AI?',
        created_at: '2026-10-12T09:00:00.000Z',
      },
      {
        id: 'msg-c-2',
        role: 'assistant',
        content: 'Agentic AI refers to autonomous systems capable of planning, executing multi-step tool calls, and adapting to dynamic environments.',
        created_at: '2026-10-12T09:02:00.000Z',
      },
    ],
  },
  // Isolated owner data for security and multi-tenant testing
  {
    id: 'conv-secret-user2',
    title: 'Confidential Strategy of User 2',
    ownerId: ISOLATED_OWNER_ID,
    messages: [
      {
        id: 'msg-sec-1',
        role: 'user',
        content: 'My secret token is ALPHA-OMEGA-999 and private revenue is $12M.',
        created_at: '2026-10-11T12:00:00.000Z',
      },
      {
        id: 'msg-sec-2',
        role: 'assistant',
        content: 'I have recorded your private token and revenue information.',
        created_at: '2026-10-11T12:01:00.000Z',
      },
    ],
  },
];

