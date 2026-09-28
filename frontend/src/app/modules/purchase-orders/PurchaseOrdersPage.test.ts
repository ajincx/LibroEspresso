import { describe, expect, it } from "vitest";
import type { PurchaseOrder } from "../../types/operations";
import { canAuthorizePurchaseOrderTest, canDeletePurchaseOrderTest } from "./PurchaseOrdersPage";

const order=(patch:Partial<PurchaseOrder>={}):PurchaseOrder=>({
  id:"po-1",poNo:"PO-TEST",branchId:"branch-1",branchName:"Gulod",createdByUserId:"manager-1",createdByName:"Manager",
  supplierName:"Test Supplier",orderDate:"2026-09-28",expectedDeliveryDate:"2026-09-29",receivedDate:null,status:"ORDERED",notes:null,
  isTestData:false,testAuthorizedAt:null,createdAt:"2026-09-28T00:00:00Z",updatedAt:"2026-09-28T00:00:00Z",itemCount:1,totalAmount:100,
  items:[{id:"poi-1",inventoryItemId:"item-1",sku:"RM-001",name:"Beans",unit:"g",quantityOrdered:10,quantityReceived:0,unitCost:10,purchaseUom:"g",conversionFactor:1}],
  ...patch,
});

describe("purchase-order test controls",()=>{
  it("offers per-record authorization only to the Owner before receiving",()=>{
    expect(canAuthorizePurchaseOrderTest("owner",order(),true)).toBe(true);
    expect(canAuthorizePurchaseOrderTest("manager",order(),true)).toBe(false);
    expect(canAuthorizePurchaseOrderTest("owner",order({items:[{...order().items[0]!,quantityReceived:1}]}),true)).toBe(false);
    expect(canAuthorizePurchaseOrderTest("owner",order(),false)).toBe(false);
  });

  it("offers cleanup only for an explicitly authorized test PO",()=>{
    expect(canDeletePurchaseOrderTest("owner",order({isTestData:true,testAuthorizedAt:"2026-09-28T00:00:00Z"}),true)).toBe(true);
    expect(canDeletePurchaseOrderTest("owner",order({isTestData:true,testAuthorizedAt:null}),true)).toBe(false);
    expect(canDeletePurchaseOrderTest("owner",order(),true)).toBe(false);
    expect(canDeletePurchaseOrderTest("manager",order({isTestData:true,testAuthorizedAt:"2026-09-28T00:00:00Z"}),true)).toBe(false);
  });
});
