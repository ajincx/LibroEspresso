import { describe, expect, it } from "vitest";
import { reportRequest } from "./reports.js";

describe("report request model", () => {
  it("accepts each approved report type", () => {
    for (const reportType of [
      "SALES",
      "COGS_PROFITABILITY",
      "INVENTORY_STATUS",
      "INVENTORY_VARIANCE",
      "SHRINKAGE",
      "PURCHASE_ORDER",
      "PREDICTIVE_FORECAST",
      "ALL_REPORTS",
    ]) {
      expect(
        reportRequest.safeParse({
          reportType,
          startDate: "2026-09-01",
          endDate: "2026-09-30",
        }).success,
      ).toBe(true);
    }
  });
  it("rejects the removed standalone Management Analytics report type", () =>
    expect(
      reportRequest.safeParse({
        reportType: "MANAGEMENT_ANALYTICS",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      }).success,
    ).toBe(false));
  it("accepts one or multiple approved report selections", () => {
    const base = { startDate: "2026-09-01", endDate: "2026-09-30" };
    expect(reportRequest.parse({ ...base, reportTypes: ["SALES"] }).reportTypes).toEqual(["SALES"]);
    expect(reportRequest.parse({ ...base, reportTypes: ["SALES", "INVENTORY_STATUS"] }).reportTypes).toEqual(["SALES", "INVENTORY_STATUS"]);
  });
  it("rejects empty, duplicate, excessive, and invalid report selections", () => {
    const base = { startDate: "2026-09-01", endDate: "2026-09-30" };
    expect(reportRequest.safeParse({ ...base, reportTypes: [] }).success).toBe(false);
    expect(reportRequest.safeParse({ ...base, reportTypes: ["SALES", "SALES"] }).success).toBe(false);
    expect(reportRequest.safeParse({ ...base, reportTypes: ["SALES", "COGS_PROFITABILITY", "INVENTORY_STATUS", "INVENTORY_VARIANCE", "SHRINKAGE", "PURCHASE_ORDER", "PREDICTIVE_FORECAST", "SALES"] }).success).toBe(false);
    expect(reportRequest.safeParse({ ...base, reportTypes: ["MANAGEMENT_ANALYTICS"] }).success).toBe(false);
  });
  it("rejects an inverted reporting period", () =>
    expect(
      reportRequest.safeParse({
        reportType: "SALES",
        startDate: "2026-09-30",
        endDate: "2026-09-01",
      }).success,
    ).toBe(false));
  it("requires both forecast dates when either is provided", () =>
    expect(
      reportRequest.safeParse({
        reportType: "PREDICTIVE_FORECAST",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        forecastStart: "2026-10-01",
      }).success,
    ).toBe(false));
  it("limits preview page size", () =>
    expect(
      reportRequest.safeParse({
        reportType: "SALES",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        pageSize: 5000,
      }).success,
    ).toBe(false));
});
