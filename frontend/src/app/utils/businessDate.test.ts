import { describe, expect, it } from "vitest";
import { isValidBusinessDate, isValidBusinessDateRange, periodDates } from "./businessDate";

describe("reporting business dates", () => {
  it("rejects malformed, impossible, and reversed ranges", () => {
    expect(isValidBusinessDate("2026-02-29")).toBe(false);
    expect(isValidBusinessDate("2026-13-01")).toBe(false);
    expect(isValidBusinessDate("2026-10-27")).toBe(true);
    expect(isValidBusinessDateRange("2026-10-28", "2026-10-27")).toBe(false);
    expect(isValidBusinessDateRange("2026-10-21", "2026-10-27")).toBe(true);
  });

  it("uses the Asia/Manila date boundary for preset ranges", () => {
    const RealDate = Date;
    const instant = new RealDate("2026-10-26T16:30:00.000Z");
    globalThis.Date = class extends RealDate {
      constructor(value?: string | number | Date) { super(value ?? instant); }
      static now() { return instant.getTime(); }
    } as DateConstructor;
    try {
      expect(periodDates("today")).toEqual({ startDate: "2026-10-27", endDate: "2026-10-27" });
      expect(periodDates("7d")).toEqual({ startDate: "2026-10-21", endDate: "2026-10-27" });
      expect(periodDates("30d")).toEqual({ startDate: "2026-09-28", endDate: "2026-10-27" });
      expect(periodDates("mtd")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-27" });
    } finally {
      globalThis.Date = RealDate;
    }
  });
});
