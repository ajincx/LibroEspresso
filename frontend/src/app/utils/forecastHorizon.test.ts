import { describe, expect, it } from "vitest";
import { FORECAST_HORIZONS, forecastEndForHorizon } from "./forecastHorizon";

describe("forecast horizon options", () => {
  it("offers only forecast periods up to 365 days", () => {
    expect(FORECAST_HORIZONS).toEqual([
      "Next 30 Days",
      "Next 90 Days",
      "Next 180 Days",
      "Next 365 Days",
      "Custom Range",
    ]);
    expect(FORECAST_HORIZONS).not.toContain("Next 3 Years");
  });

  it("calculates inclusive preset end dates", () => {
    expect(forecastEndForHorizon("2026-01-01", "Next 365 Days")).toBe("2026-12-31");
  });
});
