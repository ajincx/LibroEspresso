import { addDateDays } from "./businessDate";

export const FORECAST_HORIZONS = [
  "Next 7 Days",
  "Next 14 Days",
  "Next 28 Days",
  "Next 30 Days",
  "Next 90 Days",
  "Next 180 Days",
  "Next 365 Days",
  "Custom Range",
] as const;

export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export function forecastEndForHorizon(startDate: string, horizon: ForecastHorizon) {
  const days = {
    "Next 7 Days": 7,
    "Next 14 Days": 14,
    "Next 28 Days": 28,
    "Next 30 Days": 30,
    "Next 90 Days": 90,
    "Next 180 Days": 180,
    "Next 365 Days": 365,
  }[horizon as Exclude<ForecastHorizon, "Custom Range">];
  return days ? addDateDays(startDate, days - 1) : null;
}
