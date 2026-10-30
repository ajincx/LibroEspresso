import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { ExpectedInventoryItem } from "../../types/inventoryWorkflow";
import { allowedPhysicalCountUnits, blankPhysicalCountEntry, buildPhysicalCountItems, canLeavePhysicalCountEntry, changePhysicalCountEntryUnit, closingPosUsedIngredientIds, closingPosUsageSummary, confirmPhysicalCountCopy, copyPreviousClosingEntries, copySameDayClosingEntries, displayedPhysicalCountVariance, filterPhysicalCountItems, fullCountCopySourceMessage, fullCountSubmissionBlockReason, initialPhysicalCountDate, inventoryCountColumns, isDailyCountColumnEditable, isFutureInventoryCountDate, mergeOpeningCorrectionEntries, normalizePhysicalCountPreview, PHYSICAL_COUNT_INVESTIGATION_GUIDANCE, PhysicalCountBackAction, PhysicalCountCorrectionDialog, PhysicalCountLoadingSkeleton, physicalCountCompletion, physicalCountCorrectionReasonError, physicalCountEntryFromCanonical, physicalCountPreviewVariance, physicalCountVarianceLabel, PosUsageIndicator, previousClosingCopyMessage, previousPhysicalCopyMessage, savedCountQuantities, showInventoryCountDateFilter, validPhysicalCountEntries } from "./InventoryCountPage";
import { buildEnteredPhysicalCountItems } from "./InventoryCountPage";

const item = (inventoryItemId: string, sku: string, itemName: string): ExpectedInventoryItem => ({
  inventoryItemId, sku, itemName, unit: "pc", unitCost: 1, previousActualQuantity: 10,
  stockReceived: 0, expectedConsumption: 0, approvedAdjustments: 0, expectedQuantity: 10,
  baselineDate: "2026-10-01",
});
const ingredients = [item("ice", "RM-004", "Ice"), item("milk", "RM-005", "Whole Milk"), item("sugar", "ING-010", "Brown Sugar")];

