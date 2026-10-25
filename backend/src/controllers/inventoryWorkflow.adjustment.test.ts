import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  writeAudit: vi.fn(),
  loadInventoryLedger: vi.fn(),
}));
vi.mock("../config/database.js", () => ({ pool: { connect: mocks.connect, query: vi.fn() } }));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("../services/inventoryLedger.service.js", () => ({ loadInventoryLedger: mocks.loadInventoryLedger }));

import { createInventoryMovement, validateCompleteInventoryCountItemSet } from "./inventoryWorkflow.controller.js";

const branchId="00000000-0000-4000-8000-000000000001";
const itemId="00000000-0000-4000-8000-000000000002";
const requestId="00000000-0000-4000-8000-000000000003";
const manager={id:"00000000-0000-4000-8000-000000000004",role:"BRANCH_MANAGER",branchId} as const;
const body={inventoryItemId:itemId,movementType:"APPROVED_ADJUSTMENT_DECREASE",quantity:5,unit:"g",reason:"Correct damaged stock after verification",requestId};

function response(){const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res;}
function client(prior:unknown[]=[], unavailableBaseline=false, finalizedFull=false){
  const statements:string[]=[];
  const query=vi.fn(async(statement:unknown)=>{
    const sql=String(statement);statements.push(sql);
    if(sql.includes("adjustment_request_id=$2"))return{rows:prior};
    if(sql.includes("SELECT unit FROM inventory_items"))return{rows:[{unit:"g"}]};
    if(sql.includes("FROM inventory_items ii") && sql.includes("inventory_opening_baseline_items"))return{rows:unavailableBaseline?[{sku:"ING-99",name:"Oat Milk"}]:[]};
    if(sql.includes("count_type='FULL'"))return{rows:finalizedFull?[{countNo:"IC-2026-00010"}]:[]};
    if(sql.includes("INSERT INTO inventory_movements"))return{rows:[{id:"movement-1",branchId,inventoryItemId:itemId,movementType:body.movementType,quantity:5,occurredAt:"2026-10-14T00:00:00Z"}]};
    return{rows:[]};
  });
  return{value:{query,release:vi.fn()},statements};
}

describe("controlled inventory adjustments",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.writeAudit.mockResolvedValue(undefined);mocks.loadInventoryLedger.mockResolvedValue({calculatedBalance:5,activities:[],startingStock:5,operationalPosConsumption:0});});

  it("commits one audited adjustment under the branch lock",async()=>{
    const c=client();mocks.connect.mockResolvedValue(c.value);const res=response();
    await createInventoryMovement({body,user:manager} as never,res as never,vi.fn());
    expect(c.statements[0]).toBe("BEGIN");
    expect(c.statements.some((sql)=>sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(c.statements.filter((sql)=>sql.includes("INSERT INTO inventory_movements"))).toHaveLength(1);
    expect(c.statements).toContain("COMMIT");
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
  });

  it("returns an identical idempotent replay without another write",async()=>{
    const c=client([{id:"movement-1",inventoryItemId:itemId,movementType:body.movementType,quantity:5,enteredQuantity:5,enteredUnit:"g",adjustmentReason:body.reason,occurredAt:"2026-10-14T00:00:00Z"}]);
    mocks.connect.mockResolvedValue(c.value);const res=response();
    await createInventoryMovement({body,user:manager} as never,res as never,vi.fn());
    expect(c.statements.some((sql)=>sql.includes("INSERT INTO inventory_movements"))).toBe(false);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({replayed:true})}));
  });

  it("rejects replaying a request UUID with different details",async()=>{
    const c=client([{id:"movement-1",inventoryItemId:itemId,movementType:body.movementType,quantity:5,enteredQuantity:4,enteredUnit:"g",adjustmentReason:body.reason,occurredAt:"2026-10-14T00:00:00Z"}]);
    mocks.connect.mockResolvedValue(c.value);
    await expect(createInventoryMovement({body,user:manager} as never,response() as never,vi.fn())).rejects.toMatchObject({status:409,code:"IDEMPOTENCY_CONFLICT"});
    expect(c.statements).toContain("ROLLBACK");
  });

  it("allows a decrease to zero and rejects a decrease below zero",async()=>{
    const allowed=client();mocks.connect.mockResolvedValueOnce(allowed.value);
    await createInventoryMovement({body,user:manager} as never,response() as never,vi.fn());
    const blocked=client();mocks.connect.mockResolvedValueOnce(blocked.value);mocks.loadInventoryLedger.mockResolvedValueOnce({calculatedBalance:4,activities:[],startingStock:4,operationalPosConsumption:0});
    await expect(createInventoryMovement({body,user:manager} as never,response() as never,vi.fn())).rejects.toMatchObject({status:422,code:"INVENTORY_ADJUSTMENT_NEGATIVE_STOCK"});
    expect(blocked.statements.some((sql)=>sql.includes("INSERT INTO inventory_movements"))).toBe(false);
  });

  it("rolls back the movement when its audit write fails",async()=>{
    const c=client();mocks.connect.mockResolvedValue(c.value);mocks.writeAudit.mockRejectedValueOnce(new Error("audit failed"));
    await expect(createInventoryMovement({body,user:manager} as never,response() as never,vi.fn())).rejects.toThrow("audit failed");
    expect(c.statements).toContain("ROLLBACK");
    expect(c.statements).not.toContain("COMMIT");
  });

  it("rejects an adjustment before the ingredient baseline is effective",async()=>{
    const c=client([],true);mocks.connect.mockResolvedValue(c.value);
    await expect(createInventoryMovement({body,user:manager} as never,response() as never,vi.fn())).rejects.toMatchObject({status:409,code:"INVENTORY_BASELINE_REQUIRED"});
    expect(c.statements.some((sql)=>sql.includes("INSERT INTO inventory_movements"))).toBe(false);
    expect(c.statements).toContain("ROLLBACK");
  });

  it("rejects a new same-day stock adjustment after Full Physical Count",async()=>{
    const c=client([],false,true);mocks.connect.mockResolvedValue(c.value);
    await expect(createInventoryMovement({body,user:manager} as never,response() as never,vi.fn())).rejects.toMatchObject({
      status:409,code:"INVENTORY_ADJUSTMENT_AFTER_FULL_COUNT",
    });
    expect(c.statements.some((sql)=>sql.includes("INSERT INTO inventory_movements"))).toBe(false);
    expect(c.statements).toContain("ROLLBACK");
  });
});

describe("full physical-count item-set validation",()=>{
  const expected={items:[{inventoryItemId:"item-1",sku:"A"},{inventoryItemId:"item-2",sku:"B"}],unavailableItems:[{inventoryItemId:"item-3",sku:"C",availability:"NO_BASELINE" as const}]};
  it("accepts the complete countable set",()=>expect(()=>validateCompleteInventoryCountItemSet(expected as never,["item-1","item-2"])).not.toThrow());
  it("rejects an incomplete set",()=>expect(()=>validateCompleteInventoryCountItemSet(expected as never,["item-1"])).toThrow(/Missing countable items: B/));
  it("rejects an item with no baseline",()=>expect(()=>validateCompleteInventoryCountItemSet(expected as never,["item-1","item-2","item-3"])).toThrow(/No Baseline: C/));
  it("rejects duplicate inventory item IDs",()=>expect(()=>validateCompleteInventoryCountItemSet(expected as never,["item-1","item-1","item-2"])).toThrow(/duplicate inventory items/));
  it("rejects a foreign or inactive item",()=>expect(()=>validateCompleteInventoryCountItemSet(expected as never,["item-1","item-2","item-x"])).toThrow(/foreign-branch/));
});
