export interface SourceCard {
  id: number;
  title: string;
  url: string;
  domain: string;
  date?: string;
  snippet: string;
}

export interface SearchMetadata {
  total_ms?: number;
  time_to_first_event?: number;
  time_to_first_token?: number;
  memory_ms?: number;
  search_ms?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'interrupted' | 'error' | null;
  created_at: string;
  sources_json?: SourceCard[] | null;
  search_metadata?: SearchMetadata | null;
}

export interface Conversation {
  id: string;
  owner_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}
