import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), poolQuery: vi.fn(), writeAudit: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { connect: mocks.connect, query: mocks.poolQuery } }));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));

import { applyPurchaseOrderLifecycle, deletePosSourceConfiguration, removeInventoryItem, retireTestDataProductChain } from "./controlledDestructive.controller.js";

const itemId = "00000000-0000-4000-8000-000000000099";
const posSourceId = "00000000-0000-4000-8000-000000000088";
const testProductId = "bc8e8f7a-03c6-4e78-8aad-0258578d0798";
const testVariantId = "b6a66c00-d66a-4d07-9e2b-197964b812e4";
const testRecipeId = "18532e4d-960f-4cf2-a6df-0f086568ccd5";
const testIngredientId = "9dd929ed-0416-4bf0-9cb9-b114956f3beb";
const owner = { id: "00000000-0000-4000-8000-000000000001", role: "OWNER", branchId: null } as const;
const input = { reason: "Remove duplicate demonstration ingredient", verificationPin: "12345" };
const request = (user: unknown = owner, body: unknown = input) => ({ params: { id: itemId }, body, user }) as never;
const posSourceRequest = (user: unknown = owner, body: unknown = input) => ({ params: { id: posSourceId }, body, user }) as never;
const retirementInput = { reason: "Retire the approved UAT-only product chain", verificationPin: "12345", confirmed: true };
const retirementRequest = (user: unknown = owner, body: unknown = retirementInput) => ({ params: { id: testProductId }, body, user }) as never;
const response = () => { const res = { json: vi.fn() }; return res; };

function clientWithDependency(used: boolean) {
  const statements: string[] = [];
  const client = { query: vi.fn(async (statement: unknown) => {
    const sql = String(statement); statements.push(sql);
    if (sql.includes("FROM inventory_items WHERE")) return { rows: [{ name: "Demo Item", itemScope: "GLOBAL", originBranchId: null }] };
    if (sql.includes("SELECT EXISTS")) return { rows: [{ used }] };
    return { rows: [] };
  }), release: vi.fn() };
  return { client, statements };
}

beforeEach(() => { vi.clearAllMocks(); mocks.writeAudit.mockResolvedValue(undefined); });

