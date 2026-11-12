export interface SearchResult {
  id: number; // 1..n
  title: string;
  url: string;
  content: string; // Truncated snippet (~500 chars)
  published_date?: string;
}

export interface SourceCard {
  id: number;
  title: string;
  url: string;
  domain: string;
  date?: string;
  snippet: string;
}

export interface SearchClient {
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
}

