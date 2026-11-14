export interface MemoryEvaluationStats {
  totalQueries: number;
  precisionAtK: number;
  recallAtK: number;
  exactDateAccuracy: number;
  unsupportedMemoryClaimRate: number; // Must be 0% in a sound system
}

export function calculatePrecisionAtK(relevantRetrieved: number, totalRetrieved: number): number {
  if (totalRetrieved === 0) return 0;
  return Math.round((relevantRetrieved / totalRetrieved) * 100) / 100;
}

export function calculateRecallAtK(relevantRetrieved: number, totalRelevantInDataset: number): number {
  if (totalRelevantInDataset === 0) return 1.0;
  return Math.round((relevantRetrieved / totalRelevantInDataset) * 100) / 100;
}

export function calculateUnsupportedMemoryRate(
  hallucinatedClaims: number,
  emptyMemoryQueries: number
): number {
  if (emptyMemoryQueries === 0) return 0;
  return Math.round((hallucinatedClaims / emptyMemoryQueries) * 100) / 100;
}
