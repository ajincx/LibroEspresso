import { describe, expect, it } from "vitest";
import { reportAuditMetadata } from "./reports.controller.js";
import { reportRequest } from "../validators/reports.js";

describe("report export audit metadata", () => {
  it("contains reproducibility filters and excludes credentials", () => {
    const input = reportRequest.parse({
      reportType: "SALES",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      branchId: "00000000-0000-4000-8000-000000000001",
      productId: "00000000-0000-4000-8000-000000000002",
      password: "secret",
      jwt: "token",
    });
    const metadata = reportAuditMetadata(input);
    expect(metadata).toMatchObject({
      reportType: "SALES",
      reportTypes: ["SALES"],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect(JSON.stringify(metadata)).not.toContain("secret");
    expect(JSON.stringify(metadata)).not.toContain("token");
    expect(metadata).not.toHaveProperty("password");
  });
  it("records all selected report types without binary content", () => {
    const input = reportRequest.parse({ reportTypes: ["SALES", "SHRINKAGE"], startDate: "2026-09-01", endDate: "2026-09-30" });
    const metadata = reportAuditMetadata(input);
    expect(metadata.reportTypes).toEqual(["SALES", "SHRINKAGE"]);
    expect(metadata).not.toHaveProperty("binary");
  });
});
