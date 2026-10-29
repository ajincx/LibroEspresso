import { describe, expect, it } from "vitest";
import {
  buildShrinkageRateForecast,
  calculateMae,
  combineBranchShrinkageRates,
  combineAccuracySummaries,
  evaluateCogsMae,
  evaluateIngredientMae,
  evaluateSalesMae,
  forecastDailySales,
  forecastDailyCogs,
  forecastWeeklyShrinkageRate,
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

  it("backtests the same sales-driven historical COGS-rate projection without future leakage", () => {
    const observations = series(60, () => 1_000).map((row) => ({
      date: row.date,
      sales: row.value,
      cogs: 320,
    }));
    const target = date(50);
    const original = forecastDailyCogs(observations, target);
    expect(original).toBeCloseTo(320, 6);
    expect(forecastDailyCogs([
      ...observations,
      { date: date(100), sales: 1, cogs: 1_000_000 },
    ], target)).toBe(original);
    expect(evaluateCogsMae(observations)).toMatchObject({ mae: 0, evaluatedDays: 30 });
  });

  it("does not claim COGS accuracy when sales history is insufficient", () => {
    const observations = series(20, () => 1_000).map((row) => ({
      date: row.date,
      sales: row.value,
      cogs: 320,
    }));
    expect(evaluateCogsMae(observations)).toMatchObject({
      mae: null,
      evaluatedDays: 0,
      insufficientHistory: true,
    });
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

  it("keeps seven ingredient usage dates unavailable until an eighth actual date exists", () => {
    const result = evaluateIngredientMae({
      observations: series(7, () => 10),
      units: ["g"],
    });
    expect(result.incompatibleUnits).toBe(false);
    expect(result.evaluatedDays).toBe(0);
    expect(result.mae).toBeNull();
    expect(result.insufficientHistory).toBe(true);
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

describe("weekly shrinkage-rate forecasting", () => {
  const weeks = (count: number, shrinkageCost = (index: number) => (index + 1) * 10) =>
    Array.from({ length: count }, (_, index) => ({
      weekStart: date(index * 7),
      sales: 1_000,
      shrinkageCost: shrinkageCost(index),
    }));

  it("uses sales and recency weights across the eight latest eligible weeks", () => {
    expect(forecastWeeklyShrinkageRate(weeks(8), date(60))).toBeCloseTo(5.666666, 5);
  });

  it("treats evidenced zero shrinkage as zero without inventing missing weeks", () => {
    expect(forecastWeeklyShrinkageRate(weeks(8, () => 0), date(60))).toBe(0);
    expect(buildShrinkageRateForecast({ observations: weeks(7, () => 0), targetDate: date(60), horizonDays: 14 }))
      .toMatchObject({ status: "INSUFFICIENT_HISTORICAL_DATA", projectedRate: null, eligibleWeeks: 7 });
  });

  it("does not allow a future weekly record to change an earlier forecast", () => {
    const history = weeks(8, () => 10);
    const targetDate = date(60);
    const original = forecastWeeklyShrinkageRate(history, targetDate);
    expect(forecastWeeklyShrinkageRate([
      ...history,
      { weekStart: date(100), sales: 1, shrinkageCost: 1_000_000 },
    ], targetDate)).toBe(original);
  });

  it("reports rolling-origin MAE only after four valid evaluation weeks", () => {
    const eleven = buildShrinkageRateForecast({ observations: weeks(11), targetDate: date(90), horizonDays: 28 });
    const twelve = buildShrinkageRateForecast({ observations: weeks(12), targetDate: date(90), horizonDays: 28 });
    expect(eleven).toMatchObject({ status: "AVAILABLE", evaluatedWeeks: 3, maePercentagePoints: null });
    expect(twelve.status).toBe("AVAILABLE");
    expect(twelve.evaluatedWeeks).toBe(4);
    expect(twelve.maePercentagePoints).not.toBeNull();
  });

  it("does not issue shrinkage forecasts outside the supported 7-28 day horizon", () => {
    expect(buildShrinkageRateForecast({ observations: weeks(12), targetDate: date(90), horizonDays: 30 }))
      .toMatchObject({ status: "UNSUPPORTED_HORIZON", projectedRate: null });
  });

  it("combines Owner branch forecasts using forecast-sales weights", () => {
    expect(combineBranchShrinkageRates([
      { status: "AVAILABLE", projectedRate: 1, projectedSales: 1_000 },
      { status: "AVAILABLE", projectedRate: 3, projectedSales: 3_000 },
    ])).toBe(2.5);
    expect(combineBranchShrinkageRates([
      { status: "AVAILABLE", projectedRate: 1, projectedSales: 1_000 },
      { status: "INSUFFICIENT_HISTORICAL_DATA", projectedRate: null, projectedSales: 3_000 },
    ])).toBeNull();
  });
});