describe("Daily partial physical counts",()=>{
  it("uses a layout-matched accessible skeleton while expected stock is calculated",()=>{
    const markup=renderToStaticMarkup(React.createElement(PhysicalCountLoadingSkeleton));
    expect(markup).toContain("data-physical-count-skeleton");
    expect(markup).toContain('aria-label="Calculating expected stock"');
    expect(markup).toContain("motion-reduce:animate-none");
    expect(markup).toContain("Full Physical Count Entry");
    expect(markup).toContain("Expected Stock");
    expect(markup).not.toContain("No inventory");
  });

  it("saves explicit zero and omits blank ingredients",()=>{
    expect(buildEnteredPhysicalCountItems(ingredients,{
      ice:{quantity:"0",enteredUnit:"pc"},milk:{quantity:"",enteredUnit:"pc"},sugar:{quantity:"3",enteredUnit:"pc"},
    })).toEqual([
      {inventoryItemId:"ice",quantity:0,enteredUnit:"pc"},
      {inventoryItemId:"sugar",quantity:3,enteredUnit:"pc"},
    ]);
  });

  it("uses side-by-side Opening and Closing columns while editing only the active count",()=>{
    expect(inventoryCountColumns("OPENING")).toEqual(["SKU","Ingredient","Previous Actual","Received","Recipe Consumption","Expected Stock","Opening Count","Closing Count","Preview Variance"]);
    expect(isDailyCountColumnEditable("OPENING","OPENING")).toBe(true);
    expect(isDailyCountColumnEditable("OPENING","CLOSING")).toBe(false);
    expect(isDailyCountColumnEditable("CLOSING","OPENING")).toBe(false);
    expect(isDailyCountColumnEditable("CLOSING","CLOSING")).toBe(true);
  });

  it("keeps the complete Full Physical Count table",()=>{
    expect(inventoryCountColumns("FULL")).toEqual(["SKU","Ingredient","Previous Actual","Received","Recipe Consumption","Expected Stock","Physical Count","Preview Variance"]);
  });

  it("identifies distinct positive POS usage only for Closing Count",()=>{
    const usedMilk={...ingredients[1]!,expectedConsumption:250};
    const usedMilkDuplicate={...usedMilk};
    const usedSugar={...ingredients[2]!,expectedConsumption:12};
    const zeroIce={...ingredients[0]!,expectedConsumption:0};
    expect([...closingPosUsedIngredientIds([usedMilk,usedMilkDuplicate,usedSugar,zeroIce],"CLOSING")]).toEqual(["milk","sugar"]);
    expect(closingPosUsedIngredientIds([usedMilk,usedSugar],"OPENING").size).toBe(0);
    expect(closingPosUsedIngredientIds([usedMilk,usedSugar],"FULL").size).toBe(0);
  });

  it("renders the compact usage indicator and accurate distinct or neutral summaries",()=>{
    const markup=renderToStaticMarkup(React.createElement(PosUsageIndicator));
    expect(markup).toContain("Used in POS Sales");
    expect(markup).toContain("bg-[var(--app-primary)]");
    expect(closingPosUsageSummary(1)).toBe("1 ingredient used in POS sales");
    expect(closingPosUsageSummary(2)).toBe("2 ingredients used in POS sales");
    expect(closingPosUsageSummary(0)).toBe("No operational POS ingredient usage in this count interval.");
  });

  it("keeps every eligible ingredient visible and POS usage informational for partial counts",()=>{
    const used=[{...ingredients[0]!,expectedConsumption:4},ingredients[1]!,ingredients[2]!];
    expect(filterPhysicalCountItems(used,"","ALL",{})).toHaveLength(3);
    expect(buildEnteredPhysicalCountItems(used,{
      ice:{quantity:"",enteredUnit:"pc"},milk:{quantity:"2",enteredUnit:"pc"},sugar:{quantity:"",enteredUnit:"pc"},
    })).toEqual([{inventoryItemId:"milk",quantity:2,enteredUnit:"pc"}]);
  });

  it("shows Opening, Closing, and Full variance previews",()=>{
    expect(displayedPhysicalCountVariance("OPENING",3500,3300)).toBe(-200);
    expect(displayedPhysicalCountVariance("CLOSING",3500,3300)).toBe(-200);
    expect(displayedPhysicalCountVariance("FULL",3500,3300)).toBe(-200);
    expect(displayedPhysicalCountVariance("CLOSING",3500,null)).toBeNull();
    expect(physicalCountVarianceLabel("OPENING",-200)).toBe("Opening Shortage");
    expect(physicalCountVarianceLabel("OPENING",200)).toBe("Opening Excess");
    expect(physicalCountVarianceLabel("OPENING",0)).toBe("Matched");
  });

  it("identifies the authoritative source date after copying previous quantities",()=>{
    expect(previousClosingCopyMessage("2026-10-15")).toBe(
      "Values copied from the previous Closing Count on 2026-10-15. Review and confirm them before submitting.",
    );
    expect(previousPhysicalCopyMessage({id:"full",countNo:"IC-FULL",countType:"FULL",countDate:"2026-10-16",submittedAt:"2026-10-16T15:00:00Z"})).toBe(
      "Values copied from IC-FULL (Full Physical Count) on 2026-10-16. Review and confirm them before submitting.",
    );
  });

  it("prefills only originally counted ingredients when editing an Opening Count",()=>{
    expect(mergeOpeningCorrectionEntries(ingredients,[
      {...ingredients[0]!,actualQuantity:0,unit:"pc"},
      {...ingredients[2]!,actualQuantity:3,unit:"pc"},
    ])).toEqual({
      ice:{quantity:"0",enteredUnit:"pc"},
      milk:{quantity:"",enteredUnit:"pc"},
      sugar:{quantity:"3",enteredUnit:"pc"},
    });
  });

  it("copies explicit zero while leaving ingredients missing from the previous Closing blank",()=>{
    expect(copyPreviousClosingEntries(ingredients,[
      {inventoryItemId:"ice",actualQuantity:0,countDate:"2026-10-15"},
      {inventoryItemId:"sugar",actualQuantity:3,countDate:"2026-10-15"},
    ])).toEqual({
      ice:{quantity:"0",enteredUnit:"pc"},
      milk:{quantity:"",enteredUnit:"pc"},
      sugar:{quantity:"3",enteredUnit:"pc"},
    });
  });

  it("requires confirmation before copied quantities replace manual entries",()=>{
    const confirm=vi.fn(()=>false);
    expect(confirmPhysicalCountCopy(0,confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(confirmPhysicalCountCopy(1,confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("copies a latest physical checkpoint into a Full Count while leaving missing ingredients blank",()=>{
    expect(copySameDayClosingEntries(ingredients,[
      {inventoryItemId:"ice",actualQuantity:0},
      {inventoryItemId:"sugar",actualQuantity:3},
    ])).toEqual({
      ice:{quantity:"0",enteredUnit:"pc"},
      milk:{quantity:"",enteredUnit:"pc"},
      sugar:{quantity:"3",enteredUnit:"pc"},
    });
    expect(fullCountCopySourceMessage({id:"closing",countNo:"IC-2026-00010",countType:"CLOSING",countDate:"2026-10-29",effectiveAt:"2026-10-29T12:00:00.000Z",submittedAt:"2026-10-29T12:01:00.000Z"},"2026-10-29")).toContain("finalized CLOSING checkpoint IC-2026-00010");
    expect(fullCountCopySourceMessage({id:"closing",countNo:"IC-2026-00010",countType:"CLOSING",countDate:"2026-10-29",effectiveAt:null,submittedAt:"2026-10-29T12:01:00.000Z"},"2026-10-29")).toContain("not physically verified");
    expect(fullCountCopySourceMessage({id:"full",countNo:"IC-2026-00009",countType:"FULL",countDate:"2026-10-28",effectiveAt:null,submittedAt:"2026-10-28T13:01:00.000Z"},"2026-10-29")).toContain("finalized FULL checkpoint IC-2026-00009");
  });

  it("blocks Full entry until Closing and after the weekly limit while allowing the ready state",()=>{
    const base={countType:"FULL" as const,closingCount:null,fullCount:null,sameDayClosingItems:[],weeklyFullCount:0,weeklyFullLimit:3};
    expect(fullCountSubmissionBlockReason(base)).toContain("same-day Closing Count");
    expect(fullCountSubmissionBlockReason({...base,closingCount:{id:"closing",countNo:"IC-C",countType:"CLOSING",submittedAt:"now"},weeklyFullCount:2})).toBeNull();
    expect(fullCountSubmissionBlockReason({...base,closingCount:{id:"closing",countNo:"IC-C",countType:"CLOSING",submittedAt:"now"},weeklyFullCount:3})).toContain("limit of three");
    expect(fullCountSubmissionBlockReason({...base,closingCount:{id:"closing",countNo:"IC-C",countType:"CLOSING",submittedAt:"now"},fullCount:{id:"full",countNo:"IC-F",countType:"FULL",submittedAt:"now"}})).toContain("already been recorded");
  });

  it("supports the Daily Count return label without changing the Full Count default",()=>{
    expect(renderToStaticMarkup(React.createElement(PhysicalCountBackAction,{onBack:vi.fn()}))).toContain("Back to Count History");
    expect(renderToStaticMarkup(React.createElement(PhysicalCountBackAction,{onBack:vi.fn(),label:"Back to Operations"}))).toContain("Back to Operations");
  });

  it("uses today's business date without showing a Daily Count date filter",()=>{
    expect(showInventoryCountDateFilter("OPENING")).toBe(false);
    expect(showInventoryCountDateFilter("CLOSING")).toBe(false);
    expect(showInventoryCountDateFilter("FULL")).toBe(true);
  });

  it("preserves submitted Opening and Closing quantities for read-only display",()=>{
    expect(savedCountQuantities([
      {inventoryItemId:"ice",actualQuantity:0},
      {inventoryItemId:"milk",actualQuantity:11960},
    ])).toEqual({ice:0,milk:11960});
  });
});

describe("Inventory physical-count history navigation", () => {
  it("uses an application correction modal with the database-aligned 10-character reason and no PIN",()=>{
    const blank=renderToStaticMarkup(React.createElement(PhysicalCountCorrectionDialog,{countType:"OPENING",reason:"   ",error:physicalCountCorrectionReasonError("   "),busy:false,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    const short=renderToStaticMarkup(React.createElement(PhysicalCountCorrectionDialog,{countType:"OPENING",reason:"Fix",error:physicalCountCorrectionReasonError("Fix"),busy:false,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    const valid=renderToStaticMarkup(React.createElement(PhysicalCountCorrectionDialog,{countType:"OPENING",reason:"Count fixed",error:"",busy:false,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    expect(blank).toContain("Confirm Opening Count Correction");
    expect(blank).toContain("Reason for Correction");
    expect(blank).toContain("Close correction dialog");
    expect(blank).not.toContain("Verification PIN");
    expect(blank).toContain("at least 10 characters");
    expect(blank).toMatch(/<button[^>]*disabled[^>]*>Confirm Correction<\/button>/);
    expect(short).toMatch(/<button[^>]*disabled[^>]*>Confirm Correction<\/button>/);
    expect(valid).not.toMatch(/<button[^>]*disabled[^>]*>Confirm Correction<\/button>/);
  });

  it("keeps correction dismissal separate from edited quantity state",()=>{
    const entries={ice:{quantity:"12",enteredUnit:"pc" as const}};
    const onCancel=vi.fn();
    const dialog=PhysicalCountCorrectionDialog({countType:"OPENING",reason:"Fix",error:"",busy:false,onReasonChange:vi.fn(),onCancel,onConfirm:vi.fn()}) as React.ReactElement;
    expect(dialog.props.onCancel).toBe(onCancel);
    expect(entries.ice.quantity).toBe("12");
  });

  it("submits one correction action and disables confirmation while submitting",()=>{
    const onConfirm=vi.fn();
    let renderer:ReactTestRenderer;
    act(()=>{renderer=create(React.createElement(PhysicalCountCorrectionDialog,{countType:"OPENING",reason:"Fix",error:"",busy:false,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm}));});
    const confirmButton=renderer!.root.findAllByType("button").find((node:ReactTestInstance)=>node.children.join("")==="Confirm Correction");
    expect(confirmButton).toBeDefined();
    act(()=>confirmButton!.props.onClick());
    expect(onConfirm).toHaveBeenCalledOnce();
    act(()=>renderer!.update(React.createElement(PhysicalCountCorrectionDialog,{countType:"OPENING",reason:"Fix",error:"A later inventory event prevents this correction.",busy:true,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm})));
    const busyButton=renderer!.root.findAllByType("button").find((node:ReactTestInstance)=>node.children.join("")==="Processing…");
    expect(busyButton?.props.disabled).toBe(true);
    expect(renderer!.root.findAll((node:ReactTestInstance)=>node.props.role==="alert")[0]?.children.join("")).toContain("later inventory event");
    act(()=>renderer!.unmount());
  });

  it("uses the same correction modal safely for Closing and Full counts",()=>{
    const closing=renderToStaticMarkup(React.createElement(PhysicalCountCorrectionDialog,{countType:"CLOSING",reason:"Fix",error:"",busy:false,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    const full=renderToStaticMarkup(React.createElement(PhysicalCountCorrectionDialog,{countType:"FULL",reason:"Fix",error:"",busy:false,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    expect(closing).toContain("Confirm Closing Count Correction");
    expect(full).toContain("Confirm Full Physical Count Correction");
  });

  it("explains that only material discrepancies may require investigation", () => {
    expect(PHYSICAL_COUNT_INVESTIGATION_GUIDANCE).toBe(
      "Significant discrepancies may require an investigation based on the configured tolerance.",
    );
    expect(PHYSICAL_COUNT_INVESTIGATION_GUIDANCE).not.toContain("automatically");
  });

  it("renders Back to Count History and forwards the navigation action", () => {
    const onBack = vi.fn();
    const markup = renderToStaticMarkup(React.createElement(PhysicalCountBackAction, { onBack }));
    expect(markup).toContain("Back to Count History");
    const action = PhysicalCountBackAction({ onBack }) as React.ReactElement<{ onClick: () => void }>;
    action.props.onClick();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("does not submit or discard an edited draft without confirmation", () => {
    const confirmLeave = vi.fn(() => false);
    expect(canLeavePhysicalCountEntry(true, confirmLeave)).toBe(false);
    expect(confirmLeave).toHaveBeenCalledOnce();
  });

  it("returns without prompting when the entry has not been changed", () => {
    const confirmLeave = vi.fn(() => false);
    expect(canLeavePhysicalCountEntry(false, confirmLeave)).toBe(true);
    expect(confirmLeave).not.toHaveBeenCalled();
  });
});

describe("Inventory physical-count business-date protection", () => {
  const currentBusinessDate = "2026-10-01";

  it("uses the current business date as the inclusive maximum", () => {
    expect(isFutureInventoryCountDate(currentBusinessDate, currentBusinessDate)).toBe(false);
  });

  it("rejects a future count date at submit time", () => {
    expect(isFutureInventoryCountDate("2026-10-02", currentBusinessDate)).toBe(true);
  });

  it("allows an earlier count date", () => {
    expect(isFutureInventoryCountDate("2026-09-30", currentBusinessDate)).toBe(false);
  });

  it("uses a valid requested PO order date and rejects a future requested date", () => {
    expect(initialPhysicalCountDate("2026-10-01", "2026-10-03")).toBe("2026-10-01");
    expect(initialPhysicalCountDate("2026-10-04", "2026-10-03")).toBe("2026-10-03");
  });
});

describe("Inventory physical-count ingredient search", () => {
  it("filters by ingredient name", () => {
    expect(filterPhysicalCountItems(ingredients, "Ice").map((entry) => entry.inventoryItemId)).toEqual(["ice"]);
  });

  it("filters by SKU", () => {
    expect(filterPhysicalCountItems(ingredients, "RM-004").map((entry) => entry.itemName)).toEqual(["Ice"]);
  });

  it("matches case-insensitively and supports no results", () => {
    expect(filterPhysicalCountItems(ingredients, "wHoLe MiLk")).toEqual([ingredients[1]]);
    expect(filterPhysicalCountItems(ingredients, "not-present")).toEqual([]);
  });

  it("restores all items when search is cleared", () => {
    expect(filterPhysicalCountItems(ingredients, "")).toEqual(ingredients);
  });

  it("preserves entered quantities while filtering", () => {
    const actual = { ice: { quantity: "20", enteredUnit: "pc" as const }, milk: { quantity: "15", enteredUnit: "pc" as const }, sugar: { quantity: "8", enteredUnit: "pc" as const } };
    filterPhysicalCountItems(ingredients, "Ice");
    filterPhysicalCountItems(ingredients, "");
    expect(actual).toEqual({
      ice: { quantity: "20", enteredUnit: "pc" },
      milk: { quantity: "15", enteredUnit: "pc" },
      sugar: { quantity: "8", enteredUnit: "pc" },
    });
  });

  it("builds the submitted item set from every ingredient, not filtered rows", () => {
    const actual = { ice: { quantity: "20", enteredUnit: "pc" as const }, milk: { quantity: "15", enteredUnit: "pc" as const }, sugar: { quantity: "8", enteredUnit: "pc" as const } };
    expect(filterPhysicalCountItems(ingredients, "Ice")).toHaveLength(1);
    expect(buildPhysicalCountItems(ingredients, actual)).toEqual([
      { inventoryItemId: "ice", quantity: 20, enteredUnit: "pc" },
      { inventoryItemId: "milk", quantity: 15, enteredUnit: "pc" },
      { inventoryItemId: "sugar", quantity: 8, enteredUnit: "pc" },
    ]);
  });

  it("does not add a No Baseline item to the submitted count set", () => {
    const actual = { ice: { quantity: "20", enteredUnit: "pc" as const }, milk: { quantity: "15", enteredUnit: "pc" as const }, sugar: { quantity: "8", enteredUnit: "pc" as const }, "test-oat": { quantity: "99", enteredUnit: "ml" as const } };
    expect(buildPhysicalCountItems(ingredients, actual)).not.toContainEqual({
      inventoryItemId: "test-oat",
      quantity: 99,
      enteredUnit: "ml",
    });
  });

  it("filters counted and not-counted items without changing full-set progress", () => {
    const entries = {
      ice: { quantity: "0", enteredUnit: "pc" as const },
      milk: { quantity: "", enteredUnit: "pc" as const },
      sugar: { quantity: "8", enteredUnit: "pc" as const },
    };
    expect(filterPhysicalCountItems(ingredients, "", "COUNTED", entries).map((entry) => entry.inventoryItemId)).toEqual(["ice", "sugar"]);
    expect(filterPhysicalCountItems(ingredients, "", "NOT_COUNTED", entries).map((entry) => entry.inventoryItemId)).toEqual(["milk"]);
    expect(physicalCountCompletion(ingredients, entries)).toMatchObject({ counted: 2, remaining: 1 });
    expect(filterPhysicalCountItems(ingredients, "Ice", "ALL", entries)).toHaveLength(1);
    expect(physicalCountCompletion(ingredients, entries)).toMatchObject({ counted: 2, remaining: 1 });
  });
});

describe("Inventory physical-count unit entry", () => {
  it("starts a new physical count blank in the canonical unit", () => {
    expect(blankPhysicalCountEntry("g")).toEqual({ quantity: "", enteredUnit: "g" });
    expect(normalizePhysicalCountPreview(blankPhysicalCountEntry("g"), "g")).toBeNull();
  });

  it("offers the correct units for canonical g, ml, and pc", () => {
    expect(allowedPhysicalCountUnits("g")).toEqual(["g", "kg"]);
    expect(allowedPhysicalCountUnits("ml")).toEqual(["ml", "L"]);
    expect(allowedPhysicalCountUnits("pc")).toEqual(["pc"]);
  });

  it("displays 3864 g as 3.864 kg and previews the canonical quantity", () => {
    const entry = physicalCountEntryFromCanonical(3864, "g");
    expect(entry).toEqual({ quantity: "3.864", enteredUnit: "kg" });
    expect(normalizePhysicalCountPreview(entry, "g")).toBe(3864);
  });

  it("previews L to ml and preserves canonical input", () => {
    expect(normalizePhysicalCountPreview({ quantity: "2.5", enteredUnit: "L" }, "ml")).toBe(2500);
    expect(normalizePhysicalCountPreview({ quantity: "3864", enteredUnit: "g" }, "g")).toBe(3864);
  });

  it("preserves the canonical quantity when the Manager changes display units", () => {
    const kilograms = changePhysicalCountEntryUnit({ quantity: "3260", enteredUnit: "g" }, "g", "kg");
    expect(kilograms).toEqual({ quantity: "3.26", enteredUnit: "kg" });
    expect(normalizePhysicalCountPreview(kilograms, "g")).toBe(3260);
    expect(changePhysicalCountEntryUnit(kilograms, "g", "g")).toEqual({ quantity: "3260", enteredUnit: "g" });
  });

  it("accepts zero and decimals but rejects empty, negative, and incompatible entries", () => {
    expect(normalizePhysicalCountPreview({ quantity: "0", enteredUnit: "g" }, "g")).toBe(0);
    expect(normalizePhysicalCountPreview({ quantity: "1.25", enteredUnit: "kg" }, "g")).toBe(1250);
    expect(normalizePhysicalCountPreview({ quantity: "", enteredUnit: "g" }, "g")).toBeNull();
    expect(normalizePhysicalCountPreview({ quantity: "-1", enteredUnit: "g" }, "g")).toBeNull();
    expect(normalizePhysicalCountPreview({ quantity: "3", enteredUnit: "L" }, "g")).toBeNull();
  });

  it("requires every countable item to have a valid entry", () => {
    expect(validPhysicalCountEntries([ingredients[0]!], { ice: { quantity: "10", enteredUnit: "pc" } })).toBe(true);
    expect(validPhysicalCountEntries([ingredients[0]!], { ice: { quantity: "", enteredUnit: "pc" } })).toBe(false);
  });

  it("previews variance as Actual minus Expected", () => {
    expect(physicalCountPreviewVariance(5054, 5000)).toBe(-54);
    expect(physicalCountPreviewVariance(5054, 5100)).toBe(46);
    expect(physicalCountPreviewVariance(5054, 5054)).toBe(0);
  });
});
