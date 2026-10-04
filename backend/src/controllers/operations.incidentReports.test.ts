import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({clientQuery:vi.fn(),poolQuery:vi.fn(),release:vi.fn(),writeAudit:vi.fn()}));
vi.mock("../config/database.js",()=>({pool:{connect:vi.fn(async()=>({query:mocks.clientQuery,release:mocks.release})),query:mocks.poolQuery}}));
vi.mock("../services/audit.service.js",()=>({writeAudit:mocks.writeAudit}));

import { createIncidentReport } from "./operations.controller.js";

const ids=["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000003"];
const request=(items=ids.map((inventoryItemId,index)=>({inventoryItemId,quantity:[500,1000,50][index]})))=>({body:{items,incidentType:"SPILLAGE",occurredAt:"2026-10-02T02:30:00.000Z",reason:"Staff accidentally spilled several ingredients during preparation."},user:{id:"00000000-0000-4000-8000-000000000010",role:"STAFF",branchId:"00000000-0000-4000-8000-000000000020"}} as never);

describe("multi-item incident creation",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.clientQuery.mockImplementation(async(statement:unknown)=>{const sql=String(statement);if(sql.includes("SELECT id,name,unit FROM inventory_items"))return{rows:ids.map((id,index)=>({id,name:["Strawberry Syrup","Whole Milk","Salt"][index],unit:["ml","ml","g"][index]}))};if(sql.includes("INSERT INTO incident_reports"))return{rows:[{id:"00000000-0000-4000-8000-000000000099"}]};return{rows:[]};});mocks.poolQuery.mockResolvedValue({rows:[{id:"00000000-0000-4000-8000-000000000099",items:[]}]});});
  it("creates one parent, three canonical child rows, one audit, and one notification",async()=>{
    const res={status:vi.fn().mockReturnThis(),json:vi.fn()};
    await createIncidentReport(request(),res as never,vi.fn());
    const sql=mocks.clientQuery.mock.calls.map(([statement])=>String(statement));
    expect(sql.filter((value)=>value.includes("INSERT INTO incident_reports ("))).toHaveLength(1);
    expect(sql.filter((value)=>value.includes("INSERT INTO incident_report_items"))).toHaveLength(3);
    expect(sql.filter((value)=>value.includes("INSERT INTO notifications"))).toHaveLength(1);
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
