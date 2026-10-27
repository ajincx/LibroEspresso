import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { CalendarDateField } from "../../components/ModuleUi";
import { displayStatus, InventoryCountDateFilter, inventoryCountDateMax, inventoryCountDateRangeError, varianceClassificationLabel, varianceScopeForStatus, varianceWithoutInvestigationLabel } from "./VariancePage";

describe("inventory count date filter", () => {
  const manilaOctober27 = new Date("2026-10-26T16:30:00.000Z");

  it("uses today in Asia/Manila as the maximum and allows historical dates including today", () => {
    expect(inventoryCountDateMax(manilaOctober27)).toBe("2026-10-27");
    expect(inventoryCountDateRangeError("2026-10-27", "2026-10-27", manilaOctober27)).toBe("");
    expect(inventoryCountDateRangeError("2026-08-26", "2026-10-27", manilaOctober27)).toBe("");
  });

  it("rejects future dates, impossible dates, and reversed ranges", () => {
    expect(inventoryCountDateRangeError("2026-10-28", "2026-10-28", manilaOctober27)).toBe("Inventory count dates cannot be in the future.");
    expect(inventoryCountDateRangeError("2026-02-30", "2026-02-30", manilaOctober27)).toBe("Enter a valid inventory count date.");
    expect(inventoryCountDateRangeError("2026-10-20", "2026-10-19", manilaOctober27)).toBe("Inventory count start date cannot be after the end date.");
  });

  it("handles the UTC-to-Manila business-date boundary", () => {
    expect(inventoryCountDateMax(new Date("2026-10-26T15:59:59.999Z"))).toBe("2026-10-26");
    expect(inventoryCountDateMax(new Date("2026-10-26T16:00:00.000Z"))).toBe("2026-10-27");
  });

  it("labels the picker clearly, disables dates after Manila today, and rejects a manual future value", () => {
    const onChange = vi.fn();
    const onValidationError = vi.fn();
    const renderer = create(createElement(InventoryCountDateFilter, { value: "", onChange, onValidationError, now: manilaOctober27 }));
    const field = renderer.root.findByType(CalendarDateField);
    expect(field.props.label).toBe("Inventory Count Date");
    expect(field.props.max).toBe("2026-10-27");
    act(() => field.props.onChange("2026-10-28"));
    expect(onChange).not.toHaveBeenCalled();
    expect(onValidationError).toHaveBeenLastCalledWith("Inventory count dates cannot be in the future.");
    act(() => field.props.onChange("2026-10-27"));
    expect(onChange).toHaveBeenCalledWith("2026-10-27");
    expect(onValidationError).toHaveBeenLastCalledWith("");
  });
});

describe("variance sign presentation", () => {
  it("treats negative Actual-minus-Expected variance as shortage", () => {
    expect(displayStatus({ varianceQuantity: -54, anomalyStatus: null, requiresInvestigation: false } as never)).toBe("SHORTAGE_WITHIN_TOLERANCE");
  });

  it("treats positive Actual-minus-Expected variance as excess", () => {
    expect(displayStatus({ varianceQuantity: 46, anomalyStatus: null } as never)).toBe("EXCESS_WITHIN_TOLERANCE");
  });

  it("keeps zero variance matched", () => {
    expect(displayStatus({ varianceQuantity: 0, anomalyStatus: null } as never)).toBe("MATCHED");
  });

  it("requests matched records only when the existing Matched filter is selected", () => {
    expect(varianceScopeForStatus("MATCHED")).toBe("MATCHED");
    expect(varianceScopeForStatus("")).toBe("DISCREPANCIES");
    expect(varianceScopeForStatus("DETECTED")).toBe("DISCREPANCIES");
  });

  it("explains why the historical Caramel Syrup variance has no investigation", () => {
    const caramel = { varianceQuantity: -0.02, anomalyId: null, classification: null, requiresInvestigation: false } as never;
    expect(displayStatus(caramel)).toBe("SHORTAGE_WITHIN_TOLERANCE");
    expect(varianceWithoutInvestigationLabel(caramel)).toBe("Within tolerance — no investigation");
    expect(varianceClassificationLabel(caramel)).toBe("No investigation classification — within tolerance");
    expect(varianceWithoutInvestigationLabel({ varianceQuantity: 5, anomalyId: null } as never)).toBe("Excess — no shortage investigation");
  });

  it.each([
    ["Bacon", -865],
    ["Espresso Blend Beans", -262],
  ])("flags a material %s shortage when its authoritative investigation record is missing", (_name, varianceQuantity) => {
    const record = { varianceQuantity, anomalyId: null, anomalyStatus: null, classification: null, requiresInvestigation: true } as never;
    expect(displayStatus(record)).toBe("MISSING_INVESTIGATION");
    expect(varianceWithoutInvestigationLabel(record)).toBe("Investigation record missing");
    expect(varianceClassificationLabel(record)).toBe("Unexplained Variance — Investigation record missing");
  });

  it("preserves the authoritative classification and linkage of an archived investigation", () => {
    const archived = { anomalyId: "report-1", classification: "PILFERAGE", requiresInvestigation: true } as never;
    expect(varianceClassificationLabel(archived)).toBe("Verified Pilferage");
    expect(varianceWithoutInvestigationLabel(archived)).toBe("Investigation available");
  });
});
