-- Migration: 001_initial_schema
-- Up Migration: Initial conversations and messages tables with indexes

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  status TEXT CHECK (status IN ('complete', 'interrupted', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sources_json JSONB,
  search_metadata JSONB,
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- Real query pattern indexes as specified in AGENTS.md
CREATE INDEX IF NOT EXISTS idx_conversations_owner_updated 
  ON conversations (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
  ON messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_created_at 
  ON messages (created_at);

CREATE INDEX IF NOT EXISTS idx_messages_content_tsv 
  ON messages USING GIN (content_tsv);

