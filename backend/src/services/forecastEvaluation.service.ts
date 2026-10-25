const DAY = 86_400_000;
const MIN_SALES_HISTORY_DAYS = 28;
const MIN_INGREDIENT_HISTORY_DAYS = 7;
export const MIN_SHRINKAGE_HISTORY_WEEKS = 8;
export const MIN_SHRINKAGE_BACKTEST_OBSERVATIONS = 4;
export const MAX_SHRINKAGE_FORECAST_DAYS = 28;

const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) =>
  iso(new Date(utcDate(value).getTime() + days * DAY));
const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export type DailyObservation = { date: string; value: number };
export type DailyFinancialObservation = { date: string; sales: number; cogs: number };

export type WeeklyShrinkageObservation = {
  weekStart: string;
  sales: number;
  shrinkageCost: number;
};

export type ShrinkageForecastStatus =
  | "AVAILABLE"
  | "INSUFFICIENT_HISTORICAL_DATA"
  | "UNSUPPORTED_HORIZON";

export type ShrinkageRateForecast = {
  status: ShrinkageForecastStatus;
  projectedRate: number | null;
  eligibleWeeks: number;
  historicalStart: string | null;
  historicalEnd: string | null;
  maePercentagePoints: number | null;
  evaluatedWeeks: number;
  evaluationStart: string | null;
  evaluationEnd: string | null;
};

export type AccuracyObservation = {
  date: string;
  actualValue: number;
  forecastValue: number;
  absoluteError: number;
};

export type AccuracySummary = {
  evaluationStart: string | null;
  evaluationEnd: string | null;
  evaluatedDays: number;
  observations: AccuracyObservation[];
  mae: number | null;
  averageActual: number | null;
  averageForecast: number | null;
  insufficientHistory: boolean;
};

function eligibleHistory(
  observations: DailyObservation[],
  targetDate: string,
  maximumCalendarDays: number,
) {
  const earliestDate = addDays(targetDate, -maximumCalendarDays);
  return observations
    .filter((row) => row.date < targetDate && row.date >= earliestDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function forecastDailySales(
  observations: DailyObservation[],
  targetDate: string,
): number | null {
  const history = eligibleHistory(observations, targetDate, 365);
  if (history.length < MIN_SALES_HISTORY_DAYS) return null;

  const recent = history.slice(-28).map((row) => row.value);
  const prior = history.slice(-56, -28).map((row) => row.value);
  const baseline = average(recent);
  const priorAverage = average(prior) || baseline;
  const trend = priorAverage > 0
    ? clamp((baseline - priorAverage) / priorAverage, -0.25, 0.25)
    : 0;
  const overallAverage = average(history.map((row) => row.value));
  const targetWeekday = utcDate(targetDate).getUTCDay();
  const weekdayAverage = average(
    history
      .filter((row) => utcDate(row.date).getUTCDay() === targetWeekday)
      .map((row) => row.value),
  ) || overallAverage || baseline;
  const weekdayFactor = overallAverage > 0
    ? clamp(weekdayAverage / overallAverage, 0.6, 1.4)
    : 1;
  const oneDayTrend = Math.max(0.25, 1 + trend / 28);
  return Math.max(0, baseline * weekdayFactor * oneDayTrend);
}

// --- FORECAST ACCURACY: MAE FORMULA ---
// MAE = Sum(|Actual - Forecast|) / Number of Observations
// Lower MAE means the forecast is closer to actual values.
export function calculateMae(observations: AccuracyObservation[]): number | null {
  return observations.length
    ? observations.reduce((sum, row) => sum + Math.abs(row.actualValue - row.forecastValue), 0) /
        observations.length
    : null;
}

export function summarizeAccuracy(observations: AccuracyObservation[], expectedDays = 30): AccuracySummary {
  const mae = calculateMae(observations);
  return {
    evaluationStart: observations[0]?.date ?? null,
    evaluationEnd: observations.at(-1)?.date ?? null,
    evaluatedDays: observations.length,
    observations: observations.map((row) => ({
      ...row,
      actualValue: round(row.actualValue),
      forecastValue: round(row.forecastValue),
      absoluteError: round(row.absoluteError),
    })),
    mae: mae === null ? null : round(mae),
    averageActual: observations.length
      ? round(average(observations.map((row) => row.actualValue)))
      : null,
    averageForecast: observations.length
      ? round(average(observations.map((row) => row.forecastValue)))
      : null,
    insufficientHistory: observations.length < expectedDays,
  };
}

export function combineAccuracySummaries(summaries: AccuracySummary[]): AccuracySummary {
  const observations = summaries
    .flatMap((summary) => summary.observations)
    .sort((a, b) => a.date.localeCompare(b.date));
  return summarizeAccuracy(observations, Math.max(30, summaries.length * 30));
}

export function evaluateSalesMae(observations: DailyObservation[]): AccuracySummary {
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date));
  const testDates = sorted.slice(-30);
  const evaluated = testDates.flatMap((actual) => {
    const forecast = forecastDailySales(sorted, actual.date);
    return forecast === null
      ? []
      : [{
          date: actual.date,
          actualValue: actual.value,
          forecastValue: forecast,
          absoluteError: Math.abs(actual.value - forecast),
        }];
  });
  return summarizeAccuracy(evaluated);
}

