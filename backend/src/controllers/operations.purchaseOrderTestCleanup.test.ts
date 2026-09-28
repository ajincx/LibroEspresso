import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), poolQuery: vi.fn(), writeAudit: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { connect: mocks.connect, query: mocks.poolQuery } }));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));

import { authorizePurchaseOrderTestCleanup, deletePurchaseOrderTestData } from "./operations.controller.js";

const orderId = "00000000-0000-4000-8000-000000000041";
const branchId = "00000000-0000-4000-8000-000000000002";
const owner = { id: "00000000-0000-4000-8000-000000000001", role: "OWNER", branchId: null } as const;
const request = (body={reason:"Repeatable development receipt and UOM verification"}) => ({params:{id:orderId},body,user:owner}) as never;
function response(){const res={json:vi.fn(),status:vi.fn()};res.status.mockReturnValue(res);return res;}

beforeEach(()=>{vi.clearAllMocks();mocks.writeAudit.mockResolvedValue(undefined);mocks.poolQuery.mockResolvedValue({rows:[{id:orderId,poNo:"PO-TEST",isTestData:true,testAuthorizedAt:"2026-09-28T00:00:00Z",items:[]} ]});});

describe("controlled purchase-order test data",()=>{
  it("allows an Owner to authorize one zero-received PO and records the decision",async()=>{
    const statements:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{
      const sql=String(statement);statements.push(sql);
      if(sql.includes("UPDATE purchase_orders po"))return{rows:[{id:orderId,poNo:"PO-TEST",branchId}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    await authorizePurchaseOrderTestCleanup(request(),response() as never,vi.fn());
    expect(statements).toContain("BEGIN");
    expect(statements).toContain("COMMIT");
    expect(statements.find(sql=>sql.includes("UPDATE purchase_orders po"))).toContain("item.quantity_received>0");
    expect(mocks.writeAudit).toHaveBeenCalledWith(owner,"AUTHORIZE_TEST_DATA_CLEANUP","PURCHASE_ORDER",orderId,expect.any(String),expect.objectContaining({branchId,reason:expect.any(String)}),client);
  });

  it("refuses authorization when the PO is not zero-received and rolls back",async()=>{
    const statements:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{const sql=String(statement);statements.push(sql);return{rows:[]};}),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    await expect(authorizePurchaseOrderTestCleanup(request(),response() as never,vi.fn())).rejects.toMatchObject({status:409,code:"PO_TEST_AUTHORIZATION_INVALID"});
    expect(statements).toContain("ROLLBACK");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("never deletes a real or merely legacy-classified PO without per-record authorization",async()=>{
    const statements:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{
      const sql=String(statement);statements.push(sql);
      if(sql.includes("FROM purchase_orders WHERE"))return{rows:[{id:orderId,poNo:"PO-REAL",branchId,status:"ORDERED",isTestData:false,testAuthorizedBy:null}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    await expect(deletePurchaseOrderTestData(request(),response() as never,vi.fn())).rejects.toMatchObject({status:409,code:"PO_NOT_AUTHORIZED_TEST_DATA"});
    expect(statements.some(sql=>sql.includes("DELETE FROM purchase_orders"))).toBe(false);
    expect(statements).toContain("ROLLBACK");
  });

  it("transactionally removes an authorized received test PO and restores its prior cost",async()=>{
    const appliedAt=new Date("2026-09-28T01:00:00Z");
    const statements:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{
      const sql=String(statement);statements.push(sql);
      if(sql.includes("FROM purchase_orders WHERE"))return{rows:[{id:orderId,poNo:"PO-TEST",branchId,status:"RECEIVED",isTestData:true,testAuthorizedBy:owner.id}]};
      if(sql.includes("FROM purchase_order_items"))return{rows:[{inventoryItemId:"item-1",quantityReceived:2,priorSettingExisted:true,priorUnitCost:1.25,costAppliedAt:appliedAt}]};
      if(sql.includes("SELECT id FROM inventory_movements"))return{rows:[]};
      if(sql.includes('SELECT updated_at "updatedAt"'))return{rows:[{updatedAt:appliedAt}]};
      if(sql.includes("DELETE FROM inventory_movements"))return{rows:[{id:"movement-1"}],rowCount:1};
      if(sql.includes("UPDATE branch_inventory_settings"))return{rows:[{inventory_item_id:"item-1"}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    const res=response();
    await deletePurchaseOrderTestData(request(),res as never,vi.fn());
    expect(statements.find(sql=>sql.includes("DELETE FROM inventory_movements"))).toContain("is_test_data=true");
    expect(statements.some(sql=>sql.includes("DELETE FROM purchase_orders"))).toBe(true);
    expect(statements).toContain("COMMIT");
    expect(mocks.writeAudit).toHaveBeenCalledWith(owner,"TEST_DATA_CLEANUP","PURCHASE_ORDER",orderId,expect.any(String),expect.objectContaining({authorizedBy:owner.id,removedMovementCount:1}),client);
    expect(res.json).toHaveBeenCalledWith({success:true,data:{deletedId:orderId}});
  });
});
