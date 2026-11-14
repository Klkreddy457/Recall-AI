export interface CitationStats {
  totalCitations: number;
  validCitations: number;
  invalidStrippedCitations: number;
  citationPrecision: number;
  claimsRequiringCitation: number;
  claimsSupportedWithCitation: number;
  citationCoverage: number;
}

export function calculateCitationPrecision(validCitations: number, totalCitations: number): number {
  if (totalCitations === 0) return 1.0; // No hallucinations
  return Math.round((validCitations / totalCitations) * 100) / 100;
}

export function calculateCitationCoverage(
  supportedClaims: number,
  claimsRequiringCitation: number
): number {
  if (claimsRequiringCitation === 0) return 1.0;
  return Math.round((supportedClaims / claimsRequiringCitation) * 100) / 100;
}
