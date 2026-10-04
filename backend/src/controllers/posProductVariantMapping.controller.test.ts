import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: { connect: mocks.connect, query: mocks.poolQuery },
}));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));

import {
  copyApprovedGlobalPosMappings,
  createPosMapping,
  createPosSource,
  deactivateApprovedPosMapping,
  revisePendingPosMapping,
  updatePosMapping,
  updatePosSource,
} from "./posProductVariantMapping.controller.js";

const sourceId = "0518e1fc-521f-4c1e-8b5e-4149fff4fd7e";
const ownerId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";
const originalVariantId = "44444444-4444-4444-8444-444444444444";
const branchId = "55555555-5555-4555-8555-555555555555";
const format = "SUMMARY_ITEMS_SOLD_LEGACY_XLS";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeAudit.mockResolvedValue(undefined);
});

describe("POS source review metadata", () => {
  it("creates a new source as inactive without review metadata", async () => {
    const created = {
      id: sourceId,
      sourceCode: "CLIENT_POS_001",
      displayName: "Client POS",
      supportedFormat: format,
      branchId,
      status: "INACTIVE",
    };
    mocks.poolQuery.mockResolvedValue({ rows: [created], rowCount: 1 });
    const res = response();

    await createPosSource({
      body: { sourceCode: "client_pos_001", displayName: "Client POS", supportedFormat: format, branchId },
      user: { id: ownerId, role: "OWNER", branchId: null },
    } as never, res as never, vi.fn());

    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO pos_sources"), [
      "CLIENT_POS_001", "Client POS", format, branchId, "INACTIVE",
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { source: created } });
  });

  it("activates a format-verified source with separately typed review parameters", async () => {
    const reviewedAt = "2026-09-25T03:00:00.000Z";
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const activated = {
      id: sourceId,
      sourceCode: "CLIENT_POS_001",
      displayName: "Client POS",
      supportedFormat: format,
      status: "ACTIVE",
      formatVerifiedBy: ownerId,
      formatVerifiedAt: reviewedAt,
    };
    const client = {
      query: vi.fn(async (statement: unknown, values?: unknown[]) => {
        const sql = String(statement);
        calls.push({ sql, values });
        if (sql.includes("SELECT supported_format")) {
          return { rows: [{ supportedFormat: format, status: "INACTIVE", branchId }], rowCount: 1 };
        }
        if (sql.includes("FROM branches")) return { rows: [{ id: branchId }], rowCount: 1 };
        if (sql.includes("FROM pos_sources WHERE branch_id")) return { rows: [], rowCount: 0 };
        if (sql.includes("UPDATE pos_sources")) return { rows: [activated], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    const res = response();

    await updatePosSource({
      params: { id: sourceId },
      body: { status: "ACTIVE", confirmedSupportedFormat: format },
      user: { id: ownerId, role: "OWNER", branchId: null },
    } as never, res as never, vi.fn());

    const update = calls.find(({ sql }) => sql.includes("UPDATE pos_sources"));
    expect(update?.sql).toContain("status=$5::record_status");
    expect(update?.sql).toContain("CASE WHEN $6::boolean THEN NULL WHEN $8::boolean THEN $7::uuid");
    expect(update?.sql).toContain("format_verified_at=CASE WHEN $6::boolean THEN NULL WHEN $8::boolean THEN now()");
    expect(update?.values).toEqual([sourceId, null, null, null, "ACTIVE", false, ownerId, true, null]);
    expect(activated.formatVerifiedBy).toBe(ownerId);
    expect(activated.formatVerifiedAt).toBe(reviewedAt);
    expect(calls[0]?.sql).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(calls.some(({ sql }) => sql.includes("FROM branches") && sql.includes("FOR UPDATE"))).toBe(true);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { source: activated } });
  });

  it("rejects activation when the branch already has another active source", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (statement: unknown) => {
        const sql = String(statement); calls.push(sql);
        if (sql.includes("SELECT supported_format")) return { rows: [{ supportedFormat: format, status: "INACTIVE", branchId }] };
        if (sql.includes("FROM branches")) return { rows: [{ id: branchId }] };
        if (sql.includes("FROM pos_sources WHERE branch_id")) return { rows: [{ id: "66666666-6666-4666-8666-666666666666" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);

    await expect(updatePosSource({
      params: { id: sourceId },
      body: { status: "ACTIVE", confirmedSupportedFormat: format },
      user: { id: ownerId, role: "OWNER", branchId: null },
    } as never, response() as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "POS_SOURCE_ACTIVE_BRANCH_CONFLICT",
    });

    expect(calls).toContain("ROLLBACK");
    expect(calls.some((sql) => sql.includes("UPDATE pos_sources"))).toBe(false);
  });

  it("maps a concurrent database uniqueness conflict to the same activation conflict", async () => {
    const client = {
      query: vi.fn(async (statement: unknown) => {
        const sql = String(statement);
        if (sql.includes("SELECT supported_format")) return { rows: [{ supportedFormat: format, status: "INACTIVE", branchId }] };
        if (sql.includes("FROM branches")) return { rows: [{ id: branchId }] };
        if (sql.includes("FROM pos_sources WHERE branch_id")) return { rows: [] };
        if (sql.includes("UPDATE pos_sources")) throw Object.assign(new Error("duplicate"), { code: "23505", constraint: "uq_pos_sources_one_active_per_branch" });
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);

    await expect(updatePosSource({
      params: { id: sourceId },
      body: { status: "ACTIVE", confirmedSupportedFormat: format },
      user: { id: ownerId, role: "OWNER", branchId: null },
    } as never, response() as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "POS_SOURCE_ACTIVE_BRANCH_CONFLICT",
    });
  });
});

type MappingState = {
  status: "ACTIVE" | "INACTIVE";
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "AMBIGUOUS";
};

function mappingClient(state: MappingState, options: { targetValid?: boolean; duplicate?: boolean } = {}) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const revised = {
    id: sourceId, posSourceId: sourceId, branchId, sourceProductName: "H12 CAPP", sourceProductCode: "POS-CAPP-H12",
    menuItemVariantId: variantId, status: "INACTIVE", reviewStatus: "PENDING", reviewComment: "Corrected target",
    reviewedBy: null, reviewedAt: null,
  };
  const client = {
    query: vi.fn(async (statement: unknown, values?: unknown[]) => {
      const sql = String(statement);
      calls.push({ sql, values });
      if (sql.includes("FROM pos_product_variant_mappings pm") && sql.includes("FOR UPDATE OF pm")) {
        return { rows: [{
          id: sourceId, posSourceId: sourceId, branchId: null, sourceProductName: "H12 CAPP", sourceProductCode: null,
          menuItemId: productId, menuItemVariantId: originalVariantId, ...state,
          reviewComment: "Original review", reviewedBy: ownerId, reviewedAt: "2026-09-25T02:00:00Z",
        }], rowCount: 1 };
      }
      if (sql.includes("SELECT m.product_scope")) {
        return { rows: options.targetValid === false ? [] : [{ productScope: "GLOBAL", originBranchId: null }], rowCount: options.targetValid === false ? 0 : 1 };
      }
      if (sql.includes("AND (status='ACTIVE' OR review_status='PENDING')")) {
        return { rows: options.duplicate ? [{ id: "66666666-6666-4666-8666-666666666666" }] : [], rowCount: options.duplicate ? 1 : 0 };
      }
      if (sql.includes("UPDATE pos_product_variant_mappings SET") && sql.includes("branch_id=$2")) {
        return { rows: [revised], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return { client, calls, revised };
}

const revisionRequest = {
  params: { id: sourceId },
  body: {
    branchId,
    sourceProductCode: "POS-CAPP-H12",
    menuItemId: productId,
    menuItemVariantId: variantId,
    revisionReason: "Corrected target",
  },
  user: { id: ownerId, role: "OWNER", branchId: null },
} as never;

describe("pending POS mapping revision", () => {
  it("copies only reviewed global mappings as inactive Pending records in one transaction", async () => {
    const targetSourceId="88888888-8888-4888-8888-888888888888";
    const calls:Array<{sql:string;values?:unknown[]}>=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{
      const sql=String(statement);calls.push({sql,values});
      if(sql.includes("FROM pos_sources")&&sql.includes("FOR UPDATE")) return {rows:[{id:sourceId,sourceCode:"LEGACY"},{id:targetSourceId,sourceCode:"TRANSACTION"}],rowCount:2};
      if(sql.includes("count(*)::int count")) return {rows:[{count:3}],rowCount:1};
      if(sql.includes("INSERT INTO pos_product_variant_mappings")) return {rows:[{id:"map-1"},{id:"map-2"}],rowCount:2};
      return {rows:[],rowCount:0};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    const res=response();
    await copyApprovedGlobalPosMappings({body:{sourcePosSourceId:sourceId,targetPosSourceId:targetSourceId},user:{id:ownerId,role:"OWNER",branchId:null}} as never,res as never,vi.fn());
    const insert=calls.find(({sql})=>sql.includes("INSERT INTO pos_product_variant_mappings"));
    expect(calls[0]?.sql).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(insert?.sql).toContain("'INACTIVE','PENDING'");
    expect(insert?.sql).toContain("original.branch_id IS NULL");
    expect(insert?.sql).toContain("original.status='ACTIVE' AND original.review_status='APPROVED'");
    expect(insert?.values).toEqual([sourceId,targetSourceId,"Copied from LEGACY — pending review"]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({success:true,data:{copied:2,skipped:1,eligible:3}});
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(),"COPY_POS_MAPPINGS","POS_SOURCE",targetSourceId,expect.any(String),expect.objectContaining({copied:2,skipped:1}),client);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("lets the Owner revise a Pending mapping and resets review metadata to Pending", async () => {
    const { client, calls, revised } = mappingClient({ status: "INACTIVE", reviewStatus: "PENDING" });
    mocks.connect.mockResolvedValue(client);
    const res = response();

    await revisePendingPosMapping(revisionRequest, res as never, vi.fn());

    const targetValidation = calls.find(({ sql }) => sql.includes("SELECT m.product_scope"));
    expect(targetValidation?.values).toEqual([variantId, productId]);
    const update = calls.find(({ sql }) => sql.includes("branch_id=$2"));
    expect(update?.values).toEqual([sourceId, branchId, "POS-CAPP-H12", variantId, "Corrected target"]);
    expect(update?.sql).toContain("review_status='PENDING'");
    expect(update?.sql).toContain("reviewed_by=NULL,reviewed_at=NULL");
    expect(revised).toMatchObject({ reviewStatus: "PENDING", status: "INACTIVE", reviewedBy: null, reviewedAt: null });
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), "REVISE_POS_MAPPING", "POS_MAPPING", sourceId,
      "Revised Pending POS mapping", expect.objectContaining({ before: expect.any(Object), after: expect.objectContaining({ reviewStatus: "PENDING" }) }), client);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("does not permit direct edits to an Approved mapping", async () => {
    const { client, calls } = mappingClient({ status: "ACTIVE", reviewStatus: "APPROVED" });
    mocks.connect.mockResolvedValue(client);
    await expect(revisePendingPosMapping(revisionRequest, response() as never, vi.fn()))
      .rejects.toMatchObject({ code: "POS_MAPPING_EDIT_LOCKED" });
    expect(calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("rejects a target variant that does not belong to the submitted product", async () => {
    const { client, calls } = mappingClient({ status: "INACTIVE", reviewStatus: "PENDING" }, { targetValid: false });
    mocks.connect.mockResolvedValue(client);
    await expect(revisePendingPosMapping(revisionRequest, response() as never, vi.fn()))
      .rejects.toMatchObject({ code: "POS_MAPPING_TARGET_INVALID" });
    expect(calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("retains duplicate active or Pending mapping protection", async () => {
    const { client, calls } = mappingClient({ status: "INACTIVE", reviewStatus: "PENDING" }, { duplicate: true });
    mocks.connect.mockResolvedValue(client);
    await expect(revisePendingPosMapping(revisionRequest, response() as never, vi.fn()))
      .rejects.toMatchObject({ code: "POS_MAPPING_CONFLICT" });
    expect(calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("prevents a new Pending mapping from duplicating an active or Pending identity", async () => {
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql=String(statement);
      if(sql.includes("SELECT m.product_scope")) return {rows:[{productScope:"GLOBAL",originBranchId:null}],rowCount:1};
      if(sql.includes("AND (status='ACTIVE' OR review_status='PENDING')")) return {rows:[{id:"66666666-6666-4666-8666-666666666666"}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    await expect(createPosMapping({body:{posSourceId:sourceId,branchId:null,sourceProductName:"H12 CAPP",sourceProductCode:null,menuItemVariantId:variantId},user:{id:ownerId,role:"OWNER",branchId:null}} as never,response() as never,vi.fn()))
      .rejects.toMatchObject({code:"POS_MAPPING_CONFLICT"});
    expect(mocks.poolQuery.mock.calls.some(([sql])=>String(sql).includes("INSERT INTO pos_product_variant_mappings"))).toBe(false);
  });

  it("deactivates an Approved mapping without erasing its review history", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const preserved = { id: sourceId, status: "INACTIVE", reviewStatus: "APPROVED", reviewedBy: ownerId, reviewedAt: "2026-09-25T02:00:00Z" };
    const client = {
      query: vi.fn(async (statement: unknown, values?: unknown[]) => {
        const sql = String(statement); calls.push({ sql, values });
        if (sql.includes("SELECT branch_id")) return { rows: [{ branchId, status: "ACTIVE", reviewStatus: "APPROVED" }], rowCount: 1 };
        if (sql.includes("UPDATE pos_product_variant_mappings")) return { rows: [preserved], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    const res = response();

    await deactivateApprovedPosMapping({ params: { id: sourceId }, user: { id: ownerId, role: "OWNER", branchId: null } } as never, res as never, vi.fn());

    expect(calls.find(({ sql }) => sql.includes("UPDATE pos_product_variant_mappings"))?.sql)
      .not.toContain("review_status=");
    expect(preserved).toMatchObject({ status: "INACTIVE", reviewStatus: "APPROVED", reviewedBy: ownerId });
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), "DEACTIVATE_POS_MAPPING", "POS_MAPPING", sourceId,
      expect.any(String), expect.objectContaining({ preservedReviewStatus: "APPROVED" }), client);
  });
});

describe("POS mapping approval UUID handling", () => {
  it("creates a Pending mapping and stores the authenticated Owner UUID and approval timestamp", async () => {
    const mappingId="77777777-7777-4777-8777-777777777777";
    mocks.poolQuery.mockImplementation(async (statement:unknown) => {
      const sql=String(statement);
      if(sql.includes("SELECT m.product_scope")) return {rows:[{productScope:"GLOBAL",originBranchId:null}],rowCount:1};
      if(sql.includes("AND (status='ACTIVE' OR review_status='PENDING')")) return {rows:[],rowCount:0};
      if(sql.includes("INSERT INTO pos_product_variant_mappings")) return {rows:[{id:mappingId}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    const createdResponse=response();
    await createPosMapping({body:{posSourceId:sourceId,branchId:null,sourceProductName:"H12 CAPP",sourceProductCode:null,menuItemVariantId:variantId},user:{id:ownerId,role:"OWNER",branchId:null}} as never,createdResponse as never,vi.fn());
    expect(createdResponse.status).toHaveBeenCalledWith(201);

    const reviewedAt="2026-09-25T05:00:00.000Z";
    const calls:Array<{sql:string;values?:unknown[]}>=[];
    const client={
      query:vi.fn(async(statement:unknown,values?:unknown[])=>{
        const sql=String(statement);calls.push({sql,values});
        if(sql.includes("FROM pos_product_variant_mappings pm JOIN pos_sources")) return {rows:[{
          branchId:null,sourceStatus:"ACTIVE",formatVerifiedAt:"2026-09-25T04:00:00.000Z",
          recipeAvailable:true,targetAvailable:true,sourceProductCode:null,
          normalizedSourceProductName:"h12 capp",posSourceId:sourceId,reviewStatus:"PENDING",
        }],rowCount:1};
        if(sql.includes("SELECT id FROM pos_product_variant_mappings WHERE id<>$1")) return {rows:[],rowCount:0};
        if(sql.includes("UPDATE pos_product_variant_mappings SET status=")) return {rows:[{
          id:mappingId,branchId:null,status:"ACTIVE",reviewStatus:"APPROVED",reviewedBy:ownerId,reviewedAt,
        }],rowCount:1};
        return {rows:[],rowCount:0};
      }),
      release:vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    const approvedResponse=response();
    await updatePosMapping({params:{id:mappingId},body:{reviewStatus:"APPROVED",reviewComment:"Recipe and target verified"},user:{id:ownerId,role:"OWNER",branchId:null}} as never,approvedResponse as never,vi.fn());

    const update=calls.find(({sql})=>sql.includes("UPDATE pos_product_variant_mappings SET status="));
    expect(update?.sql).toContain("status=$2::record_status");
    expect(update?.sql).toContain("reviewed_by=CASE WHEN $5::boolean THEN $6::uuid ELSE NULL::uuid END");
    expect(update?.sql).toContain("reviewed_at=CASE WHEN $5::boolean THEN now() ELSE NULL::timestamptz END");
    expect(update?.values).toEqual([mappingId,"ACTIVE","APPROVED","Recipe and target verified",true,ownerId]);
    expect(approvedResponse.json).toHaveBeenCalledWith({success:true,data:{
      id:mappingId,status:"ACTIVE",reviewStatus:"APPROVED",reviewedBy:ownerId,reviewedAt,
    }});
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });
});
