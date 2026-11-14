export interface SeedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string; // ISO 8601 UTC
  event_date?: string; // Explicit discussion event date
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
  // Dataset A: CRM Comparison (November 9, 2026)
  {
    id: 'conv-dataset-a-crm',
    title: 'CRM Evaluation and Team Pricing',
    ownerId: EVAL_OWNER_ID,
    summary: 'Evaluation of 5 CRMs: HubSpot ($20/seat), Salesforce ($25/seat), Pipedrive ($24/seat), Zoho CRM ($14/seat), and Freshsales ($18/seat) for a team of 20 seats.',
    keyEntities: ['CRM', 'HubSpot', 'Salesforce', 'Pipedrive', 'Zoho', 'Freshsales', 'pricing'],
    messages: [
      {
        id: 'msg-crm-1',
        role: 'user',
        content: 'We need to evaluate 5 CRMs for our 20-person sales team: HubSpot, Salesforce, Pipedrive, Zoho CRM, and Freshsales. What are their monthly per-seat prices?',
        created_at: '2026-11-09T14:00:00.000Z',
        event_date: '2026-11-09T14:00:00.000Z',
      },
      {
        id: 'msg-crm-2',
        role: 'assistant',
        content: 'Here are the monthly per-seat prices for the 5 CRMs:\n- HubSpot (Starter): $20/seat/month ($400 total for 20 seats)\n- Salesforce (Starter Suite): $25/seat/month ($500 total for 20 seats)\n- Pipedrive (Essential): $24/seat/month ($480 total for 20 seats)\n- Zoho CRM (Standard): $14/seat/month ($280 total for 20 seats)\n- Freshsales (Growth): $18/seat/month ($360 total for 20 seats)',
        created_at: '2026-11-09T14:02:00.000Z',
        event_date: '2026-11-09T14:02:00.000Z',
      },
    ],
  },
  // Dataset B: PostgreSQL Hosting (November 10, 2026)
  {
    id: 'conv-dataset-b-pg',
    title: 'Managed PostgreSQL Hosting Comparison',
    ownerId: EVAL_OWNER_ID,
    summary: 'Comparison of 3 managed PostgreSQL hosting options: Neon ($19/mo Launch), Supabase ($25/mo Pro), and Railway ($5/mo Hobby).',
    keyEntities: ['PostgreSQL', 'database', 'Neon', 'Supabase', 'Railway', 'hosting', 'pricing'],
    messages: [
      {
        id: 'msg-pg-1',
        role: 'user',
        content: 'Compare managed PostgreSQL hosting options: Neon, Supabase, and Railway. What do their entry tiers cost?',
        created_at: '2026-11-10T11:00:00.000Z',
        event_date: '2026-11-10T11:00:00.000Z',
      },
      {
        id: 'msg-pg-2',
        role: 'assistant',
        content: 'The 3 managed PostgreSQL hosting providers offer the following:\n- Neon: $19/month on Launch plan (serverless Postgres with instant branching)\n- Supabase: $25/month on Pro plan (integrated Auth, Storage, and Realtime)\n- Railway: $5/month base on Hobby plan (flexible container and database platform)',
        created_at: '2026-11-10T11:02:00.000Z',
        event_date: '2026-11-10T11:02:00.000Z',
      },
    ],
  },
  // Dataset C: PostgreSQL vs MySQL Scalability (November 3, 2026)
  {
    id: 'conv-dataset-c-mysql',
    title: 'PostgreSQL vs MySQL Scalability and Concurrency',
    ownerId: EVAL_OWNER_ID,
    summary: 'Deep dive into PostgreSQL vs MySQL architecture, high concurrency scaling, JSONB indexing, and replication strategies.',
    keyEntities: ['PostgreSQL', 'MySQL', 'database', 'scalability', 'concurrency', 'PgBouncer', 'JSONB'],
    messages: [
      {
        id: 'msg-sql-1',
        role: 'user',
        content: 'Explain the scalability differences between PostgreSQL and MySQL for high concurrency workloads.',
        created_at: '2026-11-03T16:00:00.000Z',
        event_date: '2026-11-03T16:00:00.000Z',
      },
      {
        id: 'msg-sql-2',
        role: 'assistant',
        content: 'PostgreSQL scales high concurrency via process-per-connection architecture with PgBouncer connection pooling, advanced MVCC, GIN/GiST indexing, and superior JSONB support. MySQL uses a thread-per-connection model with InnoDB buffer pool optimization and simpler master-replica scaling.',
        created_at: '2026-11-03T16:03:00.000Z',
        event_date: '2026-11-03T16:03:00.000Z',
      },
    ],
  },
];
