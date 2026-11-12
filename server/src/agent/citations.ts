import type { SearchResult, SourceCard } from '../services/search/types.js';

/**
 * Parses [n] citations from the model output.
 * Any citation [n] where n <= 0 or n > resultsCount is completely stripped.
 */
export function validateAndStripCitations(text: string, resultsCount: number): string {
  if (!text) return '';

  return text.replace(/\[(\d+)\]/g, (match, digits) => {
    const num = parseInt(digits, 10);
    if (num >= 1 && num <= resultsCount) {
      return match;
    }
    // Strip invalid citation
    return '';
  });
}

/**
 * Builds verified SourceCard items exclusively from verified backend SearchResult items.
 * Guaranteed: never constructed from model-generated URLs.
 */
export function buildSourceCards(results: SearchResult[]): SourceCard[] {
  if (!results || results.length === 0) {
    return [];
  }

  return results.map((r) => {
    let domain = '';
    try {
      domain = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      domain = r.url;
    }

    return {
      id: r.id,
      title: r.title,
      url: r.url,
      domain,
      date: r.published_date,
      snippet: r.content,
    };
  });
}

