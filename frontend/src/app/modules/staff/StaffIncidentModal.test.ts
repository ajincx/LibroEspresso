import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { filterSelectOptions, moveSelectActiveIndex, selectFilteredOption } from "../../components/ModuleUi";
import { affectedItemsPayload, incidentProductOptionLabel, incidentProductsForIngredient, incidentProductsForIngredients, nextIncidentProductSelection, nextOtherIncidentType, OtherIncidentTypeField, StaffIncidentModal, validAffectedItems, validateOtherIncidentType } from "./StaffIncidentModal";

describe("Staff incident Other specification", () => {
  it("requires a non-whitespace specification only for OTHER", () => {
    expect(validateOtherIncidentType("OTHER", "")).toBe("Please specify the incident type.");
    expect(validateOtherIncidentType("OTHER", "   ")).toBe("Please specify the incident type.");
    expect(validateOtherIncidentType("OTHER", "Packaging issue")).toBe("");
    expect(validateOtherIncidentType("SPOILAGE", "")).toBe("");
  });

  it("clears a stale specification when a standard category is selected", () => {
    expect(nextOtherIncidentType("WASTAGE", "Packaging issue")).toBe("");
    expect(nextOtherIncidentType("OTHER", "Packaging issue")).toBe("Packaging issue");
  });

  it("shows the specification field only when OTHER is selected", () => {
    const hidden = renderToStaticMarkup(React.createElement(OtherIncidentTypeField,{type:"WASTAGE",value:"",error:"",onChange:()=>undefined}));
    const visible = renderToStaticMarkup(React.createElement(OtherIncidentTypeField,{type:"OTHER",value:"Packaging issue",error:"",onChange:()=>undefined}));
    expect(hidden).toBe("");
    expect(visible).toContain("Specify incident type");
    expect(visible).toContain("Packaging issue");
    expect(visible).toContain('maxLength="120"');
  });
});

describe("Staff incident ingredient/product filtering",()=>{
  const products=[
    {productId:"salted-caramel",variantId:"salted-small",variantName:"Small",code:"P-1",name:"Salted Caramel Latte",ingredientIds:["coffee","caramel"]},
    {productId:"salted-caramel",variantId:"salted-large",variantName:"Large",code:"P-1",name:"Salted Caramel Latte",ingredientIds:["coffee","caramel"]},
    {productId:"croffle",variantId:"croffle-standard",variantName:"Standard",code:"P-2",name:"Butter Croffle",ingredientIds:["butter","flour"]},
    {productId:"plain-coffee",variantId:"coffee-standard",variantName:"Standard",code:"P-3",name:"Plain Coffee",ingredientIds:["coffee"]},
  ];
  it("shows only active recipe products containing Caramel Syrup",()=>{
    expect(incidentProductsForIngredient(products,"caramel").map((item)=>item.variantId)).toEqual(["salted-small","salted-large"]);
  });
  it("shows only active recipe products containing Butter",()=>{
    expect(incidentProductsForIngredient(products,"butter").map((item)=>item.productId)).toEqual(["croffle"]);
  });
  it("does not show products before an ingredient is selected",()=>expect(incidentProductsForIngredient(products,"")).toEqual([]));
  it("displays product and variant names, keeping Small and Large separate",()=>{
    expect(incidentProductsForIngredient(products,"caramel").map(incidentProductOptionLabel)).toEqual([
      "Salted Caramel Latte — Small","Salted Caramel Latte — Large",
    ]);
  });
  it("preserves a compatible variant and clears it when the ingredient changes",()=>{
    expect(nextIncidentProductSelection(products,"caramel","salted-small")).toBe("salted-small");
    expect(nextIncidentProductSelection(products,"butter","salted-small")).toBe("");
  });
  it("searches ingredient and product options without creating typed values",()=>{
    const ingredients=[{value:"coffee",label:"Espresso Blend Beans (RM-002)"},{value:"caramel",label:"Caramel Syrup (ING-10)"}];
    const productOptions=products.map((product)=>({value:product.variantId,label:incidentProductOptionLabel(product)}));
    expect(filterSelectOptions(ingredients,"espresso").map((option)=>option.value)).toEqual(["coffee"]);
    expect(filterSelectOptions(productOptions,"Large").map((option)=>option.value)).toEqual(["salted-large"]);
    expect(filterSelectOptions(productOptions,"missing")).toEqual([]);
    expect(selectFilteredOption(productOptions,"Small",0)).toBe("salted-small");
    expect(selectFilteredOption(productOptions,"invented product",0)).toBeUndefined();
    expect(moveSelectActiveIndex(-1,productOptions.length,1)).toBe(0);
  });
  it("supports a unique multi-item payload and filters products by every ingredient",()=>{
    const drafts=[{inventoryItemId:"coffee",quantity:"18"},{inventoryItemId:"caramel",quantity:"15"}];
    expect(validAffectedItems(drafts)).toBe(true);
    expect(affectedItemsPayload(drafts)).toEqual([{inventoryItemId:"coffee",quantity:18},{inventoryItemId:"caramel",quantity:15}]);
    expect(incidentProductsForIngredients(products,["coffee","caramel"]).map((item)=>item.variantId)).toEqual(["salted-small","salted-large"]);
    expect(validAffectedItems([...drafts,{inventoryItemId:"coffee",quantity:"1"}])).toBe(false);
    expect(validAffectedItems([{inventoryItemId:"coffee",quantity:"0"}])).toBe(false);
  });
  it("renders one required affected-item row with add/remove controls",()=>{
    const markup=renderToStaticMarkup(React.createElement(StaffIncidentModal,{options:[{inventoryItemId:"coffee",sku:"RM-002",name:"Coffee",unit:"g"}],products,onClose:()=>undefined,onSaved:()=>undefined}));
    expect(markup).toContain("Affected Items");
    expect(markup).toContain("Add affected item");
    expect(markup).toContain("Remove affected item 1");
    expect(markup.indexOf("Affected Product Variant")).toBeLessThan(markup.indexOf("Affected Items"));
    expect(markup.indexOf("Affected Items")).toBeLessThan(markup.indexOf("Date and Time"));
    expect(markup).toContain("overflow-x-hidden");
    expect(markup).toContain("shrink-0 items-center justify-end");
    expect(markup).toContain("lg:max-w-4xl");
    expect(markup).toContain("lg:grid-cols-[minmax(20rem,1fr)_minmax(8rem,10rem)_6rem_2.75rem]");
    expect(markup).toContain("grid-cols-[minmax(0,1fr)_5rem_2.75rem]");
    expect(markup).toContain("mt-5 flex w-full min-w-0 flex-col gap-5");
    expect(markup).toContain("max-w-full cursor-pointer");
  });
});
