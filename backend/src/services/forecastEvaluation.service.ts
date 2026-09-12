const DAY = 86_400_000;
const MIN_SALES_HISTORY_DAYS = 28;
const MIN_INGREDIENT_HISTORY_DAYS = 7;

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
