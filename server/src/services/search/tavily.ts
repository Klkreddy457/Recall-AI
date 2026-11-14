import type { SearchClient, SearchResult } from './types.js';

export const OFFICIAL_VENDOR_DOMAINS = [
  'hubspot.com',
  'salesforce.com',
  'pipedrive.com',
  'zoho.com',
  'freshworks.com',
  'freshsales.io',
  'neon.tech',
  'supabase.com',
  'railway.app',
  'postgresql.org',
  'mysql.com',
  'docs.github.com',
  'stripe.com',
  'openai.com',
  'vercel.com',
];

export const EXCLUDED_NOISE_PATTERNS = [
  /dropee/i,
  /wordle/i,
  /crossword/i,
  /daily\s+quiz/i,
  /trivia\s+answers/i,
  /puzzle\s+clue/i,
  /airdrop\s+daily/i,
  /crypto\s+quiz/i,
];

/**
 * Filters out noise/quiz/aggregator sites and prioritizes official vendor domains and documentation pages.
 */
export function rankAndFilterSearchResults(
  results: SearchResult[],
  query: string,
  maxResults = 5
): SearchResult[] {
  const queryLower = query.toLowerCase();
  const isExplicitQuizSearch = /quiz|wordle|crossword|puzzle/i.test(queryLower);

  const filtered = results.filter((r) => {
    if (isExplicitQuizSearch) return true;
    const textToCheck = `${r.title} ${r.url} ${r.content}`.toLowerCase();
    return !EXCLUDED_NOISE_PATTERNS.some((pat) => pat.test(textToCheck));
  });

  // Score each result: official vendor domains and pricing pages receive priority boosting
  const scored = filtered.map((item) => {
    let score = 0;
    let hostname = '';
    try {
      hostname = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      hostname = item.url.toLowerCase();
    }

    if (OFFICIAL_VENDOR_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
      score += 100;
    }
    if (/pricing|docs|documentation|pricing-plans|features/i.test(item.url)) {
      score += 30;
    }
    if (/pricing|plans|cost|subscription/i.test(item.title)) {
      score += 15;
    }
    return { item, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const candidates = scored.length > 0 ? scored : results.map((item) => ({ item, score: 0 }));

  return candidates.slice(0, maxResults).map(({ item }, idx) => ({
    ...item,
    id: idx + 1,
  }));
}

export interface TavilyConfig {
  apiKey: string;
  baseUrl?: string;
  maxResults?: number;
  maxSnippetChars?: number;
  timeoutMs?: number;
}

export class TavilySearchClient implements SearchClient {
  private apiKey: string;
  private baseUrl: string;
  private maxResults: number;
  private maxSnippetChars: number;
  private timeoutMs: number;

  constructor(cfg: TavilyConfig) {
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl || 'https://api.tavily.com/search';
    this.maxResults = cfg.maxResults ?? 5;
    this.maxSnippetChars = cfg.maxSnippetChars ?? 500;
    this.timeoutMs = cfg.timeoutMs ?? 8000;
  }

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new Error('TAVILY_API_KEY is not configured');
    }

    const trimmed = query.trim();
    if (!trimmed) return [];

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), this.timeoutMs);

    const abortHandler = () => timeoutController.abort();
    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: trimmed,
          search_depth: 'basic',
          max_results: this.maxResults,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        throw new Error(`Tavily search API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          published_date?: string;
        }>;
      };

      const rawResults: SearchResult[] = (data.results || []).map((item, index) => {
        let content = (item.content || '').trim();
        if (content.length > this.maxSnippetChars) {
          content = content.slice(0, this.maxSnippetChars) + '...';
        }

        return {
          id: index + 1,
          title: item.title || 'Untitled',
          url: item.url || '',
          content,
          published_date: item.published_date,
        };
      });

      return rankAndFilterSearchResults(rawResults, trimmed, this.maxResults);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error('Search request timed out or was aborted');
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}

/**
 * In-memory Fake Search Client for testing without network calls
 */
export class FakeSearchClient implements SearchClient {
  public recordedQueries: string[] = [];
  public resultsToReturn: SearchResult[] | Error = [];

  constructor(initialResults: SearchResult[] | Error = []) {
    this.resultsToReturn = initialResults;
  }

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    if (signal?.aborted) {
      throw new Error('Aborted');
    }

    this.recordedQueries.push(query);

    if (this.resultsToReturn instanceof Error) {
      throw this.resultsToReturn;
    }

    return this.resultsToReturn;
  }
}

