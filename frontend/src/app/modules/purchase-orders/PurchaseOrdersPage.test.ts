import { describe, expect, it, vi } from "vitest";
import type { PurchaseOrder } from "../../types/operations";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canAuthorizePurchaseOrderTest, canDeletePurchaseOrderTest, isCompletePurchaseOrderItem, isPhysicalCountRequiredError, PhysicalCountRequiredNotice, purchaseOrderFormValidationError, receiptDateError } from "./PurchaseOrdersPage";

const order=(patch:Partial<PurchaseOrder>={}):PurchaseOrder=>({
  id:"po-1",poNo:"PO-TEST",branchId:"branch-1",branchName:"Gulod",createdByUserId:"manager-1",createdByName:"Manager",
  supplierName:"Test Supplier",orderDate:"2026-09-28",expectedDeliveryDate:"2026-09-29",receivedDate:null,status:"ORDERED",notes:null,
  isTestData:false,testAuthorizedAt:null,createdAt:"2026-09-28T00:00:00Z",updatedAt:"2026-09-28T00:00:00Z",itemCount:1,totalAmount:100,
  items:[{id:"poi-1",inventoryItemId:"item-1",sku:"RM-001",name:"Beans",unit:"g",quantityOrdered:10,quantityReceived:0,unitCost:10,purchaseUom:"g",conversionFactor:1,latestPhysicalCountDate:null}],
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

describe("purchase-order receipt date validation",()=>{
  const countedOrder=(latestPhysicalCountDate:string|null)=>order({items:[{...order().items[0]!,latestPhysicalCountDate}]});

  it("accepts a receipt after the latest physical count",()=>{
    expect(receiptDateError(countedOrder("2026-10-01"),"2026-10-02")).toBeNull();
  });

  it.each(["2026-10-01","2026-09-30"])("rejects %s when the latest count is 2026-10-01",(date)=>{
    expect(receiptDateError(countedOrder("2026-10-01"),date)).toContain("after the latest physical count date (2026-10-01)");
  });

  it("preserves the order-date rule and accepts when no count exists",()=>{
    expect(receiptDateError(order(),"2026-09-27")).toBe("Received date cannot be before the order date.");
    expect(receiptDateError(order(),"2026-10-01")).toBeNull();
  });
});

describe("purchase-order creation validation",()=>{
  const valid = { supplierName:"Supplier", orderDate:"2026-10-03", expectedDeliveryDate:"2026-10-04", rowCount:1, validRowCount:1 };
  const validItem = { inventoryItemId:"item-1", quantityOrdered:"10", unitCost:"2.50", purchaseUom:"kg", conversionFactor:"1000" };

  it("shows the specific missing-count business rule and action",()=>{
    const onGoToInventoryCount = vi.fn();
    expect(isPhysicalCountRequiredError({ response: { data: { error: { code: "PHYSICAL_COUNT_REQUIRED" } } } })).toBe(true);
    const markup = renderToStaticMarkup(React.createElement(PhysicalCountRequiredNotice,{orderDate:"2026-10-03",onGoToInventoryCount}));
    expect(markup).toContain("Physical Inventory Count Required");
    expect(markup).toContain("October 3, 2026");
    expect(markup).toContain("Go to Inventory Count");
    const notice = PhysicalCountRequiredNotice({orderDate:"2026-10-03",onGoToInventoryCount}) as React.ReactElement<{children:React.ReactNode}>;
    const actionContainer = React.Children.toArray(notice.props.children).at(-1) as React.ReactElement<{children:React.ReactElement<{onClick:()=>void}>}>;
    actionContainer.props.children.props.onClick();
    expect(onGoToInventoryCount).toHaveBeenCalledOnce();
  });

  it("uses the generic fallback when nothing is filled",()=>{
    expect(purchaseOrderFormValidationError({supplierName:"",orderDate:"",expectedDeliveryDate:"",rowCount:1,validRowCount:0})).toBe("Complete the supplier, dates, and all item details.");
  });

  it("reports only the supplier when every other field is complete",()=>{
    expect(purchaseOrderFormValidationError({...valid,supplierName:""})).toBe("Select a supplier.");
  });

  it("combines supplier and item requirements when dates are complete",()=>{
    expect(purchaseOrderFormValidationError({...valid,supplierName:"",validRowCount:0})).toBe("Select a supplier and complete all item details.");
  });

  it("reports the order date with incomplete item details",()=>{
    expect(purchaseOrderFormValidationError({...valid,orderDate:"",expectedDeliveryDate:"",validRowCount:0})).toBe("Select order date and fill all item details.");
  });

  it("reports both missing dates when item details are already complete",()=>{
    expect(purchaseOrderFormValidationError({...valid,orderDate:"",expectedDeliveryDate:""})).toBe("Select order date and expected delivery date.");
  });

  it("reports only expected delivery when it is the sole missing field",()=>{
    expect(purchaseOrderFormValidationError({...valid,expectedDeliveryDate:""})).toBe("Select expected delivery date.");
  });

  it("reports only item details when supplier and dates are complete",()=>{
    expect(purchaseOrderFormValidationError({...valid,validRowCount:0})).toBe("Complete all item details.");
  });

  it("allows the existing creation request when form fields are valid",()=>{
    expect(purchaseOrderFormValidationError(valid)).toBeNull();
    expect(isPhysicalCountRequiredError(new Error("Another backend error"))).toBe(false);
  });

  it("rejects an invalid unit or conversion as incomplete item details",()=>{
    expect(isCompletePurchaseOrderItem({...validItem,purchaseUom:"box",conversionFactor:""})).toBe(false);
    expect(purchaseOrderFormValidationError({...valid,validRowCount:0})).toBe("Complete all item details.");
  });

  it("rejects missing, zero, or invalid quantity",()=>{
    expect(isCompletePurchaseOrderItem({...validItem,quantityOrdered:""})).toBe(false);
    expect(isCompletePurchaseOrderItem({...validItem,quantityOrdered:"0"})).toBe(false);
    expect(isCompletePurchaseOrderItem({...validItem,quantityOrdered:"not-a-number"})).toBe(false);
  });

  it("accepts a complete item row",()=>{
    expect(isCompletePurchaseOrderItem(validItem)).toBe(true);
  });
});
