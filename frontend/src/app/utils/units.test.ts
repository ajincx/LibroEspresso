import { describe,expect,it } from "vitest";
import { compatibleUnits,normalizeUnit } from "./units";

describe("recipe unit choices",()=>{
  it("normalizes count aliases",()=>expect(normalizeUnit("pcs")).toBe("pc"));
  it("offers only compatible mass units",()=>expect(compatibleUnits("g")).toEqual(["g","kg"]));
  it("offers only compatible volume units",()=>expect(compatibleUnits("L")).toEqual(["ml","L"]));
  it("does not offer mass units for counts",()=>expect(compatibleUnits("pc")).toEqual(["pc"]));
});
