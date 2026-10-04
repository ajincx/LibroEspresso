import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({poolQuery:vi.fn(),clientQuery:vi.fn(),release:vi.fn(),writeAudit:vi.fn()}));
vi.mock("../config/database.js",()=>({pool:{query:mocks.poolQuery,connect:vi.fn(async()=>({query:mocks.clientQuery,release:mocks.release}))}}));
vi.mock("../services/audit.service.js",()=>({writeAudit:mocks.writeAudit}));

import { createMenuCategory, updateMenuCategory } from "./catalog.controller.js";

const categoryId="00000000-0000-4000-8000-000000000045";
const user={id:"00000000-0000-4000-8000-000000000001",role:"OWNER",branchId:null};
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});

describe("menu category persistence",()=>{
  beforeEach(()=>vi.clearAllMocks());

  it("creates a category with its database-backed description",async()=>{
    mocks.poolQuery.mockResolvedValue({rows:[{id:categoryId,name:"Cold Beverages",description:"Chilled drinks.",status:"ACTIVE"}]});
    const res=response();
    await createMenuCategory({body:{name:"Cold Beverages",description:"Chilled drinks.",status:"ACTIVE"},user} as never,res as never,vi.fn());
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO menu_categories"),["Cold Beverages","Chilled drinks.","ACTIVE"]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(),"CREATE_MENU_CATEGORY","MENU_CATEGORY",categoryId,expect.any(String));
  });

  it("renames the same category UUID and keeps product, recipe, and POS identities untouched",async()=>{
    const queries:{sql:string;values?:unknown[]}[]=[];
    mocks.clientQuery.mockImplementation(async(statement:unknown,values?:unknown[])=>{const sql=String(statement);queries.push({sql,values});if(sql.includes("UPDATE menu_categories"))return{rows:[{id:categoryId,name:"Cold Beverages",description:"Chilled drinks.",status:"ACTIVE"}]};return{rows:[]};});
    const res=response();
    await updateMenuCategory({params:{id:categoryId},body:{name:"Cold Beverages",description:"Chilled drinks."},user} as never,res as never,vi.fn());
    expect(queries.find(({sql})=>sql.includes("UPDATE menu_categories"))?.values?.[0]).toBe(categoryId);
    expect(queries.find(({sql})=>sql.includes("UPDATE menu_items"))?.values).toEqual([categoryId,"Cold Beverages"]);
    expect(queries.some(({sql})=>/UPDATE (recipes|recipe_items|menu_item_variants|pos_product_variant_mappings)/.test(sql))).toBe(false);
    expect(queries.at(-1)?.sql).toBe("COMMIT");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({data:{category:expect.objectContaining({id:categoryId,description:"Chilled drinks."})}}));
  });
});
