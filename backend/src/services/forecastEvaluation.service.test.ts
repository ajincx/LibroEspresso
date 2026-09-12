import { describe, expect, it } from "vitest";
import {
  calculateMae,
  combineAccuracySummaries,
  evaluateIngredientMae,
  evaluateSalesMae,
  forecastDailySales,
  projectStockAvailability,
  summarizeAccuracy,
  type DailyObservation,
} from "./forecastEvaluation.service.js";

const DAY = 86_400_000;
const date = (offset: number) =>
  new Date(Date.UTC(2026, 0, 1) + offset * DAY).toISOString().slice(0, 10);
const series = (days: number, value: (index: number) => number): DailyObservation[] =>
  Array.from({ length: days }, (_, index) => ({ date: date(index), value: value(index) }));

describe("forecast MAE", () => {
  it("calculates MAE with absolute errors", () => {
    expect(calculateMae([
      { date: date(0), actualValue: 100, forecastValue: 80, absoluteError: 20 },
      { date: date(1), actualValue: 70, forecastValue: 100, absoluteError: 30 },
    ])).toBe(25);
  });

  it("returns zero for zero-error forecasts", () => {
    expect(calculateMae([
      { date: date(0), actualValue: 100, forecastValue: 100, absoluteError: 0 },
    ])).toBe(0);
  });

  it("does not allow future records to change a historical prediction", () => {
    const history = series(40, (index) => 100 + index);
    const target = date(35);
    const original = forecastDailySales(history, target);
    const withFutureOutlier = forecastDailySales([
      ...history,
      { date: date(100), value: 10_000_000 },
    ], target);
    expect(withFutureOutlier).toBe(original);
  });

  it("handles insufficient sales history without inventing an MAE", () => {
    const result = evaluateSalesMae(series(20, () => 100));
    expect(result.insufficientHistory).toBe(true);
    expect(result.evaluatedDays).toBe(0);
    expect(result.mae).toBeNull();
  });

  it("calculates consolidated MAE from underlying observations instead of averaging branch MAEs", () => {
    const first = summarizeAccuracy([
      { date: date(1), actualValue: 100, forecastValue: 90, absoluteError: 10 },
    ], 1);
    const second = summarizeAccuracy([
      { date: date(1), actualValue: 100, forecastValue: 70, absoluteError: 30 },
      { date: date(2), actualValue: 100, forecastValue: 70, absoluteError: 30 },
    ], 2);
    expect(combineAccuracySummaries([first, second]).mae).toBe(23.33);
  });

  it("calculates ingredient usage MAE with compatible units", () => {
    const result = evaluateIngredientMae({
      observations: series(8, (index) => index === 7 ? 20 : 10),
      units: ["g"],
    });
    expect(result.incompatibleUnits).toBe(false);
    expect(result.evaluatedDays).toBe(1);
    expect(result.mae).toBe(10);
  });

  it("does not compare incompatible ingredient units", () => {
    const result = evaluateIngredientMae({
      observations: series(40, () => 10),
      units: ["g", "kg"],
    });
    expect(result.incompatibleUnits).toBe(true);
    expect(result.evaluatedDays).toBe(0);
    expect(result.mae).toBeNull();
  });
});

describe("incoming purchase-order timing", () => {
  it("reports stock-out before a late delivery instead of adding it immediately", () => {
    const result = projectStockAvailability({
      currentStock: 10,
      dailyUsage: 2,
      projectionStart: "2026-09-08",
      projectionEnd: "2026-10-07",
      incomingDeliveries: [{ expectedDeliveryDate: "2026-09-18", quantity: 20 }],
    });
    expect(result.daysToStockout).toBe(5);
  });

  it("extends available supply when stock arrives before depletion", () => {
    const result = projectStockAvailability({
      currentStock: 10,
      dailyUsage: 2,
      projectionStart: "2026-09-08",
      projectionEnd: "2026-10-07",
      incomingDeliveries: [{ expectedDeliveryDate: "2026-09-12", quantity: 20 }],
    });
    expect(result.daysToStockout).toBe(15);
  });
});
