/**
 * Decision 5: Memory-intent cue detection
 * Cues: "did I", "we discussed", "yesterday", "last week", "earlier", "before", "remember", etc.
 */

const MEMORY_CUE_PATTERNS: RegExp[] = [
  /\bdid\s+(i|we)\b/i,
  /\bwe\s+(discussed|talked\s+about|covered|mentioned)\b/i,
  /\b(yesterday|last\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
  /\b(earlier|before|previously)\b/i,
  /\b(remember|recall|do\s+you\s+remember)\b/i,
  /\bwhat\s+did\s+(i|you)\s+(ask|tell\s+me|say)\b/i,
  /\bwhen\s+did\s+i\s+(ask|mention|bring\s+up)\b/i,
  /\bfirst\s+topic\b/i,
  /\bwhat\s+came\s+before\b/i,
  /\bwhich\s+companies\s+did\s+we\b/i,
  /\bour\s+(previous|past|prior)\s+(conversation|chat|discussion)\b/i,
];

export function hasMemoryCue(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;

  return MEMORY_CUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

