import { describe, expect, it, vi } from "vitest";
import { assessPosImportInventoryDates, resolveHistoricalPosInventoryTreatment } from "./posInventoryDate.service.js";

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

describe("historical POS checkpoint coverage", () => {
  it("allows normal imports when no later finalized checkpoint exists", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });

    await expect(resolveHistoricalPosInventoryTreatment(
      { query } as never,
      "00000000-0000-4000-8000-000000000001",
      "2026-10-01",
      ["00000000-0000-4000-8000-000000000011"],
    )).resolves.toEqual({
      laterInventoryCheckpoint: false,
      firstCheckpoint: null,
      affectedIngredientCount: 1,
      coveredIngredientCount: 0,
      uncoveredIngredientCount: 0,
      inventoryAccountingTreatment: "OPERATIONAL",
      cogsCostBasis: "IMPORT_TIME_CONFIGURED_COST",
      accountingReason: null,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("allows a historical import when all affected ingredients have later checkpoints", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ countNo: "IC-2026-00010", countType: "CLOSING" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(resolveHistoricalPosInventoryTreatment(
      { query } as never,
      "00000000-0000-4000-8000-000000000001",
      "2026-10-01",
      [
        "00000000-0000-4000-8000-000000000011",
        "00000000-0000-4000-8000-000000000012",
        "00000000-0000-4000-8000-000000000011",
      ],
    )).resolves.toEqual({
      laterInventoryCheckpoint: true,
      firstCheckpoint: { countNo: "IC-2026-00010", countType: "CLOSING" },
      affectedIngredientCount: 2,
      coveredIngredientCount: 2,
      uncoveredIngredientCount: 0,
      inventoryAccountingTreatment: "OPERATIONAL",
      cogsCostBasis: "IMPORT_TIME_CONFIGURED_COST",
      accountingReason: null,
    });
    expect(query.mock.calls[1]?.[1]?.[2]).toEqual([
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
    ]);
    expect(query.mock.calls[1]?.[0]).toContain("count_record.count_type IN ('OPENING','CLOSING','FULL')");
    expect(query.mock.calls[1]?.[0]).toContain("count_record.count_type='OPENING' AND count_record.count_date > $2::date");
  });

  it("marks partial checkpoint coverage as an explicit historical reporting cutover", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ countNo: "IC-2026-00010", countType: "FULL" }] })
      .mockResolvedValueOnce({ rows: [{ inventoryItemId: "00000000-0000-4000-8000-000000000012" }] });

    await expect(resolveHistoricalPosInventoryTreatment(
      { query } as never,
      "00000000-0000-4000-8000-000000000001",
      "2026-10-01",
      [
        "00000000-0000-4000-8000-000000000011",
        "00000000-0000-4000-8000-000000000012",
      ],
    )).resolves.toMatchObject({
      laterInventoryCheckpoint: true,
      affectedIngredientCount: 2,
      coveredIngredientCount: 1,
      uncoveredIngredientCount: 1,
      inventoryAccountingTreatment: "HISTORICAL_REPORTING_CUTOVER",
      cogsCostBasis: "HISTORICAL_CONFIGURED_COST_ESTIMATE",
      accountingReason: expect.stringContaining("excluded from live stock calculations"),
    });
  });
});
