import { describe, expect, it, vi } from "vitest";
import type { PurchaseOrder } from "../../types/operations";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canAuthorizePurchaseOrderTest, canDeletePurchaseOrderTest, convertedPurchaseQuantity, CreatePurchaseOrder, isCompletePurchaseOrderItem, isPhysicalCountRequiredError, OrderDetail, PhysicalCountRequiredNotice, PURCHASE_ORDER_STOCK_TIMING_GUIDANCE, PurchaseOrderCorrectionDialog, purchaseOrderCorrectionReady, PurchaseOrderManageButton, purchaseOrderDraftSummary, purchaseOrderFormValidationError, receiptDateError, standardPurchaseConversionFactor } from "./PurchaseOrdersPage";
import { purchaseOrderLifecyclePayload } from "../../services/controlledAction.service";

const order=(patch:Partial<PurchaseOrder>={}):PurchaseOrder=>({
  id:"po-1",poNo:"PO-TEST",branchId:"branch-1",branchName:"Gulod",createdByUserId:"manager-1",createdByName:"Manager",
  supplierName:"Test Supplier",orderDate:"2026-09-28",expectedDeliveryDate:"2026-09-29",receivedDate:null,status:"ORDERED",notes:null,
  isTestData:false,testAuthorizedAt:null,createdAt:"2026-09-28T00:00:00Z",updatedAt:"2026-09-28T00:00:00Z",itemCount:1,totalAmount:100,
  items:[{id:"poi-1",inventoryItemId:"item-1",sku:"RM-001",name:"Beans",unit:"g",quantityOrdered:10,quantityReceived:0,unitCost:10,purchaseUom:"g",conversionFactor:1,latestPhysicalCountDate:null}],
  ...patch,
});

const detailMarkup=(status:PurchaseOrder["status"],role:"owner"|"manager"="manager")=>renderToStaticMarkup(React.createElement(OrderDetail,{
  order:order({status}),role,onClose:vi.fn(),onOrder:vi.fn(),onCancel:vi.fn(),onCorrectReceipt:vi.fn(),onReceive:vi.fn(),
}));

describe("purchase-order Manage UI",()=>{
  it("uses one clearly labelled Manage action for the selected registry record",()=>{
    const onManage=vi.fn();
    const action=PurchaseOrderManageButton({order:order(),onManage}) as React.ReactElement<{onClick:()=>void}>;
    const markup=renderToStaticMarkup(action);
    expect(markup).toContain("Manage");
    expect(markup).toContain("Manage PO-TEST");
    expect(markup).not.toContain("View");
    action.props.onClick();
    expect(onManage).toHaveBeenCalledWith(expect.objectContaining({id:"po-1",poNo:"PO-TEST"}));
  });

  it("shows ordered actions and removes the redundant footer Close action",()=>{
    const markup=detailMarkup("ORDERED");
    expect(markup).toContain("Receive Items");
    expect(markup).toContain("Cancel Order");
    expect(markup).not.toContain(">Close</button>");
    expect(markup).not.toContain("Edit Received Order");
  });

  it("uses the audited receipt-correction action for received orders",()=>{
    const markup=detailMarkup("RECEIVED");
    expect(markup).toContain("Edit Received Order");
    expect(markup).toContain("compensating stock movements");
    expect(markup).not.toContain("Receive Items");
    expect(markup).not.toContain("Cancel Order");
  });

  it("preserves remaining receipt and correction actions for partial orders",()=>{
    const markup=detailMarkup("PARTIALLY_RECEIVED");
    expect(markup).toContain("Receive Items");
    expect(markup).toContain("Edit Received Order");
    expect(markup).not.toContain("Cancel Order");
  });

  it("keeps cancelled orders and Owner views read-only",()=>{
    const cancelled=detailMarkup("CANCELLED");
    const ownerReceived=detailMarkup("RECEIVED","owner");
    for(const markup of [cancelled,ownerReceived]){
      expect(markup).not.toContain("Receive Items");
      expect(markup).not.toContain("Cancel Order");
      expect(markup).not.toContain("Edit Received Order");
    }
  });

  it("shows the requested PO metadata, item columns, and total",()=>{
    const markup=detailMarkup("ORDERED");
    for(const value of ["PO-TEST","Branch","Gulod","Supplier","Test Supplier","Created By","Manager","SKU","Ingredient","Ordered","Received","Unit Cost","Total","Total Amount","RM-001","Beans"]){
      expect(markup).toContain(value);
    }
  });
});

