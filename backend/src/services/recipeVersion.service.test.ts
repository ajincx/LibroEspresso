import { describe, expect, it, vi } from "vitest";
import { createIngredientUsageSnapshots, isEffectiveOn, periodsOverlap, resolveEffectiveRecipe, saveRecipeDefinition, shouldCreateNewRecipeVersion } from "./recipeVersion.service.js";

const version = (id: string, number: number, from: string, to: string | null) => ({ id, version: number, effectiveFrom: from, effectiveTo: to });

describe("recipe effective periods", () => {
  const v1 = version("v1", 1, "2026-01-01", "2026-09-01");
  const v2 = version("v2", 2, "2026-09-01", null);

  it("selects the old version for an old business date", () => expect(resolveEffectiveRecipe([v1, v2], "2026-08-20")?.id).toBe("v1"));
  it("selects the current version for a new business date", () => expect(resolveEffectiveRecipe([v1, v2], "2026-09-05")?.id).toBe("v2"));
  it("does not select a future recipe early", () => expect(isEffectiveOn(v2, "2026-08-31")).toBe(false));
  it("uses an exclusive effective-to boundary", () => expect(isEffectiveOn(v1, "2026-09-01")).toBe(false));
  it("supports the unknown legacy start marker", () => expect(isEffectiveOn(version("legacy", 1, "-infinity", "2026-09-01"), "1990-01-01")).toBe(true));
  it("detects overlapping recipe periods", () => expect(periodsOverlap(v1, version("bad", 3, "2026-08-01", null))).toBe(true));
  it("accepts adjacent non-overlapping periods", () => expect(periodsOverlap(v1, v2)).toBe(false));
  it("rejects ambiguous effective selection", () => expect(() => resolveEffectiveRecipe([v1, version("bad", 3, "2026-08-01", null)], "2026-08-20")).toThrow(/more than one/i));
});

describe("recipe edit rule", () => {
  it("allows an unused recipe to be edited in place", () => expect(shouldCreateNewRecipeVersion(false)).toBe(false));
  it("requires a new version after historical usage", () => expect(shouldCreateNewRecipeVersion(true)).toBe(true));
});

const recipeInput={recipeId:"v1",menuItemId:"menu-1",name:"Latte",yieldQuantity:10,status:"ACTIVE" as const,effectiveFrom:"2026-09-10",changeReason:"Portion update",createdBy:"manager-1",items:[{inventoryItemId:"beans",quantity:180,unit:"g"}]};

describe("recipe version persistence",()=>{
  it("edits an unused recipe in place",async()=>{
    const queries:{sql:string;values?:unknown[]}[]=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{const sql=String(statement);queries.push({sql,values});if(sql.includes('menu_item_id "menuItemId"'))return{rows:[{id:"v1",menuItemId:"menu-1",version:1,effectiveFrom:"2026-09-01",effectiveTo:null}]};if(sql.includes("pos_sale_ingredient_usage"))return{rows:[]};return{rows:[]};})};
    const result=await saveRecipeDefinition(client as never,recipeInput);
    expect(result).toEqual({recipeId:"v1",version:1,createdVersion:false});
    expect(queries.some(({sql})=>sql.startsWith("UPDATE recipes SET name="))).toBe(true);
    expect(queries.some(({sql})=>sql.includes("INSERT INTO recipes"))).toBe(false);
  });

  it("creates a dated version without changing old recipe items after historical use",async()=>{
    const queries:{sql:string;values?:unknown[]}[]=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{const sql=String(statement);queries.push({sql,values});if(sql.includes('menu_item_id "menuItemId"'))return{rows:[{id:"v1",menuItemId:"menu-1",version:1,effectiveFrom:"-infinity",effectiveTo:null}]};if(sql.includes("pos_sale_ingredient_usage"))return{rows:[{exists:1}]};if(sql.includes("id<>$2"))return{rows:[]};if(sql.includes("max(version)"))return{rows:[{version:2}]};if(sql.includes("INSERT INTO recipes"))return{rows:[{id:"v2"}]};return{rows:[]};})};
    const result=await saveRecipeDefinition(client as never,recipeInput);
    expect(result).toEqual({recipeId:"v2",version:2,createdVersion:true});
    expect(queries.find(({sql})=>sql.startsWith("UPDATE recipes SET effective_to"))?.values).toEqual(["v1","2026-09-10"]);
    expect(queries.some(({sql})=>sql.includes("DELETE FROM recipe_items"))).toBe(false);
    expect(queries.find(({sql})=>sql.includes("INSERT INTO recipes"))?.values).toContain(2);
  });

  it("rejects an overlapping effective version",async()=>{
    const client={query:vi.fn(async(statement:unknown)=>{const sql=String(statement);if(sql.includes('menu_item_id "menuItemId"'))return{rows:[{id:"v1",menuItemId:"menu-1",version:1,effectiveFrom:"-infinity",effectiveTo:null}]};if(sql.includes("pos_sale_ingredient_usage"))return{rows:[{exists:1}]};if(sql.includes("id<>$2"))return{rows:[{id:"future"}]};return{rows:[]};})};
    await expect(saveRecipeDefinition(client as never,recipeInput)).rejects.toMatchObject({code:"RECIPE_PERIOD_OVERLAP"});
  });
});

describe("sale-time recipe snapshots",()=>{
  it("converts recipe usage into the inventory unit and preserves the selected unit cost",async()=>{
    const queries:{sql:string;values?:unknown[]}[]=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{const sql=String(statement);queries.push({sql,values});if(sql.includes('psi.id "saleItemId"'))return{rows:[{saleItemId:"sale-1",quantitySold:2,recipeVersionId:"v1",yieldQuantity:1,inventoryItemId:"beans",recipeQuantity:18,recipeUnit:"g",inventoryUnit:"kg",unitCost:800}]};return{rows:[]};})};
    await createIngredientUsageSnapshots(client as never,"import-1");
    const insert=queries.find(({sql})=>sql.includes("INSERT INTO pos_sale_ingredient_usage"));
    expect(insert?.values).toEqual([["sale-1"],["beans"],[0.036],["kg"],[800],["v1"]]);
    expect(insert?.sql).toContain("recipe_version_id");
    expect(queries[0]?.sql).toContain("candidate.effective_from<=psi.business_date");
  });
});
