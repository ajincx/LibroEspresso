import { describe, expect, it } from "vitest";
import { benchmark, benchmarkConcurrent, percentile } from "./benchmark-utils.js";

describe("benchmark infrastructure", () => {
  it("runs a warm-up and the requested measured iterations", async () => {
    let calls = 0;
    const result = await benchmark("deterministic fixture", "10 rows", 60_000, 3, async () => {
      calls += 1;
      return Array.from({ length: 10 }, (_, index) => index);
    });

    expect(calls).toBe(4);
    expect(result).toMatchObject({ test: "deterministic fixture", datasetSize: "10 rows", iterations: 3, status: "PASS" });
    expect(result.firstRunMs).toBeGreaterThanOrEqual(0);
    expect(result.minMs).toBeLessThanOrEqual(result.medianMs);
    expect(result.medianMs).toBeLessThanOrEqual(result.maxMs);
    expect(result.p95Ms).toBeLessThanOrEqual(result.maxMs);
    expect(result.p99Ms).toBeLessThanOrEqual(result.maxMs);
  });

  it("uses nearest-rank percentiles and reports controlled concurrency", async () => {
    expect(percentile([1, 2, 3, 4, 5], 95)).toBe(5);
    const result = await benchmarkConcurrent("concurrent fixture", 5, 60_000, 2, async () => undefined);
    expect(result).toMatchObject({ concurrentUsers: 5, requests: 10, errorRatePercent: 0, status: "PASS" });
  });
});
