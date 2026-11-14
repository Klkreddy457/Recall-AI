/**
 * Decision 5: Memory-intent cue detection
 * Cues: "did I", "we discussed", "yesterday", "last week", "earlier", "before", "remember", etc.
 */

const MEMORY_CUE_PATTERNS: RegExp[] = [
  /\bdid\s+(i|we)\b/i,
  /\bwe\s+(discussed|talked\s+about|covered|mentioned|compared|evaluated)\b/i,
  /\b(yesterday|last\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
  /\b(earlier|before|previously|in\s+the\s+past)\b/i,
  /\b(remember|recall|do\s+you\s+remember)\b/i,
  /\bwhat\s+did\s+(i|you|we)\s+(ask|tell\s+me|say|discuss|talk\s+about|cover|compare)\b/i,
  /\bwhen\s+did\s+i\s+(ask|mention|bring\s+up)\b/i,
  /\bfirst\s+topic\b/i,
  /\bwhat\s+came\s+before\b/i,
  /\bwhich\s+(companies|crm|crms|database|databases|tools|options|plans)\s+did\s+we\b/i,
  /\bwhat\s+were\s+the\s+(prices?|plans?|features?|differences?)\b/i,
  /\bour\s+(previous|past|prior)\s+(conversation|chat|discussion)\b/i,
  /\b(what|anything)\s+(was|were)\s+discussed\b/i,
  /\bon\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?,?\s+(what|did|were|show)\b/i,
];

export function hasMemoryCue(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;

  return MEMORY_CUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

