-- Migration: 002_conversation_summaries
-- Evidence-gated trigger: Decision 6 for cross-conversation categorical and topic recall

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_entities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', summary || ' ' || array_to_string(key_entities, ' '))
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_summaries_conv 
  ON conversation_summaries (conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_tsv 
  ON conversation_summaries USING GIN (summary_tsv);
