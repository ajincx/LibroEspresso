import { describe, expect, it } from "vitest";
import { classifyUnmatchedPosIdentity } from "../services/posCsvImport.service.js";
import { FINAL_POS_MAPPING_TARGETS } from "./completePosMappingValidation.js";

describe("final capstone POS mapping validation batch", () => {
  it("keeps the sellable mapping identities unique and separate from operational exclusions", () => {
    const names = FINAL_POS_MAPPING_TARGETS.map((mapping) => mapping.posName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining([
      "B1T1 SL ML",
      "B1T1 ML",
      "NEW CRISPY BITES",
      "SOLO WEDGES",
      "FP C16 SPNLT",
    ]));
    expect(names.every((name) => classifyUnmatchedPosIdentity(name) === "UNKNOWN_REVIEW")).toBe(true);
  });

  it.each([
    "12OZ PAPER CUP-FRAPPE",
    "12OZ PAPER CUP",
    "16OZ PAPER CUP",
    "16OZ PAPER CUP-FRAPPE",
    "ESPRESSO CALIBRATION",
    "12OZ PAPER CUP-HOT",
    "MILK",
  ])("keeps %s excluded as an operational item", (name) => {
    expect(classifyUnmatchedPosIdentity(name)).toBe("OPERATIONAL_ITEM");
  });
});
