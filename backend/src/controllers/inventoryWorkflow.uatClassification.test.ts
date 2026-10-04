import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn(),
  verify: vi.fn(),
  writeControlledAudit: vi.fn(),
  env: { DATA_LIFECYCLE_ENV: "DEVELOPMENT" as "DEVELOPMENT" | "UAT" | "PRODUCTION" },
}));

vi.mock("../config/database.js", () => ({ pool: { connect: mocks.connect, query: mocks.poolQuery } }));
vi.mock("../config/env.js", () => ({ env: mocks.env }));
vi.mock("../services/destructiveAction.service.js", () => ({
  verifyDestructiveAction: mocks.verify,
  writeDestructiveActionAudit: mocks.writeControlledAudit,
}));

import {
  classifyInventoryCountAsTestData,
  listUatInventoryCounts,
} from "./inventoryWorkflow.controller.js";

const gulodId = "b50d405c-3c4a-4579-a3e8-7644d8324df6";
const countId = "9c084a0a-2283-4d4a-b333-b985a3126ff3";
const itemRows = Array.from({ length: 78 }, (_, index) => ({
  inventoryItemId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  actualQuantity: index < 41 ? 50000 : index,
}));
const balanceRows = itemRows.map((item) => ({
  ...item,
  asOfDate: "2026-10-02",
  isTestData: false,
}));

function request(role = "OWNER", body: Record<string, unknown> = {}) {
  return {
    params: { id: countId },
    query: {},
    body: { reason: "Known UAT placeholder count", verificationPin: "12345", confirmed: true, ...body },
    user: { id: "owner-1", role, branchId: role === "OWNER" ? null : gulodId },
  } as never;
}

function response() {
  return { json: vi.fn() };
}

function successfulClient() {
  const statements: string[] = [];
  const query = vi.fn(async (statement: unknown) => {
    const sql = String(statement);
    statements.push(sql);
    if (sql.includes("FROM inventory_counts ic JOIN branches")) return { rows: [{ countNo: "IC-2026-00009", branchId: gulodId, branchName: "Gulod / Main Branch", countDate: "2026-10-02", isTestData: false }] };
    if (sql.includes("FROM inventory_count_items WHERE")) return { rows: itemRows };
    if (sql.includes("FROM shrinkage_reports sr JOIN")) return { rows: [{ id: "report-6", reportNo: "SR-2026-00006", status: "REVIEWED", isTestData: false }] };
    if (sql.includes("FROM branch_inventory_balances")) return { rows: balanceRows };
    if (sql.includes("UPDATE branch_inventory_balances")) return { rows: [], rowCount: 78 };
    if (sql.includes("UPDATE inventory_counts")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  return { query, release: vi.fn(), statements };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.DATA_LIFECYCLE_ENV = "DEVELOPMENT";
  mocks.verify.mockResolvedValue(undefined);
  mocks.writeControlledAudit.mockResolvedValue(undefined);
});

describe("controlled UAT physical-count classification", () => {
  it("classifies the allowlisted count, exact balance rows, and linked shrinkage atomically", async () => {
    const client = successfulClient();
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await classifyInventoryCountAsTestData(request(), res as never, vi.fn());
    expect(client.statements[0]).toBe("BEGIN");
    expect(client.statements.some((sql) => sql.includes("FOR UPDATE OF ic"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("ORDER BY inventory_item_id FOR UPDATE"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("UPDATE branch_inventory_balances SET is_test_data=true"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("UPDATE shrinkage_reports SET is_test_data=true"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("UPDATE inventory_counts SET is_test_data=true"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
    expect(mocks.writeControlledAudit).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("classifies IC-2026-00006 and its linked report without touching current balance rows", async () => {
    const olderCountId = "87bcecb9-d0f5-4af6-8922-8c0fd9ee6243";
    const statements: string[] = [];
    const client = {
      release: vi.fn(),
      query: vi.fn(async (statement: unknown) => {
        const sql = String(statement); statements.push(sql);
        if (sql.includes("FROM inventory_counts ic JOIN branches")) return { rows: [{ countNo: "IC-2026-00006", branchId: gulodId, branchName: "Gulod / Main Branch", countDate: "2026-10-01", isTestData: false }] };
        if (sql.includes("FROM inventory_count_items WHERE")) return { rows: itemRows.slice(0, 77) };
        if (sql.includes("FROM shrinkage_reports sr JOIN")) return { rows: [{ id: "report-5", reportNo: "SR-2026-00005", status: "REVIEWED", isTestData: false }] };
        if (sql.includes("UPDATE inventory_counts")) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    };
    mocks.connect.mockResolvedValue(client);
    const req = request() as { params: { id: string } };
    req.params.id = olderCountId;
    await classifyInventoryCountAsTestData(req as never, response() as never, vi.fn());
    expect(statements.some((sql) => sql.includes("UPDATE branch_inventory_balances"))).toBe(false);
    expect(statements.some((sql) => sql.includes("UPDATE shrinkage_reports SET is_test_data=true") && !sql.includes("status="))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("rejects non-Owners even when invoked outside route middleware", async () => {
    await expect(classifyInventoryCountAsTestData(request("BRANCH_MANAGER"), response() as never, vi.fn())).rejects.toMatchObject({ status: 403 });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("is unavailable in production", async () => {
    mocks.env.DATA_LIFECYCLE_ENV = "PRODUCTION";
    await expect(classifyInventoryCountAsTestData(request(), response() as never, vi.fn())).rejects.toMatchObject({ code: "INVENTORY_COUNT_TEST_CLASSIFICATION_DISABLED" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("requires a meaningful reason and explicit confirmation", async () => {
    await expect(classifyInventoryCountAsTestData(request("OWNER", { reason: "short" }), response() as never, vi.fn())).rejects.toBeTruthy();
    await expect(classifyInventoryCountAsTestData(request("OWNER", { confirmed: false }), response() as never, vi.fn())).rejects.toBeTruthy();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("rolls back without classification when an exact balance dependency changes", async () => {
    const client = successfulClient();
    client.query.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      client.statements.push(sql);
      if (sql.includes("FROM inventory_counts ic JOIN branches")) return { rows: [{ countNo: "IC-2026-00009", branchId: gulodId, branchName: "Gulod / Main Branch", countDate: "2026-10-02", isTestData: false }] };
      if (sql.includes("FROM inventory_count_items WHERE")) return { rows: itemRows };
      if (sql.includes("FROM shrinkage_reports sr JOIN")) return { rows: [{ id: "report-6", reportNo: "SR-2026-00006", status: "REVIEWED", isTestData: false }] };
      if (sql.includes("FROM branch_inventory_balances")) return { rows: balanceRows.slice(0, 77) };
      return { rows: [] };
    });
    mocks.connect.mockResolvedValue(client);
    await expect(classifyInventoryCountAsTestData(request(), response() as never, vi.fn())).rejects.toMatchObject({ code: "INVENTORY_COUNT_TEST_BALANCE_MISMATCH" });
    expect(client.statements).toContain("ROLLBACK");
    expect(client.statements.some((sql) => sql.includes("UPDATE inventory_counts SET is_test_data=true"))).toBe(false);
    expect(mocks.writeControlledAudit).not.toHaveBeenCalled();
  });

  it("lists preserved test counts only through the Owner UAT history query", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: countId, countNo: "IC-2026-00009", __total: 1 }] });
    const res = response();
    await listUatInventoryCounts({ query: {}, user: { id: "owner-1", role: "OWNER", branchId: null } } as never, res as never, vi.fn());
    expect(String(mocks.poolQuery.mock.calls[0]?.[0])).toContain("WHERE ic.is_test_data");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
