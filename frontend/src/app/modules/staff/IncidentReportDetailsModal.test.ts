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
});
