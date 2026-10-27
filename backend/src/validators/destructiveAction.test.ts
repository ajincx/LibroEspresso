import { describe, expect, it } from "vitest";
import { purchaseOrderLifecycleInput } from "./destructiveAction.js";

describe("purchase order lifecycle validation",()=>{
  const verification={reason:"Preserve this purchase order as historical evidence",verificationPin:"12345"};
  it("requires PIN verification for cancellation",()=>{
    expect(purchaseOrderLifecycleInput.parse({...verification,action:"CANCEL"}).action).toBe("CANCEL");
    expect(()=>purchaseOrderLifecycleInput.parse({reason:verification.reason,action:"CANCEL"})).toThrow();
  });
  it("accepts a received-order correction with a reason only",()=>{
    const parsed=purchaseOrderLifecycleInput.parse({reason:"Incorrect received quantities",action:"REVERSE"});
    expect(parsed).toEqual({reason:"Incorrect received quantities",action:"REVERSE"});
    expect(()=>purchaseOrderLifecycleInput.parse({reason:"   ",action:"REVERSE"})).toThrow();
  });
  it("prohibits physical deletion through the normal business lifecycle",()=>{
    expect(()=>purchaseOrderLifecycleInput.parse({...verification,action:"DELETE"})).toThrow();
  });
});
