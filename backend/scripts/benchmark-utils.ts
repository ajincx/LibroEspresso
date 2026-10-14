export type BenchmarkSummary = {
  test: string;
  datasetSize: string;
  iterations: number;
  targetMs: number;
  firstRunMs: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  status: "PASS" | "FAIL";
};

const rounded = (value: number) => Math.round(value * 100) / 100;

export function percentile(sortedSamples: readonly number[], percentileValue: number) {
  if (!sortedSamples.length) throw new Error("At least one benchmark sample is required.");
  const rank = Math.max(0, Math.ceil((percentileValue / 100) * sortedSamples.length) - 1);
  return sortedSamples[Math.min(rank, sortedSamples.length - 1)]!;
}

export async function benchmark(test: string, datasetSize: string, targetMs: number, iterations: number, operation: () => Promise<unknown>): Promise<BenchmarkSummary> {
  const firstRunStartedAt = performance.now();
  await operation();
  const firstRunMs = performance.now() - firstRunStartedAt;
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    await operation();
    samples.push(performance.now() - startedAt);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  return {
    test,
    datasetSize,
    iterations,
    targetMs,
    firstRunMs: rounded(firstRunMs),
    averageMs: rounded(average),
    medianMs: rounded(median),
    p95Ms: rounded(p95),
    p99Ms: rounded(p99),
    minMs: rounded(sorted[0]!),
    maxMs: rounded(sorted.at(-1)!),
    status: p95 <= targetMs ? "PASS" : "FAIL",
  };
}

export async function benchmarkConcurrent(
  test: string,
  concurrentUsers: number,
  targetMs: number,
  iterations: number,
  operation: () => Promise<unknown>,
) {
  await operation();
  const samples: number[] = [];
  let errors = 0;
  const batchStartedAt = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await Promise.all(Array.from({ length: concurrentUsers }, async () => {
      const startedAt = performance.now();
      try { await operation(); }
      catch { errors += 1; }
      finally { samples.push(performance.now() - startedAt); }
    }));
  }
  const elapsedMs = performance.now() - batchStartedAt;
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    test,
    concurrentUsers,
    iterations,
    requests: samples.length,
    targetMs,
    p50Ms: rounded(percentile(sorted, 50)),
    p95Ms: rounded(percentile(sorted, 95)),
    p99Ms: rounded(percentile(sorted, 99)),
    throughputPerSecond: rounded(samples.length / (elapsedMs / 1_000)),
    errorRatePercent: rounded((errors / samples.length) * 100),
    status: errors === 0 && percentile(sorted, 95) <= targetMs ? "PASS" as const : "FAIL" as const,
  };
}
