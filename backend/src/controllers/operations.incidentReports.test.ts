import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({clientQuery:vi.fn(),poolQuery:vi.fn(),release:vi.fn(),writeAudit:vi.fn()}));
vi.mock("../config/database.js",()=>({pool:{connect:vi.fn(async()=>({query:mocks.clientQuery,release:mocks.release})),query:mocks.poolQuery}}));
vi.mock("../services/audit.service.js",()=>({writeAudit:mocks.writeAudit}));

import { assertIncidentOccurredAtNotFuture, createIncidentReport, linkIncidentToInvestigation, reviewIncidentReport } from "./operations.controller.js";

const ids=["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000003"];
const request=(items:Array<{inventoryItemId:string;quantity:number;enteredUnit?:string}>=ids.map((inventoryItemId,index)=>({inventoryItemId,quantity:[500,1000,1][index]??1,enteredUnit:index===2?"kg":undefined})))=>({body:{items,incidentType:"SPILLAGE",occurredAt:"2026-10-02T02:30:00.000Z",lateReportingReason:"Submitted after the documented shift review.",reason:"Staff accidentally spilled several ingredients during preparation."},user:{id:"00000000-0000-4000-8000-000000000010",role:"STAFF",branchId:"00000000-0000-4000-8000-000000000020"}} as never);

describe("multi-item incident creation",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.clientQuery.mockImplementation(async(statement:unknown)=>{const sql=String(statement);if(sql.includes("SELECT id,name,unit FROM inventory_items"))return{rows:ids.map((id,index)=>({id,name:["Strawberry Syrup","Whole Milk","Salt"][index],unit:["ml","ml","g"][index]}))};if(sql.includes("INSERT INTO incident_reports"))return{rows:[{id:"00000000-0000-4000-8000-000000000099"}]};return{rows:[]};});mocks.poolQuery.mockResolvedValue({rows:[{id:"00000000-0000-4000-8000-000000000099",items:[]}]});});
  it("creates one parent, three canonical child rows, one audit, and one notification",async()=>{
    const res={status:vi.fn().mockReturnThis(),json:vi.fn()};
    await createIncidentReport(request(),res as never,vi.fn());
    const sql=mocks.clientQuery.mock.calls.map(([statement])=>String(statement));
    expect(sql.filter((value)=>value.includes("INSERT INTO incident_reports ("))).toHaveLength(1);
    expect(sql.filter((value)=>value.includes("INSERT INTO incident_report_items"))).toHaveLength(3);
    expect(mocks.clientQuery.mock.calls.filter(([statement])=>String(statement).includes("INSERT INTO incident_report_items")).at(-1)?.[1]).toEqual([expect.any(String),ids[2],1000]);
    expect(sql.filter((value)=>value.includes("INSERT INTO notifications"))).toHaveLength(1);
    expect(sql.findIndex((value)=>value.includes("pg_advisory_xact_lock"))).toBeLessThan(sql.findIndex((value)=>value.includes("INSERT INTO incident_reports (")));
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
    expect(sql).toContain("COMMIT");
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("rejects an inactive or out-of-branch item and rolls back everything",async()=>{
    mocks.clientQuery.mockImplementation(async(statement:unknown)=>String(statement).includes("SELECT id,name,unit FROM inventory_items")?{rows:[]}:{rows:[]});
    await expect(createIncidentReport(request([ {inventoryItemId:ids[0]!,quantity:1} ]),{} as never,vi.fn())).rejects.toMatchObject({code:"INVENTORY_ITEM_INVALID"});
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});

describe("incident date and late-report safeguards",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.poolQuery.mockResolvedValue({rows:[{id:"incident-1",isLate:true,businessDateFinalized:true}]});});
  it("rejects future instants across the Manila date boundary",()=>{
    expect(()=>assertIncidentOccurredAtNotFuture("2026-10-22T16:31:00.000Z",new Date("2026-10-22T16:30:00.000Z"))).toThrowError(expect.objectContaining({code:"INCIDENT_DATE_IN_FUTURE"}));
    expect(()=>assertIncidentOccurredAtNotFuture("2026-10-22T16:30:00.000Z",new Date("2026-10-22T16:30:00.000Z"))).not.toThrow();
  });
  it("requires a ten-character Manager explanation before approving a late request",async()=>{
    mocks.clientQuery.mockImplementation(async(statement:unknown)=>String(statement).includes("SELECT EXISTS (SELECT 1 FROM inventory_counts finalized")?{rows:[{isLate:true}]}:{rows:[]});
    await expect(reviewIncidentReport({params:{id:"00000000-0000-4000-8000-000000000099"},body:{status:"VERIFIED",managerComment:"Too short"},user:{id:"manager-1",role:"BRANCH_MANAGER",branchId:"branch-1"}} as never,{} as never,vi.fn())).rejects.toMatchObject({code:"LATE_INCIDENT_APPROVAL_REASON_REQUIRED"});
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.clientQuery.mock.calls.map(([statement])=>String(statement)).some((sql)=>sql.includes("UPDATE incident_reports SET status"))).toBe(false);
  });
  it("approves a late request atomically without creating inventory activity",async()=>{
    mocks.clientQuery.mockImplementation(async(statement:unknown)=>String(statement).includes("SELECT EXISTS (SELECT 1 FROM inventory_counts finalized")?{rows:[{isLate:true}]}:{rows:[]});
    const res={json:vi.fn()};
    await reviewIncidentReport({params:{id:"00000000-0000-4000-8000-000000000099"},body:{status:"VERIFIED",managerComment:"Approved after reviewing the closing records."},user:{id:"manager-1",role:"BRANCH_MANAGER",branchId:"branch-1"}} as never,res as never,vi.fn());
    const sql=mocks.clientQuery.mock.calls.map(([statement])=>String(statement));
    expect(sql).toContain("COMMIT");
    expect(sql.some((value)=>value.includes("inventory_movements")||value.includes("branch_inventory_balances")||value.includes("shrinkage_reports"))).toBe(false);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(),"REVIEW_INCIDENT_REPORT","INCIDENT_REPORT",expect.anything(),expect.anything(),expect.objectContaining({lateRequest:true}),expect.anything());
  });
  it("blocks explicit evidence linkage until a late request is verified",async()=>{
    mocks.clientQuery.mockImplementation(async(statement:unknown)=>String(statement).includes('SELECT iri.id "incidentReportItemId"')?{rows:[{incidentReportItemId:"item-1",isLate:true,status:"PENDING"}]}:{rows:[]});
    await expect(linkIncidentToInvestigation({params:{id:"00000000-0000-4000-8000-000000000099"},body:{shrinkageReportId:"00000000-0000-4000-8000-000000000098",reason:"Reviewed candidate evidence"},user:{id:"manager-1",role:"BRANCH_MANAGER",branchId:"branch-1"}} as never,{} as never,vi.fn())).rejects.toMatchObject({code:"LATE_INCIDENT_APPROVAL_REQUIRED"});
    expect(mocks.clientQuery.mock.calls.map(([statement])=>String(statement)).some((sql)=>sql.includes("INSERT INTO incident_shrinkage_links"))).toBe(false);
  });
});
