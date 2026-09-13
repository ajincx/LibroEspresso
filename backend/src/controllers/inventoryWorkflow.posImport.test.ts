import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePosCsv } from "../services/posCsvImport.service.js";
import { AppError } from "../utils/appError.js";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: { connect: mocks.connect, query: mocks.poolQuery },
}));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));

import { deletePosImport, importPosSales, listPosImports } from "./inventoryWorkflow.controller.js";

const branchId = "00000000-0000-4000-8000-000000000002";
const importId = "00000000-0000-4000-8000-000000000010";
const csvText =
  "product_code,quantity_sold,selling_price,business_date,transaction_id,line_id\nLATTE-L,2,190,2026-09-08,R-1,1";
const request = () =>
  ({
    body: {
      sourceFilename: "sales.csv",
      csvText,
      expectedContentHash: parsePosCsv(csvText).contentHash,
      branchId: "00000000-0000-4000-8000-000000000099",
    },
    user: { id: "manager-1", role: "BRANCH_MANAGER", branchId },
  }) as never;

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function createClient(failAt?: "sale" | "usage" | "concurrent-duplicate") {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (statement: unknown, values?: unknown[]) => {
    const sql = String(statement);
    queries.push({ sql, values });
    if (sql.includes("SELECT name \"branchName\" FROM branches")) {
      return { rows: [{ branchName: "Lipa" }] };
    }
    if (sql.includes("FROM menu_items mi")) {
      return {
        rows: [
          {
            id: "menu-1",
            code: "LATTE-L",
            name: "Iced Latte, Large",
            sellingPrice: 190,
            recipeVersionId: "recipe-v1",
            recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }],
          },
        ],
      };
    }
    if (sql.includes("SELECT id FROM pos_imports")) return { rows: [] };
    if (sql.includes("INSERT INTO pos_imports")) {
      if (failAt === "concurrent-duplicate") throw Object.assign(new Error("duplicate"), { code: "23505" });
      return { rows: [{ id: "import-1" }] };
    }
    if (sql.includes("INSERT INTO pos_sale_items")) {
      if (failAt === "sale") throw new Error("sale insert failed");
      return { rows: [] };
    }
    if (sql.includes('psi.id "saleItemId"')) {
      return { rows: [{ saleItemId:"sale-1",quantitySold:2,recipeVersionId:"recipe-v1",yieldQuantity:1,inventoryItemId:"ingredient-1",recipeQuantity:18,recipeUnit:"g",inventoryUnit:"kg",unitCost:800 }] };
    }
    if (sql.includes("INSERT INTO pos_sale_ingredient_usage")) {
      if (failAt === "usage") throw new Error("usage generation failed");
      return { rows: [] };
    }
    if (sql.includes("sum(usage.quantity_consumed)")) {
      return {
        rows: [
          {
            inventoryItemId: "ingredient-1",
            sku: "MILK",
            name: "Milk",
            unit: "ml",
            expectedConsumption: 300,
          },
        ],
      };
    }
    if (sql.includes("concat(u.first_name")) {
      return {
        rows: [
          {
            branchName: "Lipa",
            managerName: "Branch Manager",
            totalSales: 380,
            unitsSold: 2,
          },
        ],
      };
    }
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  return { client, queries };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poolQuery.mockResolvedValue({ rows: [] });
  mocks.writeAudit.mockResolvedValue(undefined);
});

