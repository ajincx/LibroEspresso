import { describe,expect,it } from "vitest";
import { normalizeMenuProduct } from "./masterData.service";
import type { MenuProduct } from "../types/masterData";

describe("menu product response compatibility",()=>{
  const base={id:"product-id",name:"Americano",sellingPrice:120,status:"ACTIVE",recipeId:null,recipeCost:0,marginAmount:120,marginRate:100,createdAt:"",updatedAt:""} as MenuProduct;
  it("uses the persisted variant list when available",()=>{
    const variants=[{id:"variant-id",name:"Small",sellingPrice:149,status:"ACTIVE",createdAt:"",updatedAt:""}] as const;
    expect(normalizeMenuProduct({...base,variants:[...variants]}).variants[0]?.name).toBe("Small");
  });
  it("keeps an older API response renderable while showing missing recipe metrics as unavailable",()=>{
    const result=normalizeMenuProduct({...base,variants:undefined} as unknown as MenuProduct);
    expect(result.variants).toMatchObject([{name:"Standard",sellingPrice:120}]);
    expect(result.recipeCost).toBeNull();
    expect(result.marginRate).toBeNull();
  });
  it("preserves independent variant recipe costs and unavailable sibling margins",()=>{
    const product=normalizeMenuProduct({...base,variants:[
      {id:"small",name:"Small",sellingPrice:119,status:"ACTIVE",createdAt:"",updatedAt:"",recipeId:"recipe-small",recipeCost:18,marginAmount:101,marginRate:101/119*100},
      {id:"large",name:"Large",sellingPrice:139,status:"ACTIVE",createdAt:"",updatedAt:"",recipeId:null,recipeCost:null,marginAmount:null,marginRate:null},
    ]});
    expect(product.recipeCost).toBeNull();
    expect(product.variants[0]).toMatchObject({recipeCost:18,marginAmount:101});
    expect(product.variants[1]).toMatchObject({recipeCost:null,marginAmount:null,marginRate:null});
  });
});
