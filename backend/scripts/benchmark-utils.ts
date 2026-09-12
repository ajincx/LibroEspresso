export type BenchmarkSummary = { test: string; datasetSize: string; iterations: number; targetMs: number; averageMs: number; medianMs: number; minMs: number; maxMs: number; status: "PASS" | "FAIL" };

export async function benchmark(test: string, datasetSize: string, targetMs: number, iterations: number, operation: () => Promise<unknown>): Promise<BenchmarkSummary> {
  await operation();
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    await operation();
    samples.push(performance.now() - startedAt);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const rounded = (value: number) => Math.round(value * 100) / 100;
  return { test, datasetSize, iterations, targetMs, averageMs: rounded(average), medianMs: rounded(median), minMs: rounded(sorted[0]!), maxMs: rounded(sorted.at(-1)!), status: average <= targetMs ? "PASS" : "FAIL" };
}
