-- Migration: 003_event_dates_and_metadata
-- Up Migration: Decouple database message insertion time (created_at) from explicit historical discussion date (event_date)

ALTER TABLE messages 
  ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ;

-- Index for temporal queries querying historical event dates directly
CREATE INDEX IF NOT EXISTS idx_messages_event_date 
  ON messages (event_date);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_event_date 
  ON messages (conversation_id, event_date);

