import { describe,expect,it } from "vitest";
import { recipeInput,userCreate } from "./masterData.js";
const id="11111111-1111-4111-8111-111111111111";
describe("master data validation",()=>{
  it("requires a branch assignment for Branch Managers",()=>{expect(()=>userCreate.parse({firstName:"Maria",lastName:"Santos",email:"m@libro.local",username:"maria",password:"very-secure-password",role:"BRANCH_MANAGER",branchId:null,status:"ACTIVE"})).toThrow();});
  it("rejects duplicate ingredients in a recipe",()=>{expect(()=>recipeInput.parse({menuItemId:id,name:"Latte",yieldQuantity:1,status:"ACTIVE",items:[{inventoryItemId:id,quantity:1,unit:"g"},{inventoryItemId:id,quantity:2,unit:"g"}]})).toThrow();});
});
