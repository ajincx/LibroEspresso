import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({clientQuery:vi.fn(),release:vi.fn(),writeAudit:vi.fn()}));
vi.mock("../config/database.js",()=>({pool:{connect:vi.fn(async()=>({query:mocks.clientQuery,release:mocks.release}))}}));
vi.mock("../services/audit.service.js",()=>({writeAudit:mocks.writeAudit}));

import { createInventoryItem } from "./catalog.controller.js";

const ownerId="00000000-0000-4000-8000-000000000001";
const managerId="00000000-0000-4000-8000-000000000002";
const branchId="00000000-0000-4000-8000-000000000003";
const itemId="00000000-0000-4000-8000-000000000004";
const body={name:"Cocoa Powder",category:"Dry Goods",unit:"g",unitCost:0.45,reorderLevel:500,status:"ACTIVE",itemScope:"BRANCH",originBranchId:"00000000-0000-4000-8000-000000000099",branchId:"00000000-0000-4000-8000-000000000099"};

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.clientQuery.mockImplementation(async(statement:unknown)=>{
    const sql=String(statement);
    if(sql.includes("nextval('inventory_item_code_seq')"))return{rows:[{sku:"ING-00001"}]};
    if(sql.includes("INSERT INTO inventory_items"))return{rows:[{id:itemId,sku:"ING-00001",name:"Cocoa Powder",itemScope:"GLOBAL",originBranchId:null}]};
    return{rows:[]};
  });
});

describe("inventory ingredient creation scope",()=>{
  it("forces Owner-created ingredients to GLOBAL and creates settings for every branch",async()=>{
    const status=vi.fn().mockReturnThis();
    await createInventoryItem({user:{id:ownerId,role:"OWNER",branchId:null},body} as never,{status,json:vi.fn()} as never,vi.fn());
    const insert=mocks.clientQuery.mock.calls.find(([sql])=>String(sql).includes("INSERT INTO inventory_items"));
    expect(insert?.[1]).toEqual(["ING-00001","Cocoa Powder","Dry Goods","g",0.45,500,"ACTIVE","GLOBAL",null,ownerId]);
    const settings=mocks.clientQuery.mock.calls.find(([sql])=>String(sql).includes("INSERT INTO branch_inventory_settings"));
    expect(String(settings?.[0])).toContain("SELECT id,$1");
    expect(settings?.[1]).toEqual([itemId,0.45,500,ownerId]);
    expect(status).toHaveBeenCalledWith(201);
  });

  it("forces Manager-created ingredients to the authenticated branch only",async()=>{
    const status=vi.fn().mockReturnThis();
    mocks.clientQuery.mockImplementation(async(statement:unknown)=>{
      const sql=String(statement);
      if(sql.includes("nextval('inventory_item_code_seq')"))return{rows:[{sku:"ING-00002"}]};
      if(sql.includes("INSERT INTO inventory_items"))return{rows:[{id:itemId,sku:"ING-00002",name:"Cocoa Powder",itemScope:"BRANCH",originBranchId:branchId}]};
      return{rows:[]};
    });
    await createInventoryItem({user:{id:managerId,role:"BRANCH_MANAGER",branchId},body} as never,{status,json:vi.fn()} as never,vi.fn());
    const insert=mocks.clientQuery.mock.calls.find(([sql])=>String(sql).includes("INSERT INTO inventory_items"));
    expect(insert?.[1]).toEqual(["ING-00002","Cocoa Powder","Dry Goods","g",0.45,500,"ACTIVE","BRANCH",branchId,managerId]);
    const settings=mocks.clientQuery.mock.calls.find(([sql])=>String(sql).includes("INSERT INTO branch_inventory_settings"));
    expect(String(settings?.[0])).toContain("VALUES ($1,$2,$3,$4,7,$5)");
    expect(settings?.[1]).toEqual([branchId,itemId,0.45,500,managerId]);
  });

  it("rejects a Manager without an authenticated branch before inserting",async()=>{
    await expect(createInventoryItem({user:{id:managerId,role:"BRANCH_MANAGER",branchId:null},body} as never,{} as never,vi.fn())).rejects.toMatchObject({code:"BRANCH_REQUIRED"});
    expect(mocks.clientQuery.mock.calls.some(([sql])=>String(sql).includes("INSERT INTO inventory_items"))).toBe(false);
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });
});
