import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({
  connect:vi.fn(),
  query:vi.fn(),
  release:vi.fn(),
  writeDestructiveActionAudit:vi.fn(),
}));

vi.mock("../config/database.js",()=>({pool:{connect:mocks.connect,query:vi.fn()}}));
vi.mock("../services/destructiveAction.service.js",()=>({
  writeDestructiveActionAudit:mocks.writeDestructiveActionAudit,
}));

import { deleteMenuProduct } from "./catalog.controller.js";

const productId="00000000-0000-4000-8000-000000000001";
const request=(body:unknown,role="OWNER")=>({
  params:{id:productId},body,user:{id:"owner-id",role,branchId:role==="OWNER"?null:"branch-id"},
}) as never;

function prepare(used:boolean){
  mocks.query.mockImplementation(async(statement:unknown)=>{
    const sql=String(statement);
    if(sql.includes('SELECT name,product_scope'))return{rows:[{name:"Café Latte",productScope:"GLOBAL",originBranchId:null}]};
    if(sql.includes('SELECT code FROM menu_items'))return{rows:[{code:"PRD-00100"}]};
    if(sql.includes('SELECT EXISTS('))return{rows:[{used}]};
    if(sql.includes('"actorName"'))return{rows:[{actorName:"System Owner"}]};
    return{rows:[]};
  });
}

describe("Owner menu product deletion",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({query:mocks.query,release:mocks.release});
  });

  it("permanently deletes an unreferenced product with a meaningful reason and no PIN",async()=>{
    prepare(false);
    const json=vi.fn();
    await deleteMenuProduct(request({reason:"Duplicate product created in error"}),{json} as never,vi.fn());
    const sql=mocks.query.mock.calls.map(([statement])=>String(statement));
    expect(sql).toContain("DELETE FROM recipes WHERE menu_item_id=$1");
    expect(sql).toContain("DELETE FROM menu_items WHERE id=$1");
    expect(json).toHaveBeenCalledWith({success:true,data:{id:productId,action:"DELETED"}});
    expect(mocks.writeDestructiveActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({role:"OWNER"}),
      expect.objectContaining({recordId:productId,reason:"Duplicate product created in error"}),
      expect.stringContaining("Deleted unused"),
      {dependencyFound:false},
      expect.anything(),
      "NOT_REQUIRED",
    );
  });

  it("deactivates a referenced product and preserves its recipes and product row",async()=>{
    prepare(true);
    const json=vi.fn();
    await deleteMenuProduct(request({reason:"Retire product while preserving history"}),{json} as never,vi.fn());
    const sql=mocks.query.mock.calls.map(([statement])=>String(statement));
    const dependencySql=sql.find((statement)=>statement.includes("SELECT EXISTS("))??"";
    expect(dependencySql).toContain("pos_sale_items");
    expect(dependencySql).toContain("pos_sale_ingredient_usage");
    expect(dependencySql).toContain("pos_product_variant_mappings");
    expect(dependencySql).toContain("incident_reports");
    expect(dependencySql).toContain("shrinkage_reports");
    expect(sql.some((statement)=>statement.includes("UPDATE menu_items SET status='INACTIVE'"))).toBe(true);
    expect(sql.some((statement)=>statement.startsWith("DELETE FROM recipes"))).toBe(false);
    expect(sql.some((statement)=>statement.startsWith("DELETE FROM menu_items"))).toBe(false);
    expect(json).toHaveBeenCalledWith({success:true,data:{id:productId,action:"DEACTIVATED"}});
  });

  it("rejects blank reasons and non-Owners before opening a transaction",async()=>{
    await expect(deleteMenuProduct(request({reason:" "}),{} as never,vi.fn())).rejects.toBeTruthy();
    await expect(deleteMenuProduct(request({reason:"Manager attempted deletion"},"BRANCH_MANAGER"),{} as never,vi.fn()))
      .rejects.toMatchObject({status:403,code:"MENU_PRODUCT_DELETE_FORBIDDEN"});
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
