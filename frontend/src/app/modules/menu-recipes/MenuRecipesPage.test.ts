import { describe, expect, it } from "vitest";
import { marginTextClass,variantMarginRate } from "./MenuRecipesPage";

describe("Menu Products & Recipes margin presentation",()=>{
  it("styles positive, negative, and zero margins with truthful semantic colors",()=>{
    expect(marginTextClass(35.2)).toContain("success");
    expect(marginTextClass(-3)).toContain("danger");
    expect(marginTextClass(0)).toContain("text-muted");
  });
  it("shows unavailable margin without a recipe, not a zero-cost margin",()=>{expect(variantMarginRate(149,null)).toBeNull();expect(marginTextClass(null)).toContain("text-muted");});
  it("calculates each configured variant margin using its selling price",()=>{expect(variantMarginRate(149,16.96)).toBeCloseTo((149-16.96)/149*100);expect(variantMarginRate(189,16.96)).toBeCloseTo((189-16.96)/189*100);});
});
