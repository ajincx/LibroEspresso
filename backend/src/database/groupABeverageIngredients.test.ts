import { describe, expect, it } from "vitest";
import { normalizeUnit } from "../services/unitConversion.service.js";
import { GROUP_A_BEVERAGE_INGREDIENTS, GROUP_A_PROVENANCE } from "./groupABeverageIngredients.js";

const normalizedName = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");

describe("Group A beverage ingredient dataset", () => {
  it("contains exactly the thirteen approved identities without normalized duplicates", () => {
    expect(GROUP_A_BEVERAGE_INGREDIENTS).toHaveLength(13);
    const names = GROUP_A_BEVERAGE_INGREDIENTS.map((item) => normalizedName(item.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("icebyweight");
    expect(names).not.toContain("ice");
  });

  it("uses supported units and positive four-decimal sample costs", () => {
    for (const item of GROUP_A_BEVERAGE_INGREDIENTS) {
      expect(() => normalizeUnit(item.unit)).not.toThrow();
      expect(item.unitCost).toMatch(/^\d+\.\d{4}$/);
      expect(Number(item.unitCost)).toBeGreaterThan(0);
    }
    expect(GROUP_A_PROVENANCE).toBe("SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION");
  });
});
