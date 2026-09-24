import { describe,expect,it } from "vitest";
import { inventoryItemInput,menuProductInput,recipeInput,userCreate } from "./masterData.js";
const id="11111111-1111-4111-8111-111111111111";
describe("master data validation",()=>{
  it("requires a branch assignment for Branch Managers",()=>{expect(()=>userCreate.parse({firstName:"Maria",lastName:"Santos",email:"m@libro.local",username:"maria",password:"very-secure-password",role:"BRANCH_MANAGER",branchId:null,status:"ACTIVE"})).toThrow();});
  it("requires a branch assignment for Staff",()=>{expect(()=>userCreate.parse({firstName:"Ana",lastName:"Reyes",email:"a@libro.local",username:"ana",password:"very-secure-password",role:"STAFF",branchId:null,status:"ACTIVE"})).toThrow();});
  it("rejects duplicate ingredients in a recipe",()=>{expect(()=>recipeInput.parse({menuItemId:id,name:"Latte",yieldQuantity:1,status:"ACTIVE",items:[{inventoryItemId:id,quantity:1,unit:"g"},{inventoryItemId:id,quantity:2,unit:"g"}]})).toThrow();});
  it("normalizes supported inventory-unit aliases",()=>{expect(inventoryItemInput.parse({name:"Cup",category:"Supplies",unit:"pcs",unitCost:5,reorderLevel:10,status:"ACTIVE"}).unit).toBe("pc");});
  it("rejects unsupported inventory units",()=>{expect(()=>inventoryItemInput.parse({name:"Cup",category:"Supplies",unit:"pack",unitCost:5,reorderLevel:10,status:"ACTIVE"})).toThrow();});
  const product = {name:"Spanish Latte",categoryId:id,description:"",status:"ACTIVE"};
  it("allows a product without a recipe and with one Standard variant",()=>{const result=menuProductInput.parse({...product,variants:[{name:"Standard",sellingPrice:149,status:"ACTIVE"}]});expect(result.recipe).toBeUndefined();expect(result.variants).toHaveLength(1);});
  it("allows Small and Large variants and edited prices",()=>{const result=menuProductInput.parse({...product,variants:[{name:"Small",sellingPrice:149,status:"ACTIVE"},{name:"Large",sellingPrice:189,status:"ACTIVE"}]});expect(result.variants?.map((variant)=>variant.sellingPrice)).toEqual([149,189]);});
  it("allows deactivation only when another variant remains active",()=>{expect(menuProductInput.parse({...product,variants:[{name:"Small",sellingPrice:149,status:"INACTIVE"},{name:"Large",sellingPrice:189,status:"ACTIVE"}]}).variants?.[0]?.status).toBe("INACTIVE");expect(()=>menuProductInput.parse({...product,variants:[{name:"Small",sellingPrice:149,status:"INACTIVE"}]})).toThrow();});
  it("rejects duplicate variant names regardless of case",()=>{expect(()=>menuProductInput.parse({...product,variants:[{name:"Small",sellingPrice:149},{name:"small",sellingPrice:189}]})).toThrow();});
  it("continues to accept a recipe and legacy single selling price",()=>{const result=menuProductInput.parse({...product,sellingPrice:120,recipe:{yieldQuantity:1,items:[{inventoryItemId:id,quantity:1,unit:"g"}]}});expect(result.recipe?.items).toHaveLength(1);});
});
