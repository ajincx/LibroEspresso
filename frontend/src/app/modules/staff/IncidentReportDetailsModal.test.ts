import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IncidentReport } from "../../types/operations";
import { IncidentReportDetailsModal } from "./IncidentReportDetailsModal";

const report:IncidentReport={id:"incident-1",branchId:"branch-1",branchName:"Lipa",inventoryItemId:"item-1",inventoryItemName:"Cup",sku:"CUP-01",unit:"piece",productId:null,productCode:null,productName:null,shrinkageReportId:null,shrinkageReportNo:null,incidentType:"OTHER",otherIncidentType:"Packaging issue",quantity:2,occurredAt:"2026-09-12T08:00:00.000Z",reason:"The packaging was defective.",notes:null,photoUrl:null,status:"PENDING",submittedByUserId:"staff-1",submittedByName:"Maria Staff",submittedByRole:"STAFF",verifiedByUserId:null,verifiedByName:null,verifiedAt:null,managerComment:null,createdAt:"2026-09-12T08:05:00.000Z"};

describe("incident report details",()=>{
  it("shows the supplementary OTHER specification for Staff and management details",()=>{
    const markup=renderToStaticMarkup(React.createElement(IncidentReportDetailsModal,{report,canReview:false,onClose:()=>undefined}));
    expect(markup).toContain("Specified Incident Type");
    expect(markup).toContain("Packaging issue");
    expect(markup).toContain("The packaging was defective.");
  });
  it("shows every affected item while keeping one Manager review workflow",()=>{
    const multi={...report,items:[
      {id:"child-1",inventoryItemId:"syrup",sku:"ING-1",name:"Strawberry Syrup",quantity:500,unit:"ml"},
      {id:"child-2",inventoryItemId:"milk",sku:"RM-1",name:"Whole Milk",quantity:1000,unit:"ml"},
      {id:"child-3",inventoryItemId:"salt",sku:"ING-2",name:"Salt",quantity:50,unit:"g"},
    ]};
    const markup=renderToStaticMarkup(React.createElement(IncidentReportDetailsModal,{report:multi,canReview:true,onClose:()=>undefined,onReview:()=>undefined}));
    expect(markup).toContain("Strawberry Syrup"); expect(markup).toContain("Whole Milk"); expect(markup).toContain("Salt");
    expect((markup.match(/Verify Report/g)??[])).toHaveLength(1);
  });
});
