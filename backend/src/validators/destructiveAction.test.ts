import { describe, expect, it } from "vitest";
import { purchaseOrderLifecycleInput } from "./destructiveAction.js";

describe("purchase order lifecycle validation",()=>{
  const verification={reason:"Preserve this purchase order as historical evidence",verificationPin:"12345"};
  it.each(["CANCEL","REVERSE"] as const)("allows %s",(action)=>{
    expect(purchaseOrderLifecycleInput.parse({...verification,action}).action).toBe(action);
  });
  it("prohibits physical deletion through the normal business lifecycle",()=>{
    expect(()=>purchaseOrderLifecycleInput.parse({...verification,action:"DELETE"})).toThrow();
  });
});