describe("received-order correction dialog",()=>{
  it("renders the focused audited-correction layout without a PIN field",()=>{
    const markup=renderToStaticMarkup(React.createElement(PurchaseOrderCorrectionDialog,{order:order({status:"RECEIVED"}),reason:"Incorrect received quantity",busy:false,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    expect(markup).toContain("Correct received order PO-TEST?");
    expect(markup).toContain("Audited correction");
    expect(markup).toContain("Correction reason");
    expect(markup).toContain("Confirm Correction");
    expect(markup).toContain("Close correction dialog");
    expect(markup).not.toContain("Verification PIN");
    expect(markup).not.toContain('type="password"');
  });

  it("requires a non-whitespace reason and submits no PIN for correction",()=>{
    expect(purchaseOrderCorrectionReady("")).toBe(false);
    expect(purchaseOrderCorrectionReady("   ")).toBe(false);
    expect(purchaseOrderCorrectionReady("Wrong received amount")).toBe(true);
    expect(purchaseOrderLifecyclePayload("REVERSE",{reason:"Wrong received amount",verificationPin:"should-not-be-sent"})).toEqual({action:"REVERSE",reason:"Wrong received amount"});
    expect(purchaseOrderLifecyclePayload("CANCEL",{reason:"Cancel duplicate order",verificationPin:"12345"})).toEqual({action:"CANCEL",reason:"Cancel duplicate order",verificationPin:"12345"});
  });

  it("disables confirmation for whitespace-only reasons",()=>{
    const markup=renderToStaticMarkup(React.createElement(PurchaseOrderCorrectionDialog,{order:order({status:"RECEIVED"}),reason:"   ",busy:false,onReasonChange:vi.fn(),onCancel:vi.fn(),onConfirm:vi.fn()}));
    expect(markup).toContain('disabled=""');
    expect(markup).toContain(">Confirm Correction</button>");
  });
});

describe("new purchase-order item layout",()=>{
  it("keeps every item control in a dedicated responsive grid area",()=>{
    const markup=renderToStaticMarkup(React.createElement(CreatePurchaseOrder,{
      inventory:[{id:"item-1",sku:"RM-001",name:"Extra Long Espresso Blend Ingredient Name",category:"Coffee",unit:"g",unitCost:2,reorderLevel:10,status:"ACTIVE",itemScope:"GLOBAL",originBranchId:null}],
      suppliers:["Supplier"],initialItem:{ingredientId:"item-1",quantity:"2"},onInventoryCreated:vi.fn(),onClose:vi.fn(),onGoToInventoryCount:vi.fn(),onCreated:vi.fn(),
    }));
    for(const label of ["Ingredient","Purchase Quantity","Purchase Unit","Inventory Conversion","Cost per Purchase Unit","Remove item"]){
      expect(markup).toContain(label);
    }
    expect(markup).toContain("grid-cols-1");
    expect(markup).toContain("xl:grid-cols-[minmax(220px,1fr)_110px_100px_130px_170px_44px]");
    expect(markup).toContain("min-w-0");
    expect(markup).not.toContain("position:absolute");
    expect(markup).toContain("Notes <span");
    expect(markup).toContain("(Optional)");
    expect(markup).toContain("View Drafts (0)");
    expect(markup).toContain("Save Temporary Draft");
    expect(markup).toContain("Create Official PO Draft");
  });

  it("allows an incomplete browser-only draft summary without weakening official validation",()=>{
    const draft={supplierChoice:"",otherSupplier:"",orderDate:"2026-10-27",expectedDeliveryDate:"",notes:"",rows:[{inventoryItemId:"",quantityOrdered:"",unitCost:"",purchaseUom:"g",conversionFactor:"1"}]};
    expect(purchaseOrderDraftSummary(draft)).toBe("Supplier not selected · 0 items");
    expect(purchaseOrderFormValidationError({supplierName:"",orderDate:"2026-10-27",expectedDeliveryDate:"",rowCount:1,validRowCount:0})).not.toBeNull();
  });
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
    expect(receiptDateError(order(),"2026-09-27",undefined,"2026-10-03")).toBe("Received date cannot be before the order date.");
    expect(receiptDateError(order(),"2026-10-01",undefined,"2026-10-03")).toBeNull();
  });

  it("rejects impossible and future dates while accepting the current Manila date",()=>{
    expect(receiptDateError(order(),"2026-02-30",undefined,"2026-10-03")).toBe("Select a valid received date.");
    expect(receiptDateError(order(),"2026-10-04",undefined,"2026-10-03")).toContain("cannot be later");
    expect(receiptDateError(order(),"2026-10-03",undefined,"2026-10-03")).toBeNull();
  });
});

describe("standard purchase-unit conversion",()=>{
  it("uses authoritative standard factors",()=>{
    expect(standardPurchaseConversionFactor("kg","g")).toBe(1000);
    expect(standardPurchaseConversionFactor("g","kg")).toBe(0.001);
    expect(standardPurchaseConversionFactor("L","ml")).toBe(1000);
    expect(standardPurchaseConversionFactor("ml","L")).toBe(0.001);
    expect(standardPurchaseConversionFactor("pc","pc")).toBe(1);
  });
  it("does not invent an incompatible factor",()=>expect(standardPurchaseConversionFactor("L","g")).toBeNull());
  it("previews the canonical inventory quantity without changing purchasing logic",()=>{
    expect(convertedPurchaseQuantity("2.5","kg","g")).toBe(2500);
    expect(convertedPurchaseQuantity("","kg","g")).toBeNull();
    expect(convertedPurchaseQuantity("2","L","g")).toBeNull();
  });
  it("explains that only confirmed receipt changes inventory",()=>{
    expect(PURCHASE_ORDER_STOCK_TIMING_GUIDANCE).toContain("does not increase inventory");
    expect(PURCHASE_ORDER_STOCK_TIMING_GUIDANCE).toContain("after received quantities are confirmed");
  });
});

describe("purchase-order creation validation",()=>{
  const valid = { supplierName:"Supplier", orderDate:"2026-10-03", expectedDeliveryDate:"2026-10-04", rowCount:1, validRowCount:1 };
  const validItem = { inventoryItemId:"item-1", quantityOrdered:"10", unitCost:"2.50", purchaseUom:"kg", conversionFactor:"1000" };

  it("shows the specific missing-count business rule and action",()=>{
    const onGoToInventoryCount = vi.fn();
    expect(isPhysicalCountRequiredError({ response: { data: { error: { code: "PHYSICAL_COUNT_REQUIRED" } } } })).toBe(true);
    const markup = renderToStaticMarkup(React.createElement(PhysicalCountRequiredNotice,{orderDate:"2026-10-03",onGoToInventoryCount}));
    expect(markup).toContain("Full Physical Count Required");
    expect(markup).toContain("Monday-Sunday week");
    expect(markup).toContain("October 3, 2026");
    expect(markup).toContain("Go to Full Physical Count");
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