/**
 * Mirrors the production COGS projection for one target day: forecast sales
 * from prior sales only, then apply the authoritative recipe-snapshot COGS
 * rate observed before that day. Missing sales history is never replaced with
 * an invented zero-rate forecast.
 */
export function forecastDailyCogs(
  observations: DailyFinancialObservation[],
  targetDate: string,
): number | null {
  const history = observations
    .filter((row) => row.date < targetDate && row.date >= addDays(targetDate, -365))
    .sort((a, b) => a.date.localeCompare(b.date));
  const forecastSales = forecastDailySales(
    history.map((row) => ({ date: row.date, value: row.sales })),
    targetDate,
  );
  const historicalSales = history.reduce((sum, row) => sum + row.sales, 0);
  if (forecastSales === null || historicalSales <= 0) return null;
  const historicalCogs = history.reduce((sum, row) => sum + row.cogs, 0);
  return Math.max(0, forecastSales * historicalCogs / historicalSales);
}

export function evaluateCogsMae(observations: DailyFinancialObservation[]): AccuracySummary {
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date));
  const evaluated = sorted.slice(-30).flatMap((actual) => {
    const forecast = forecastDailyCogs(sorted, actual.date);
    return forecast === null
      ? []
      : [{
          date: actual.date,
          actualValue: actual.cogs,
          forecastValue: forecast,
          absoluteError: Math.abs(actual.cogs - forecast),
        }];
  });
  return summarizeAccuracy(evaluated);
}

export function forecastIngredientUsage(
  observations: DailyObservation[],
  targetDate: string,
): number | null {
  const history = eligibleHistory(observations, targetDate, 90);
  if (history.length < MIN_INGREDIENT_HISTORY_DAYS) return null;
  return average(history.slice(-28).map((row) => row.value));
}

export function evaluateIngredientMae(input: {
  observations: DailyObservation[];
  units: string[];
}): AccuracySummary & { incompatibleUnits: boolean } {
  const normalizedUnits = new Set(input.units.map((unit) => unit.trim().toLowerCase()));
  if (normalizedUnits.size !== 1) {
    return { ...summarizeAccuracy([]), incompatibleUnits: true };
  }
  const sorted = [...input.observations].sort((a, b) => a.date.localeCompare(b.date));
  const testDates = sorted.slice(-30);
  const evaluated = testDates.flatMap((actual) => {
    const forecast = forecastIngredientUsage(sorted, actual.date);
    return forecast === null
      ? []
      : [{
          date: actual.date,
          actualValue: actual.value,
          forecastValue: forecast,
          absoluteError: Math.abs(actual.value - forecast),
        }];
  });
  return { ...summarizeAccuracy(evaluated), incompatibleUnits: false };
}

