export interface MessageRecord {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: string | null;
  created_at: Date;
  sources_json?: unknown;
  search_metadata?: unknown;
  conversation_title?: string | null;
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
  memoryEmptySignal: boolean;
  timings: {
    totalMs: number;
    recentMs: number;
    temporalMs: number;
    ftsMs: number;
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
