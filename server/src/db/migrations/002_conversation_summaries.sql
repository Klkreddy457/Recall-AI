-- Migration: 002_conversation_summaries
-- Evidence-gated trigger: Decision 6 for cross-conversation categorical and topic recall

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_entities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary_tsv TSVECTOR
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_summaries_conv 
  ON conversation_summaries (conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_tsv 
  ON conversation_summaries USING GIN (summary_tsv);

-- Trigger function to automatically maintain summary_tsv
-- Uses 'english'::regconfig and array_to_string safely within procedural trigger
CREATE OR REPLACE FUNCTION conversation_summaries_tsv_trigger() 
RETURNS trigger AS $$
BEGIN
  NEW.summary_tsv := to_tsvector(
    'english'::regconfig,
    COALESCE(NEW.summary, '') || ' ' || COALESCE(array_to_string(NEW.key_entities, ' '), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversation_summaries_tsv ON conversation_summaries;

CREATE TRIGGER trg_conversation_summaries_tsv
BEFORE INSERT OR UPDATE OF summary, key_entities
ON conversation_summaries
FOR EACH ROW
EXECUTE FUNCTION conversation_summaries_tsv_trigger();
