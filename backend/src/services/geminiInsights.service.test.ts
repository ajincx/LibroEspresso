import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
}));

import { evaluateSalesMae } from "./forecastEvaluation.service.js";
import { generateGeminiInsights } from "./geminiInsights.service.js";

afterEach(() => vi.unstubAllGlobals());

describe("Gemini fallback independence", () => {
  it("keeps the backend MAE available when Gemini fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("service unavailable")));
    const start = Date.UTC(2026, 0, 1);
    const observations = Array.from({ length: 60 }, (_, index) => ({
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      value: 1_000,
    }));

    const accuracy = evaluateSalesMae(observations);
    const insights = await generateGeminiInsights({ salesMae: accuracy.mae });

    expect(accuracy.mae).toBe(0);
    expect(accuracy.evaluatedDays).toBe(30);
    expect(insights).toBeNull();
  });
});
