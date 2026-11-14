export interface ReliabilityStats {
  totalAttempts: number;
  successful: number;
  failed: number;
  timedOut: number;
  interrupted: number;
  successRate: number;
  errorRate: number;
}

export function computeReliabilityStats(attempts: {
  status: 'complete' | 'interrupted' | 'error' | 'timeout';
}[]): ReliabilityStats {
  const total = attempts.length;
  if (total === 0) {
    return {
      totalAttempts: 0,
      successful: 0,
      failed: 0,
      timedOut: 0,
      interrupted: 0,
      successRate: 0,
      errorRate: 0,
    };
  }

  const successful = attempts.filter((a) => a.status === 'complete').length;
  const failed = attempts.filter((a) => a.status === 'error').length;
  const timedOut = attempts.filter((a) => a.status === 'timeout').length;
  const interrupted = attempts.filter((a) => a.status === 'interrupted').length;

  return {
    totalAttempts: total,
    successful,
    failed,
    timedOut,
    interrupted,
    successRate: Math.round((successful / total) * 1000) / 10,
    errorRate: Math.round(((failed + timedOut) / total) * 1000) / 10,
  };
}
