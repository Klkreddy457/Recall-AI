export interface MessageRecord {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: string | null;
  created_at: Date;
  event_date?: Date | null;
  sources_json?: unknown;
  search_metadata?: unknown;
  conversation_title?: string | null;
}

export interface ConversationSummaryHit {
  conversationId: string;
  conversationTitle?: string | null;
  summary: string;
  keyEntities: string[];
  rank?: number;
}

export interface QAPair {
  conversationId: string;
  conversationTitle?: string | null;
  userMessage: MessageRecord;
  assistantMessage?: MessageRecord;
  rank?: number;
}

export interface TemporalRange {
  start: Date;
  end: Date;
  text: string;
}

export interface TemporalConversationGroup {
  conversationId: string;
  conversationTitle: string | null;
  pairs: QAPair[];
}

export interface TemporalRetrievalResult {
  range: TemporalRange;
  groups: TemporalConversationGroup[];
}

export interface MemoryRetrievalResult {
  recentContext: MessageRecord[];
  temporal: TemporalRetrievalResult | null;
  fts: QAPair[];
  summaryHits?: ConversationSummaryHit[];
  memoryEmptySignal: boolean;
  timings: {
    totalMs: number;
    recentMs: number;
    temporalMs: number;
    ftsMs: number;
    summaryMs?: number;
  };
}

export interface RetrieveOptions {
  ownerId: string;
  query: string;
  activeConversationId?: string;
  timezone?: string;
  limitRecent?: number;
  limitFts?: number;
  now?: Date;
}

