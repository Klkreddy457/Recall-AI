export interface LatencyDistribution {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return Math.round((sorted[lower] ?? 0) * 100) / 100;
  }
  return (
    Math.round(((sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight) * 100) / 100
  );
}

export function computeLatencyDistribution(values: number[]): LatencyDistribution {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0, count: 0 };
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  const sorted = [...values].sort((a, b) => a - b);

  return {
    p50: calculatePercentile(values, 50),
    p95: calculatePercentile(values, 95),
    p99: calculatePercentile(values, 99),
    min: Math.round((sorted[0] ?? 0) * 100) / 100,
    max: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
    avg: Math.round((sum / values.length) * 100) / 100,
    count: values.length,
  };
}
