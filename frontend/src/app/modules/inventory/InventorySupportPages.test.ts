import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { filterInventoryCountHistory, inventoryCountHistoryActions, inventoryCountHistoryModes, PhysicalCountHistoryHeaderActions } from "./InventorySupportPages";
import type { InventoryCountSummary } from "../../types/inventoryWorkflow";

describe("inventory-count history role actions", () => {
  it("keeps Owner history read-only while exposing count details", () => {
    expect(inventoryCountHistoryActions("owner", true)).toEqual({ canView: true, canEdit: false, canDelete: false });
  });

  it("shows correction only when the server authorizes the Branch Manager", () => {
    expect(inventoryCountHistoryActions("manager", true)).toEqual({ canView: false, canEdit: true, canDelete: false });
    expect(inventoryCountHistoryActions("manager", false)).toEqual({ canView: false, canEdit: false, canDelete: false });
  });

  it("shows the separate UAT/Test history only to the Owner when the backend enables it", () => {
    expect(inventoryCountHistoryModes("owner", true)).toEqual(["operational", "uat"]);
    expect(inventoryCountHistoryModes("owner", false)).toEqual(["operational"]);
    expect(inventoryCountHistoryModes("manager", true)).toEqual(["operational"]);
  });

  it("keeps Stock History read-only and removes the Record Stock Count action", () => {
    const markup = renderToStaticMarkup(React.createElement(PhysicalCountHistoryHeaderActions, { onRefresh: () => undefined }));
    expect(markup).not.toContain("Record Stock Count");
    expect(markup).toContain("Refresh");
  });
});

describe("Stock History filters", () => {
  const count = (id: string, countDate: string, countType: InventoryCountSummary["countType"]): InventoryCountSummary => ({
    id, countNo: id, countDate, countType, submittedAt: `${countDate}T10:00:00Z`, branchId: "branch-1",
    branchName: "Gulod", submittedBy: "Manager", itemCount: 2, varianceCount: 0, canEdit: false,
  });
  const counts = [count("IC-1", "2026-10-15", "OPENING"), count("IC-2", "2026-10-15", "CLOSING"), count("IC-3", "2026-10-16", "FULL")];

  it("filters by count date", () => {
    expect(filterInventoryCountHistory(counts, "", "2026-10-15", "ALL").map((item) => item.id)).toEqual(["IC-1", "IC-2"]);
  });

  it("filters by Opening, Closing, and Full type", () => {
    expect(filterInventoryCountHistory(counts, "", "", "OPENING").map((item) => item.id)).toEqual(["IC-1"]);
    expect(filterInventoryCountHistory(counts, "", "", "CLOSING").map((item) => item.id)).toEqual(["IC-2"]);
    expect(filterInventoryCountHistory(counts, "", "", "FULL").map((item) => item.id)).toEqual(["IC-3"]);
  });

  it("combines search, date, and type filters without changing branch-scoped data", () => {
    expect(filterInventoryCountHistory(counts, "Gulod", "2026-10-15", "CLOSING").map((item) => item.id)).toEqual(["IC-2"]);
  });
});
