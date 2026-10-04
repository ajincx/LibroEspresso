import { describe, expect, it, vi } from "vitest";
import { assessPosImportInventoryDates } from "./posInventoryDate.service.js";

describe("POS inventory date assessment", () => {
  it("flags a September sale imported after an October baseline without writing inventory", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ latestBaselineDate: "2026-10-02" }] })
      .mockResolvedValueOnce({ rows: [{ id: "count-1", countNo: "IC-2026-00009", countDate: "2026-10-02", affectedItemCount: 53, varianceCount: 1 }] });

    const result = await assessPosImportInventoryDates({ query } as never, "import-1");

    expect(result).toEqual({
      lateHistoricalImport: true,
      latestBaselineDate: "2026-10-02",
      affectedCountPeriods: [{ id: "count-1", countNo: "IC-2026-00009", countDate: "2026-10-02", affectedItemCount: 53, varianceCount: 1 }],
    });
    expect(query.mock.calls.map(([sql]) => String(sql)).join("\n")).not.toMatch(/UPDATE|DELETE|INSERT/i);
  });

  it("does not flag an import when no physical-count baseline covers its business date", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ latestBaselineDate: null }] });

    await expect(assessPosImportInventoryDates({ query } as never, "import-1")).resolves.toEqual({
      lateHistoricalImport: false,
      latestBaselineDate: null,
      affectedCountPeriods: [],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
