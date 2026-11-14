/**
 * Robust JSON extraction and sanitization utility for LLM tool call arguments.
 * Resolves production issues with concatenated JSON objects (e.g. {"query":"..."}{"query":"..."}),
 * duplicate braces, and incomplete chunks streamed by OpenAI-compatible models like Groq.
 */

export interface SanitizedJsonResult<T = Record<string, unknown>> {
  success: boolean;
  parsed: T;
  cleanString: string;
}

/**
 * Extracts the first valid, well-formed JSON object from an arbitrary raw string.
 * Ensures the resulting cleanString is strictly valid JSON suitable for downstream LLM templates.
 */
export function extractValidJsonObject<T = Record<string, unknown>>(
  raw: string,
  fallback: T
): SanitizedJsonResult<T> {
  if (!raw || typeof raw !== 'string') {
    return {
      success: false,
      parsed: fallback,
      cleanString: JSON.stringify(fallback),
    };
  }

  const trimmed = raw.trim();

  // Fast path 1: Directly valid JSON
  try {
    const directParsed = JSON.parse(trimmed) as T;
    if (directParsed && typeof directParsed === 'object') {
      return {
        success: true,
        parsed: directParsed,
        cleanString: JSON.stringify(directParsed),
      };
    }
  } catch {
    // Continue to robust extraction
  }

  // Fast path 2: Balanced brace extraction (handles {"query":"..."}{"query":"..."} etc.)
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let inString = false;
    let isEscaped = false;
    let endBrace = -1;

    for (let i = firstBrace; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            endBrace = i;
            break;
          }
        }
      }
    }

    if (endBrace !== -1) {
      const candidate = trimmed.slice(firstBrace, endBrace + 1);
      try {
        const candidateParsed = JSON.parse(candidate) as T;
        if (candidateParsed && typeof candidateParsed === 'object') {
          return {
            success: true,
            parsed: candidateParsed,
            cleanString: JSON.stringify(candidateParsed),
          };
        }
      } catch {
        // Fall through to fallback
      }
    }
  }

  // Fallback path: Return safe fallback serialized as valid JSON
  return {
    success: false,
    parsed: fallback,
    cleanString: JSON.stringify(fallback),
  };
}

/**
 * Normalizes a search query by trimming, converting to lowercase, collapsing whitespace,
 * and stripping surrounding punctuation/quotes.
 */
export function normalizeSearchQuery(query: string): string {
  if (!query || typeof query !== 'string') return '';
  return query
    .trim()
    .toLowerCase()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
