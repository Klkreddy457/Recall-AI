export interface EvaluationAssertionResult {
  passed: boolean;
  message?: string;
}

export function assertContains(haystack: string, needle: string): EvaluationAssertionResult {
  const normHaystack = haystack.toLowerCase();
  const normNeedle = needle.toLowerCase();
  if (normHaystack.includes(normNeedle)) {
    return { passed: true };
  }
  return {
    passed: false,
    message: `Expected output to contain "${needle}" but was not found.`,
  };
}

export function assertExcludes(haystack: string, forbidden: string): EvaluationAssertionResult {
  const normHaystack = haystack.toLowerCase();
  const normForbidden = forbidden.toLowerCase();
  if (!normHaystack.includes(normForbidden)) {
    return { passed: true };
  }
  return {
    passed: false,
    message: `Expected output to NOT contain "${forbidden}" but was present.`,
  };
}

export function assertValidCitations(text: string, maxSources: number): EvaluationAssertionResult {
  const matches = text.matchAll(/\[(\d+)\]/g);
  for (const match of matches) {
    const num = parseInt(match[1]!, 10);
    if (num < 1 || num > maxSources) {
      return {
        passed: false,
        message: `Found invalid citation [${num}] where valid range is [1..${maxSources}].`,
      };
    }
  }
  return { passed: true };
}

