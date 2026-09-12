import { describe, expect, it } from "vitest";
import { benchmark } from "./benchmark-utils.js";

describe("benchmark infrastructure", () => {
  it("runs a warm-up and the requested measured iterations", async () => {
    let calls = 0;
    const result = await benchmark("deterministic fixture", "10 rows", 60_000, 3, async () => {
      calls += 1;
      return Array.from({ length: 10 }, (_, index) => index);
    });

    expect(calls).toBe(4);
    expect(result).toMatchObject({ test: "deterministic fixture", datasetSize: "10 rows", iterations: 3, status: "PASS" });
    expect(result.minMs).toBeLessThanOrEqual(result.medianMs);
    expect(result.medianMs).toBeLessThanOrEqual(result.maxMs);
  });
});