describe("transactional POS import persistence", () => {
  it("rolls back the import batch when sale-line creation fails", async () => {
    const { client, queries } = createClient("sale");
    mocks.connect.mockResolvedValue(client);

    await expect(importPosSales(request(), response() as never, vi.fn())).rejects.toThrow("sale insert failed");

    expect(queries.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(queries.some(({ sql }) => sql === "COMMIT")).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back stored sales when ingredient-usage generation fails", async () => {
    const { client, queries } = createClient("usage");
    mocks.connect.mockResolvedValue(client);

    await expect(importPosSales(request(), response() as never, vi.fn())).rejects.toThrow("usage generation failed");

    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_sale_items"))).toBe(true);
    expect(queries.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(queries.some(({ sql }) => sql === "COMMIT")).toBe(false);
  });

  it("stores sale and ingredient snapshots before committing a successful import", async () => {
    const { client, queries } = createClient();
    mocks.connect.mockResolvedValue(client);
    const res = response();

    await importPosSales(request(), res as never, vi.fn());

    const sale = queries.find(({ sql }) => sql.includes("INSERT INTO pos_sale_items"));
    const usage = queries.find(({ sql }) => sql.includes("INSERT INTO pos_sale_ingredient_usage"));
    const previewProducts = queries.find(({ sql }) => sql.includes("FROM menu_items mi"));
    const usageSource = queries.find(({ sql }) => sql.includes('psi.id "saleItemId"'));
    expect(sale?.values).toEqual([
      "import-1",
      branchId,
      "2026-09-08",
      ["menu-1"],
      [2],
      [190],
      ["LATTE-L"],
      ["R-1"],
      ["1"],
      [null],
    ]);
    expect(usage?.sql).toContain("quantity_consumed,unit,unit_cost_snapshot,recipe_version_id");
    expect(usage?.values).toEqual([["sale-1"],["ingredient-1"],[0.036],["kg"],[800],["recipe-v1"]]);
    expect(previewProducts?.sql).toContain("candidate.effective_from<=$2::date");
    expect(previewProducts?.values).toEqual([branchId,"2026-09-08"]);
    expect(usageSource?.sql).toContain("candidate.effective_from<=psi.business_date");
    expect(queries.at(-1)?.sql).toBe("COMMIT");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ rowsImported: 1, totalSales: 380 }),
      }),
    );
  });

  it("maps a concurrent uniqueness conflict to a duplicate rejection", async () => {
    const { client, queries } = createClient("concurrent-duplicate");
    mocks.connect.mockResolvedValue(client);

    let failure: unknown;
    try {
      await importPosSales(request(), response() as never, vi.fn());
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ status: 409, code: "POS_IMPORT_DUPLICATE" });
    expect(queries.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_sale_items"))).toBe(false);
  });
});

describe("POS import history access and deletion",()=>{
  it("keeps Branch Manager import history restricted to the authenticated branch",async()=>{
    mocks.poolQuery.mockResolvedValue({rows:[]});
    const req={query:{branchId:"00000000-0000-4000-8000-000000000099",page:"1",pageSize:"10"},user:{id:"manager-1",role:"BRANCH_MANAGER",branchId}} as never;
    await listPosImports(req,response() as never,vi.fn());
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("pi.branch_id=$1"),[branchId,10,0]);
  });

  it("deletes the complete import batch transactionally and writes a retained audit event",async()=>{
    const queries:Array<{sql:string;values?:unknown[]}>=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{
      const sql=String(statement);queries.push({sql,values});
      if(sql.includes('pi.branch_id "branchId"'))return{rows:[{branchId,branchName:"Lipa",businessDate:"2026-09-13",sourceFilename:"sales.csv",importedByUserId:"manager-1",totalRows:500,saleRowCount:500,ingredientUsageRowCount:1200}]};
      if(sql.includes("FROM inventory_counts"))return{rows:[]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    const req={params:{id:importId},user:{id:"owner-1",role:"OWNER",branchId:null}} as never;
    const res=response();
    await deletePosImport(req,res as never,vi.fn());
    expect(queries.map(item=>item.sql)).toEqual(expect.arrayContaining(["BEGIN",expect.stringContaining("DELETE FROM notifications"),expect.stringContaining("DELETE FROM pos_imports"),"COMMIT"]));
    expect(queries.some(item=>item.sql.includes("DELETE FROM pos_sale_items"))).toBe(false);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.objectContaining({role:"OWNER"}),"POS_IMPORT_DELETED","POS_IMPORT",importId,"Deleted POS import sales.csv",expect.objectContaining({saleRowCount:500,ingredientUsageRowCount:1200}),client);
    expect(res.json).toHaveBeenCalledWith({success:true,data:{id:importId,deleted:true}});
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("blocks deletion after a physical count has reconciled the import date",async()=>{
    const queries:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{
      const sql=String(statement);queries.push(sql);
      if(sql.includes('pi.branch_id "branchId"'))return{rows:[{branchId,branchName:"Lipa",businessDate:"2026-09-13",sourceFilename:"sales.csv",importedByUserId:"manager-1",totalRows:10,saleRowCount:10,ingredientUsageRowCount:20}]};
      if(sql.includes("FROM inventory_counts"))return{rows:[{exists:1}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    let failure:unknown;
    try{await deletePosImport({params:{id:importId},user:{id:"owner-1",role:"OWNER",branchId:null}} as never,response() as never,vi.fn());}catch(error){failure=error;}
    expect(failure).toMatchObject({status:409,code:"POS_IMPORT_RECONCILED"});
    expect(queries).toContain("ROLLBACK");
    expect(queries.some(sql=>sql.includes("DELETE FROM pos_imports"))).toBe(false);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
