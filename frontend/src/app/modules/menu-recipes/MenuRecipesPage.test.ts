import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { attachPendingRecipeDrafts,canDeleteMenuProduct,canManageMenuCategories,CategoryLabel,ingredientSetsMatch,initializePendingRecipeDrafts,isControlledTestProductRetirement,isValidRecipeQuantity,MAX_MENU_PRODUCT_PRICE_PHP,menuSellingPriceValidationError,marginTextClass,MENU_VARIANT_PRESETS,menuVariantNameForSelection,menuVariantSelection,MenuProductDeleteDialog,MenuProductsSkeleton,nextMenuVariantName,normalizeRecipeQuantityInput,productNameValidationError,recipeIngredientExists,removeRecipeIngredientRow,selectInitialZeroQuantity,updatePendingRecipeDraftRow,variantMarginRate,type RecipeDraft } from "./MenuRecipesPage";
import { menuRecipeTabs } from "./MenuRecipeManagementModule";
import type { MenuCategory, MenuProduct } from "../../types/masterData";

describe("Menu category guidance and permissions",()=>{
  it("uses the approved Ingredient Consumption title",()=>{
    expect(menuRecipeTabs.find(tab=>tab.id==="usage")?.label).toBe("Ingredient Consumption");
  });
  it("uses the shared table skeleton while menu products load",()=>{
    const markup=renderToStaticMarkup(createElement(MenuProductsSkeleton));
    expect(markup).toContain("data-menu-products-skeleton");
    expect(markup).toContain('aria-label="Loading menu products"');
    expect(markup).toContain("Product Code");
    expect(markup).toContain("Recipe Cost");
    expect(markup).toContain("motion-reduce:animate-none");
  });
  const categories=[{id:"cold-id",name:"Cold Classics",description:"Chilled and iced beverage products.",status:"ACTIVE",createdAt:"",updatedAt:""},{id:"food-id",name:"Food",description:"",status:"ACTIVE",createdAt:"",updatedAt:""}] satisfies MenuCategory[];
  it("shows the category name without the redundant information icon or tooltip",()=>{
    const markup=renderToStaticMarkup(createElement(CategoryLabel,{name:"Cold Classics"}));
    expect(markup).toContain("Cold Classics");
    expect(markup).not.toContain("About Cold Classics");
    expect(markup).not.toContain("Chilled and iced beverage products.");
  });
  it("exposes category management controls only to Owners",()=>{
    expect(canManageMenuCategories("OWNER")).toBe(true);
    expect(canManageMenuCategories("BRANCH_MANAGER")).toBe(false);
    expect(canManageMenuCategories("STAFF")).toBe(false);
  });
  it("routes only the approved test product and Owner through controlled retirement",()=>{
    expect(isControlledTestProductRetirement("OWNER",{code:"PRD-00073"} as MenuProduct)).toBe(true);
    expect(isControlledTestProductRetirement("BRANCH_MANAGER",{code:"PRD-00073"} as MenuProduct)).toBe(false);
    expect(isControlledTestProductRetirement("STAFF",{code:"PRD-00073"} as MenuProduct)).toBe(false);
    expect(isControlledTestProductRetirement("OWNER",{code:"PRD-00001"} as MenuProduct)).toBe(false);
  });
  it("allows only the Owner to request deletion of global products",()=>{
    expect(canDeleteMenuProduct("OWNER",{productScope:"GLOBAL"} as MenuProduct)).toBe(true);
    expect(canDeleteMenuProduct("OWNER",{productScope:"BRANCH"} as MenuProduct)).toBe(false);
    expect(canDeleteMenuProduct("BRANCH_MANAGER",{productScope:"GLOBAL"} as MenuProduct)).toBe(false);
  });

  it("uses a reason-only product deletion confirmation and rejects a blank reason",()=>{
    const blank=renderToStaticMarkup(createElement(MenuProductDeleteDialog,{product:{name:"Café Latte"},busy:false,value:{reason:"",verificationPin:""},onChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    const ready=renderToStaticMarkup(createElement(MenuProductDeleteDialog,{product:{name:"Café Latte"},busy:false,value:{reason:"Remove unused menu product",verificationPin:""},onChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    expect(blank).toContain("Delete Menu Product?");
    expect(blank).toContain("Item: Café Latte");
    expect(blank).not.toContain("Verification PIN");
    expect(blank).toMatch(/<button[^>]*disabled[^>]*>Confirm Delete<\/button>/);
    expect(ready).not.toMatch(/<button[^>]*disabled[^>]*>Confirm Delete<\/button>/);
  });
});

describe("Menu Products & Recipes margin presentation",()=>{
  it("styles positive, negative, and zero margins with truthful semantic colors",()=>{
    expect(marginTextClass(35.2)).toContain("success");
    expect(marginTextClass(-3)).toContain("danger");
    expect(marginTextClass(0)).toContain("text-muted");
  });
  it("shows unavailable margin without a recipe, not a zero-cost margin",()=>{expect(variantMarginRate(149,null)).toBeNull();expect(marginTextClass(null)).toContain("text-muted");});
  it("calculates each configured variant margin using its selling price",()=>{expect(variantMarginRate(149,16.96)).toBeCloseTo((149-16.96)/149*100);expect(variantMarginRate(189,16.96)).toBeCloseTo((189-16.96)/189*100);});
});

describe("Menu product input validation",()=>{
  it("defaults new products to Standard and supports preset and custom variants without changing stored names",()=>{
    expect(MENU_VARIANT_PRESETS).toEqual(["Standard","Small","Medium","Large"]);
    expect(menuVariantSelection("Standard")).toBe("Standard");
    expect(menuVariantNameForSelection("Standard","Small")).toBe("Small");
    expect(menuVariantNameForSelection("Small","Medium")).toBe("Medium");
    expect(menuVariantNameForSelection("Medium","Large")).toBe("Large");
    expect(menuVariantNameForSelection("Large","Custom")).toBe("");
    expect(menuVariantSelection("16 oz")).toBe("Custom");
    expect(menuVariantNameForSelection("16 oz","Custom")).toBe("16 oz");
    expect(nextMenuVariantName([{name:"Standard"},{name:"Small"}])).toBe("Medium");
  });
  it.each(["12345"," 987 ","Coffee\u0007Latte"])("rejects invalid product names: %j",(name)=>expect(productNameValidationError(name)).not.toBe(""));
  it.each(["Café Latte","Iced Coffee 16oz","2-in-1 Coffee","Cookies & Cream"])("accepts legitimate café product names: %s",(name)=>expect(productNameValidationError(name)).toBe(""));
  it.each(["",0,-1,Number.NaN,Number.POSITIVE_INFINITY,149.999,MAX_MENU_PRODUCT_PRICE_PHP+0.01] as const)("rejects invalid prices: %s",(price)=>expect(menuSellingPriceValidationError(price)).not.toBe(""));
  it.each([1,149,149.95,MAX_MENU_PRODUCT_PRICE_PHP])("accepts valid prices: %s",(price)=>expect(menuSellingPriceValidationError(price)).toBe(""));
});

describe("Menu Products & Recipes ingredient rows",()=>{
  const ingredient={id:"ingredient-1",name:"Coffee Beans",sku:"RM-001",category:"Raw Material",unit:"g",unitCost:1,reorderLevel:0,status:"ACTIVE",itemScope:"GLOBAL",originBranchId:null} as const;
  it("removes only the selected recipe row, including the final row",()=>{
    const rows=[{key:"row-1",inventoryItemId:ingredient.id,quantity:10,unit:"g"}];
    expect(removeRecipeIngredientRow(rows,"row-1")).toEqual([]);
    expect(ingredient).toMatchObject({id:"ingredient-1",name:"Coffee Beans"});
  });
  it("accepts only an existing active inventory ingredient",()=>{
    expect(recipeIngredientExists(ingredient.id,[ingredient])).toBe(true);
    expect(recipeIngredientExists("missing",[ingredient])).toBe(false);
    expect(recipeIngredientExists(ingredient.id,[{...ingredient,status:"INACTIVE"}])).toBe(false);
  });
  it("replaces an initial zero when entering 40 and preserves decimal quantities",()=>{
    const select=vi.fn();
    selectInitialZeroQuantity({value:"0",select});
    expect(select).toHaveBeenCalledOnce();
    expect(normalizeRecipeQuantityInput("40")).toBe(40);
    expect(normalizeRecipeQuantityInput("0")).toBe(0);
    expect(["0.5","1.25","18.5"].map(normalizeRecipeQuantityInput)).toEqual([0.5,1.25,18.5]);
  });
  it("keeps a cleared quantity empty so positive-quantity validation can reject it",()=>{
    expect(normalizeRecipeQuantityInput("")).toBe("");
    expect(isValidRecipeQuantity(normalizeRecipeQuantityInput(""))).toBe(false);
    expect(isValidRecipeQuantity(0)).toBe(false);
    expect(isValidRecipeQuantity(0.5)).toBe(true);
  });
  it("adds TEST_Oat Milk to existing Small and Large drafts and submits both together",()=>{
    const variants=[
      {key:"small",id:"small-id",name:"Small",sellingPrice:149,status:"ACTIVE" as const},
      {key:"large",id:"large-id",name:"Large",sellingPrice:189,status:"ACTIVE" as const},
    ];
    const saved=[
      {id:"small-id",yieldQuantity:1,recipeHasHistoricalSales:true,ingredients:[{id:"s1",inventoryItemId:"beans",quantity:18,unit:"g"}]},
      {id:"large-id",yieldQuantity:1,recipeHasHistoricalSales:true,ingredients:[{id:"l1",inventoryItemId:"beans",quantity:22,unit:"g"}]},
    ] as never;
    const initialized=initializePendingRecipeDrafts(variants[0],variants,{},saved,"2026-10-03");
    let drafts:Record<string,RecipeDraft>={
      ...initialized,
      small:{...initialized.small!,items:[...initialized.small!.items,{key:"s-oat",inventoryItemId:"",quantity:1,unit:""}]},
      large:{...initialized.large!,items:[...initialized.large!.items,{key:"l-oat",inventoryItemId:"",quantity:1,unit:""}]},
    };
    drafts=updatePendingRecipeDraftRow(drafts,"small","s-oat",{inventoryItemId:"oat-milk-id",unit:"ml"});
    drafts=updatePendingRecipeDraftRow(drafts,"large","l-oat",{inventoryItemId:"oat-milk-id",unit:"ml"});
    expect(ingredientSetsMatch(drafts.small!,drafts.large!)).toBe(true);
    const payload=attachPendingRecipeDrafts(variants,drafts);
    expect(payload.map((variant)=>variant.recipe?.items.map((item)=>item.inventoryItemId))).toEqual([
      ["beans","oat-milk-id"],["beans","oat-milk-id"],
    ]);
    expect(payload.map((variant)=>variant.recipe?.items[1]?.quantity)).toEqual([1,1]);
  });
  it("rejects a Small/Large draft ingredient-set mismatch",()=>{
    const small={yieldQuantity:1,effectiveFrom:"",changeReason:"",items:[{key:"s",inventoryItemId:"beans",quantity:18,unit:"g"}]};
    const large={yieldQuantity:1,effectiveFrom:"",changeReason:"",items:[{key:"l",inventoryItemId:"beans",quantity:22,unit:"g"},{key:"x",inventoryItemId:"syrup",quantity:20,unit:"ml"}]};
    expect(ingredientSetsMatch(small,large)).toBe(false);
  });
});
