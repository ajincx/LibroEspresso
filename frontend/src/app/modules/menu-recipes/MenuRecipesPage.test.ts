import { describe, expect, it } from "vitest";
import { marginTextClass } from "./MenuRecipesPage";

describe("Menu Products & Recipes margin presentation",()=>{
  it("styles positive, negative, and zero margins with truthful semantic colors",()=>{
    expect(marginTextClass(35.2)).toContain("success");
    expect(marginTextClass(-3)).toContain("danger");
    expect(marginTextClass(0)).toContain("text-muted");
  });
});
