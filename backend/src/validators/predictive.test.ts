import { describe, expect, it } from "vitest";
import { manilaBusinessDate } from "../services/businessTime.service.js";
import { predictiveForecastInput } from "./predictive.js";

const DAY = 86_400_000;
const today = manilaBusinessDate();
const addDays = (days: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

describe("predictiveForecastInput", () => {
  it("accepts an inclusive 365-day forecast period", () => {
    expect(predictiveForecastInput.parse({ startDate: today, endDate: addDays(364) })).toEqual({
      startDate: today,
      endDate: addDays(364),
    });
  });

  it("rejects an inclusive 366-day forecast period", () => {
    expect(() => predictiveForecastInput.parse({ startDate: today, endDate: addDays(365) })).toThrow(
      "Forecast period cannot exceed 365 days",
    );
  });
});