function validShrinkageHistory(observations: WeeklyShrinkageObservation[], targetDate: string) {
  return observations
    .filter((row) =>
      row.weekStart < targetDate &&
      Number.isFinite(row.sales) && row.sales > 0 &&
      Number.isFinite(row.shrinkageCost) && row.shrinkageCost >= 0)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/**
 * Forecasts a future rate from the eight latest complete weekly observations.
 * Each week's influence is proportional to accepted sales and its recency
 * rank (1 for the oldest through 8 for the newest).
 */
export function forecastWeeklyShrinkageRate(
  observations: WeeklyShrinkageObservation[],
  targetDate: string,
): number | null {
  const history = validShrinkageHistory(observations, targetDate);
  if (history.length < MIN_SHRINKAGE_HISTORY_WEEKS) return null;
  const recent = history.slice(-MIN_SHRINKAGE_HISTORY_WEEKS);
  const weightedSales = recent.reduce((sum, row, index) => sum + row.sales * (index + 1), 0);
  if (weightedSales <= 0) return null;
  const weightedShrinkage = recent.reduce(
    (sum, row, index) => sum + row.shrinkageCost * (index + 1),
    0,
  );
  return (weightedShrinkage / weightedSales) * 100;
}

export function evaluateShrinkageRateForecast(
  observations: WeeklyShrinkageObservation[],
): Pick<ShrinkageRateForecast, "maePercentagePoints" | "evaluatedWeeks" | "evaluationStart" | "evaluationEnd"> {
  const sorted = validShrinkageHistory(observations, "9999-12-31");
  const evaluated = sorted.slice(MIN_SHRINKAGE_HISTORY_WEEKS).map((actual) => {
    const forecast = forecastWeeklyShrinkageRate(sorted, actual.weekStart);
    const actualRate = (actual.shrinkageCost / actual.sales) * 100;
    return forecast === null ? null : {
      weekStart: actual.weekStart,
      absoluteError: Math.abs(actualRate - forecast),
    };
  }).filter((row): row is { weekStart: string; absoluteError: number } => row !== null);
  const evaluation = evaluated.slice(-8);
  const enoughEvaluation = evaluation.length >= MIN_SHRINKAGE_BACKTEST_OBSERVATIONS;
  return {
    maePercentagePoints: enoughEvaluation
      ? round(evaluation.reduce((sum, row) => sum + row.absoluteError, 0) / evaluation.length, 4)
      : null,
    evaluatedWeeks: evaluation.length,
    evaluationStart: evaluation[0]?.weekStart ?? null,
    evaluationEnd: evaluation.at(-1)?.weekStart ?? null,
  };
}

export function buildShrinkageRateForecast(input: {
  observations: WeeklyShrinkageObservation[];
  targetDate: string;
  horizonDays: number;
}): ShrinkageRateForecast {
  const history = validShrinkageHistory(input.observations, input.targetDate);
  const common = {
    eligibleWeeks: history.length,
    historicalStart: history[0]?.weekStart ?? null,
    historicalEnd: history.at(-1)?.weekStart ?? null,
  };
  if (input.horizonDays < 7 || input.horizonDays > MAX_SHRINKAGE_FORECAST_DAYS) {
    return {
      status: "UNSUPPORTED_HORIZON",
      projectedRate: null,
      ...common,
      maePercentagePoints: null,
      evaluatedWeeks: 0,
      evaluationStart: null,
      evaluationEnd: null,
    };
  }
  const projectedRate = forecastWeeklyShrinkageRate(history, input.targetDate);
  if (projectedRate === null) {
    return {
      status: "INSUFFICIENT_HISTORICAL_DATA",
      projectedRate: null,
      ...common,
      maePercentagePoints: null,
      evaluatedWeeks: 0,
      evaluationStart: null,
      evaluationEnd: null,
    };
  }
  return {
    status: "AVAILABLE",
    projectedRate: round(projectedRate, 4),
    ...common,
    ...evaluateShrinkageRateForecast(history),
  };
}

export function combineBranchShrinkageRates(
  branches: { status: ShrinkageForecastStatus; projectedRate: number | null; projectedSales: number }[],
): number | null {
  if (!branches.length || branches.some((row) =>
    row.status !== "AVAILABLE" || row.projectedRate === null || row.projectedSales <= 0)) return null;
  const projectedSales = branches.reduce((sum, row) => sum + row.projectedSales, 0);
  if (projectedSales <= 0) return null;
  return branches.reduce(
    (sum, row) => sum + row.projectedSales * (row.projectedRate ?? 0),
    0,
  ) / projectedSales;
}

export type IncomingDelivery = { expectedDeliveryDate: string; quantity: number };

export function projectStockAvailability(input: {
  currentStock: number;
  dailyUsage: number;
  projectionStart: string;
  projectionEnd: string;
  incomingDeliveries: IncomingDelivery[];
}) {
  const stock = Math.max(0, input.currentStock);
  const dailyUsage = Math.max(0, input.dailyUsage);
  const deliveries = input.incomingDeliveries
    .filter((delivery) =>
      delivery.quantity > 0 && delivery.expectedDeliveryDate >= input.projectionStart)
    .sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
  const confirmedIncomingQuantity = deliveries.reduce((sum, row) => sum + row.quantity, 0);
  const incomingByEnd = deliveries
    .filter((row) => row.expectedDeliveryDate <= input.projectionEnd)
    .reduce((sum, row) => sum + row.quantity, 0);
  const horizonDays = Math.max(
    1,
    Math.floor((utcDate(input.projectionEnd).getTime() - utcDate(input.projectionStart).getTime()) / DAY) + 1,
  );

  let available = stock;
  let elapsedDays = 0;
  let daysToStockout: number | null = dailyUsage > 0 ? stock / dailyUsage : null;
  if (dailyUsage > 0) {
    for (const delivery of deliveries) {
      const deliveryOffset = Math.max(
        0,
        Math.floor((utcDate(delivery.expectedDeliveryDate).getTime() - utcDate(input.projectionStart).getTime()) / DAY),
      );
      const daysUntilDelivery = deliveryOffset - elapsedDays;
      const availableDays = available / dailyUsage;
      if (availableDays < daysUntilDelivery) {
        daysToStockout = elapsedDays + availableDays;
        break;
      }
      available -= daysUntilDelivery * dailyUsage;
      available += delivery.quantity;
      elapsedDays = deliveryOffset;
      daysToStockout = elapsedDays + available / dailyUsage;
    }
  }

  return {
    confirmedIncomingQuantity,
    incomingByEnd,
    nextDeliveryDate: deliveries[0]?.expectedDeliveryDate ?? null,
    daysToStockout,
    projectedEndStock: Math.max(0, stock + incomingByEnd - dailyUsage * horizonDays),
  };
}

export function projectedStockOnDate(input: {
  currentStock: number;
  dailyUsage: number;
  projectionStart: string;
  targetDate: string;
  incomingDeliveries: IncomingDelivery[];
}) {
  const elapsedDays = Math.max(
    0,
    Math.floor((utcDate(input.targetDate).getTime() - utcDate(input.projectionStart).getTime()) / DAY),
  );
  const receivedByDate = input.incomingDeliveries
    .filter((row) =>
      row.expectedDeliveryDate >= input.projectionStart &&
      row.expectedDeliveryDate <= input.targetDate)
    .reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
  return Math.max(0, input.currentStock + receivedByDate - input.dailyUsage * elapsedDays);
}
