import { describe, expect, it } from "vitest";
import {
  inventoryCountInput,
  inventoryMovementInput,
  posImportInput,
  posPreviewInput,
  shrinkageInvestigationInput,
} from "./inventoryWorkflow.js";

describe("Inventory Workflow Input Validation (QA Suite)", () => {
  const sampleUuid1 = "11111111-1111-4111-8111-111111111111";
  const sampleUuid2 = "22222222-2222-4222-8222-222222222222";

  describe("posImportInput", () => {
    const csvText = "product_code,quantity_sold,selling_price,business_date\nLATTE,2,180,2026-09-04";

    it("accepts raw CSV preview payloads", () => {
      expect(posPreviewInput.parse({ sourceFilename: "pos_sales.csv", csvText })).toEqual({ sourceFilename: "pos_sales.csv", csvText });
    });

    it("requires a preview fingerprint for final import", () => {
      expect(() => posImportInput.parse({ sourceFilename: "pos_sales.csv", csvText })).toThrow();
      expect(posImportInput.parse({ sourceFilename: "pos_sales.csv", csvText, expectedContentHash: "a".repeat(64) }).expectedContentHash).toHaveLength(64);
    });

    it("rejects non-CSV filenames and oversized source content", () => {
      expect(() => posPreviewInput.parse({ sourceFilename: "sales.xlsx", csvText })).toThrow();
      expect(() => posPreviewInput.parse({ sourceFilename: "sales.csv", csvText: "x".repeat(4_500_001) })).toThrow();
    });

    it("strips submitted branch overrides", () => {
      expect(posPreviewInput.parse({ sourceFilename: "sales.csv", csvText, branchId: sampleUuid1 })).not.toHaveProperty("branchId");
    });
  });

  describe("inventoryCountInput", () => {
    it("accepts valid physical inventory counts", () => {
      const valid = {
        countDate: "2026-09-04",
        items: [
          { inventoryItemId: sampleUuid1, actualQuantity: 2500 },
          { inventoryItemId: sampleUuid2, actualQuantity: 0 }, // 0 is allowed (out of stock)
        ],
      };
      const parsed = inventoryCountInput.parse(valid);
      expect(parsed.countDate).toBe("2026-09-04");
      expect(parsed.items[1]!.actualQuantity).toBe(0);
    });

    it("rejects negative physical counts", () => {
      const invalid = {
        countDate: "2026-09-04",
        items: [{ inventoryItemId: sampleUuid1, actualQuantity: -5 }],
      };
      expect(() => inventoryCountInput.parse(invalid)).toThrow();
    });
  });

  describe("shrinkageInvestigationInput", () => {
    it("requires at least 10 characters for the manager investigation explanation", () => {
      const valid = {
        classification: "SPOILAGE",
        explanation: "Dairy carton dropped during morning rush, spoiled unusable.",
      };
      expect(shrinkageInvestigationInput.parse(valid).classification).toBe("SPOILAGE");

      const tooShort = {
        classification: "SPOILAGE",
        explanation: "Spoiled",
      };
      expect(() => shrinkageInvestigationInput.parse(tooShort)).toThrow();
    });

    it("accepts DAMAGED_ITEM and PREPARATION_ERROR classifications", () => {
      expect(
        shrinkageInvestigationInput.parse({
          classification: "DAMAGED_ITEM",
          explanation: "Glass packaging shattered in storage rack.",
        }).classification,
      ).toBe("DAMAGED_ITEM");

      expect(
        shrinkageInvestigationInput.parse({
          classification: "PREPARATION_ERROR",
          explanation: "Espresso machine calibration error during bar prep.",
        }).classification,
      ).toBe("PREPARATION_ERROR");
    });

    it.each(["SPILLAGE", "OVERPRODUCTION", "EXPIRATION", "UNAUTHORIZED_CONSUMPTION"])("accepts legitimate Manager classification %s", (classification) => {
      expect(shrinkageInvestigationInput.parse({ classification, explanation: "The Branch Manager documented the operational evidence." }).classification).toBe(classification);
    });

    it("rejects Verified Pilferage without detailed notes, evidence basis, and confirmation", () => {
      expect(() => shrinkageInvestigationInput.parse({ classification: "PILFERAGE", explanation: "Detailed investigation notes are present here." })).toThrow();
      expect(() => shrinkageInvestigationInput.parse({ classification: "PILFERAGE", explanation: "Detailed investigation notes are present here.", evidenceReviewConfirmed: true })).toThrow();
    });

    it("accepts Verified Pilferage only with backend-enforced safeguards", () => {
      expect(shrinkageInvestigationInput.parse({
        classification: "PILFERAGE",
        explanation: "The Manager reviewed count records and supporting evidence.",
        evidenceReviewConfirmed: true,
        evidenceBasis: ["PHYSICAL_COUNT", "WRITTEN_INVESTIGATION"],
      }).classification).toBe("PILFERAGE");
    });
  });

  describe("inventoryMovementInput", () => {
    it("validates receipt movements and approved adjustments", () => {
      const receipt = {
        inventoryItemId: sampleUuid1,
        movementType: "RECEIPT",
        quantity: 50,
        referenceNo: "PO-2026-0089",
      };
      const adjustment = {
        inventoryItemId: sampleUuid2,
        movementType: "APPROVED_ADJUSTMENT",
        quantity: 3,
        notes: "Approved after count reconciliation",
      };
      const increase = {
        inventoryItemId: sampleUuid1,
        movementType: "APPROVED_ADJUSTMENT_INCREASE",
        quantity: 5,
        notes: "Stock found during audit",
      };
      const decrease = {
        inventoryItemId: sampleUuid2,
        movementType: "APPROVED_ADJUSTMENT_DECREASE",
        quantity: 2,
        notes: "Expired items written off",
      };

      expect(inventoryMovementInput.parse(receipt).movementType).toBe("RECEIPT");
      expect(inventoryMovementInput.parse(adjustment).movementType).toBe("APPROVED_ADJUSTMENT");
      expect(inventoryMovementInput.parse(increase).movementType).toBe("APPROVED_ADJUSTMENT_INCREASE");
      expect(inventoryMovementInput.parse(decrease).movementType).toBe("APPROVED_ADJUSTMENT_DECREASE");
    });
  });
});
