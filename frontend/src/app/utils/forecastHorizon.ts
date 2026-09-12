import { addDateDays } from "./businessDate";

export const FORECAST_HORIZONS = [
  "Next 30 Days",
  "Next 90 Days",
  "Next 180 Days",
  "Next 365 Days",
  "Custom Range",
] as const;

export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export function forecastEndForHorizon(startDate: string, horizon: ForecastHorizon) {
  const days = {
    "Next 30 Days": 30,
    "Next 90 Days": 90,
    "Next 180 Days": 180,
    "Next 365 Days": 365,
  }[horizon as Exclude<ForecastHorizon, "Custom Range">];
  return days ? addDateDays(startDate, days - 1) : null;
}