describe("controlled destructive actions", () => {
  it("rejects an unauthorized role before opening a transaction", async () => {
    await expect(removeInventoryItem(request({ ...owner, role: "STAFF", branchId: "branch-1" }), response() as never, vi.fn())).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    await expect(removeInventoryItem(request(owner, { reason: "", verificationPin: "12345" }), response() as never, vi.fn())).rejects.toBeTruthy();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("rejects a wrong PIN and records the failed verification", async () => {
    await expect(removeInventoryItem(request(owner, { ...input, verificationPin: "00000" }), response() as never, vi.fn())).rejects.toMatchObject({ status: 403, code: "DESTRUCTIVE_ACTION_VERIFICATION_FAILED" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(owner, "DESTRUCTIVE_ACTION_VERIFICATION_FAILED", "INVENTORY_ITEM", itemId, expect.any(String), expect.objectContaining({ verificationResult: "FAILED" }), expect.anything());
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("deactivates a depended-on item and writes a verified audit record", async () => {
    const { client, statements } = clientWithDependency(true); mocks.connect.mockResolvedValue(client);
    const res = response();
    await removeInventoryItem(request(), res as never, vi.fn());
    expect(statements.some((sql) => sql.includes("UPDATE inventory_items SET status='INACTIVE'"))).toBe(true);
    expect(statements.some((sql) => sql.includes("DELETE FROM inventory_items"))).toBe(false);
    expect(mocks.writeAudit).toHaveBeenCalledWith(owner, "CONTROLLED_DEACTIVATED", "INVENTORY_ITEM", itemId, expect.any(String), expect.objectContaining({ verificationResult: "VERIFIED", reason: input.reason }), client);
    expect(statements).toContain("COMMIT");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: itemId, action: "DEACTIVATED" } });
  });

  it("deletes only an unused item in the same transaction", async () => {
    const { client, statements } = clientWithDependency(false); mocks.connect.mockResolvedValue(client);
    await removeInventoryItem(request(), response() as never, vi.fn());
    expect(statements.some((sql) => sql.includes("DELETE FROM inventory_items"))).toBe(true);
    expect(statements).toContain("COMMIT");
  });

  it("blocks a received-PO reversal when a later physical count depends on it", async () => {
    const statements: string[] = [];
    const client = { query: vi.fn(async (statement: unknown) => {
      const sql = String(statement); statements.push(sql);
      if (sql.includes("FROM purchase_orders WHERE")) return { rows: [{ poNo: "PO-1", branchId: "branch-1", status: "RECEIVED", isTestData: false, reversedAt: null }] };
      if (sql.includes("FROM inventory_counts")) return { rows: [{ id: "count-1" }] };
      return { rows: [] };
    }), release: vi.fn() };
    mocks.connect.mockResolvedValue(client);
    const manager = { id: owner.id, role: "BRANCH_MANAGER", branchId: "branch-1" };
    await expect(applyPurchaseOrderLifecycle(request(manager, { ...input, action: "REVERSE" }), response() as never, vi.fn())).rejects.toMatchObject({ status: 409, code: "PO_REVERSAL_COUNT_DEPENDENCY" });
    expect(statements).toContain("ROLLBACK");
    expect(statements.some((sql) => sql.includes("INSERT INTO inventory_movements"))).toBe(false);
  });
});

describe("controlled test product retirement", () => {
  const chain = {
    productId: testProductId,
    productCode: "PRD-00073",
    productName: "Test Caramel Latte",
    productStatus: "ACTIVE",
    variantId: testVariantId,
    variantName: "Standard",
    variantStatus: "ACTIVE",
    recipeId: testRecipeId,
    recipeName: "Test Caramel Latte Standard Recipe",
    recipeStatus: "ACTIVE",
    recipeVersion: 1,
    ingredientId: testIngredientId,
    ingredientSku: "ING-00073",
    ingredientStatus: "ACTIVE",
  };

  function retirementClient(dependency = 0) {
    const statements: string[] = [];
    const client = { query: vi.fn(async (statement: unknown) => {
      const sql = String(statement); statements.push(sql);
      if (sql.includes(`FROM menu_items mi`)) return { rows: [chain] };
      if (sql.includes(`SELECT branch_id FROM menu_item_branches`)) return { rows: [{ branch_id: "branch-1" }] };
      if (sql.includes(`pos_product_variant_mappings WHERE`)) return { rows: [{
        mappings: dependency,
        sales: 0,
        usage: 0,
        purchaseOrders: 0,
        startingStock: 0,
        operationalBalances: 0,
        operationalCounts: 0,
        movements: 0,
        shrinkage: 0,
        incidents: 0,
      }] };
      return { rows: [] };
    }), release: vi.fn() };
    return { client, statements };
  }

  it("allows only the Owner to retire the approved test chain", async () => {
    for (const role of ["BRANCH_MANAGER", "STAFF"] as const) {
      await expect(retireTestDataProductChain(
        retirementRequest({ ...owner, role, branchId: "branch-1" }),
        response() as never,
        vi.fn(),
      )).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    }
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before opening a transaction", async () => {
    await expect(retireTestDataProductChain(
      retirementRequest(owner, { ...retirementInput, confirmed: false }),
      response() as never,
      vi.fn(),
    )).rejects.toBeTruthy();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("retires the product, variant, and recipe atomically while preserving the ingredient and history", async () => {
    const { client, statements } = retirementClient();
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await retireTestDataProductChain(retirementRequest(), res as never, vi.fn());

    expect(statements.some((sql) => sql.includes(`UPDATE menu_items SET status='INACTIVE'`))).toBe(true);
    expect(statements.some((sql) => sql.includes(`UPDATE menu_item_variants SET status='INACTIVE'`))).toBe(true);
    expect(statements.some((sql) => sql.includes(`UPDATE recipes SET status='INACTIVE'`))).toBe(true);
    expect(statements.some((sql) => sql.includes(`UPDATE inventory_items`))).toBe(false);
    expect(statements.some((sql) => sql.includes(`DELETE FROM`))).toBe(false);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      owner,
      "TEST_DATA_PRODUCT_RETIREMENT",
      "MENU_ITEM",
      testProductId,
      expect.any(String),
      expect.objectContaining({
        variantId: testVariantId,
        recipeId: testRecipeId,
        ingredientId: testIngredientId,
        previousStatus: { product: "ACTIVE", variant: "ACTIVE", recipe: "ACTIVE", ingredient: "ACTIVE" },
        newStatus: { product: "INACTIVE", variant: "INACTIVE", recipe: "INACTIVE" },
        reason: retirementInput.reason,
      }),
      client,
    );
    expect(statements).toContain("COMMIT");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: {
      productId: testProductId,
      variantId: testVariantId,
      recipeId: testRecipeId,
      action: "TEST_DATA_PRODUCT_RETIREMENT",
    } });
  });

  it("rolls back without changing statuses when an operational dependency appears", async () => {
    const { client, statements } = retirementClient(1);
    mocks.connect.mockResolvedValue(client);
    await expect(retireTestDataProductChain(retirementRequest(), response() as never, vi.fn()))
      .rejects.toMatchObject({ status: 409, code: "TEST_PRODUCT_OPERATIONAL_DEPENDENCY" });
    expect(statements).toContain("ROLLBACK");
    expect(statements.some((sql) => sql.startsWith("UPDATE "))).toBe(false);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});

describe("deletePosSourceConfiguration", () => {
  it("rejects non-owner roles from deleting POS systems", async () => {
    const manager = { id: "00000000-0000-4000-8000-000000000002", role: "BRANCH_MANAGER", branchId: "branch-1" };
    await expect(deletePosSourceConfiguration(posSourceRequest(manager), response() as never, vi.fn())).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("blocks deletion of an active POS system", async () => {
    const client = {
      query: vi.fn(async (sql: unknown) => {
        const text = String(sql);
        if (text.includes("FROM pos_sources WHERE")) return { rows: [{ sourceCode: "ACTIVE_POS", displayName: "Active POS", supportedFormat: "CANONICAL_CSV", branchId: null, status: "ACTIVE" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    await expect(deletePosSourceConfiguration(posSourceRequest(), response() as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "POS_SOURCE_ACTIVE_CANNOT_DELETE",
    });
  });

  it("blocks deletion if historical POS imports exist", async () => {
    const client = {
      query: vi.fn(async (sql: unknown) => {
        const text = String(sql);
        if (text.includes("FROM pos_sources WHERE")) return { rows: [{ sourceCode: "INACTIVE_POS", displayName: "Inactive POS", supportedFormat: "CANONICAL_CSV", branchId: null, status: "INACTIVE" }] };
        if (text.includes("FROM pos_imports WHERE")) return { rows: [{ id: "import-1" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    await expect(deletePosSourceConfiguration(posSourceRequest(), response() as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "POS_SOURCE_HAS_IMPORTS",
    });
  });

  it("blocks deletion if recorded POS sales exist", async () => {
    const client = {
      query: vi.fn(async (sql: unknown) => {
        const text = String(sql);
        if (text.includes("FROM pos_sources WHERE")) return { rows: [{ sourceCode: "INACTIVE_POS", displayName: "Inactive POS", supportedFormat: "CANONICAL_CSV", branchId: null, status: "INACTIVE" }] };
        if (text.includes("FROM pos_imports WHERE")) return { rows: [] };
        if (text.includes("FROM pos_sale_items WHERE")) return { rows: [{ id: "sale-1" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    await expect(deletePosSourceConfiguration(posSourceRequest(), response() as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "POS_SOURCE_HAS_SALES",
    });
  });

  it("blocks deletion if active product mappings exist", async () => {
    const client = {
      query: vi.fn(async (sql: unknown) => {
        const text = String(sql);
        if (text.includes("FROM pos_sources WHERE")) return { rows: [{ sourceCode: "INACTIVE_POS", displayName: "Inactive POS", supportedFormat: "CANONICAL_CSV", branchId: null, status: "INACTIVE" }] };
        if (text.includes("FROM pos_imports WHERE")) return { rows: [] };
        if (text.includes("FROM pos_sale_items WHERE")) return { rows: [] };
        if (text.includes("FROM pos_sale_ingredient_usage")) return { rows: [] };
        if (text.includes("FROM pos_import_approvals WHERE")) return { rows: [] };
        if (text.includes("FROM pos_product_variant_mappings WHERE") && text.includes("status='ACTIVE'")) return { rows: [{ id: "map-1" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    await expect(deletePosSourceConfiguration(posSourceRequest(), response() as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "POS_SOURCE_HAS_ACTIVE_MAPPINGS",
    });
  });

  it("successfully deletes an unused inactive POS system in an atomic transaction", async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: unknown) => {
        const text = String(sql);
        statements.push(text);
        if (text.includes("FROM pos_sources WHERE")) return { rows: [{ sourceCode: "UNUSED_POS", displayName: "Unused POS", supportedFormat: "CANONICAL_CSV", branchId: null, status: "INACTIVE" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await deletePosSourceConfiguration(posSourceRequest(), res as never, vi.fn());

    expect(statements).toContain("BEGIN");
    expect(statements.some((sql) => sql.includes("DELETE FROM pos_product_variant_mappings WHERE pos_source_id=$1"))).toBe(true);
    expect(statements.some((sql) => sql.includes("DELETE FROM pos_sources WHERE id=$1"))).toBe(true);
    expect(statements).toContain("COMMIT");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      owner,
      "CONTROLLED_DELETE",
      "POS_SOURCE",
      posSourceId,
      "Deleted unused POS system configuration UNUSED_POS",
      expect.objectContaining({ verificationResult: "VERIFIED" }),
      client,
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: posSourceId, action: "DELETED" } });
  });
});

