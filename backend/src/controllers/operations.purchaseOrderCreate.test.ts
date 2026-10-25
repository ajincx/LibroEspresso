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
vi.mock("../services/businessTime.service.js", () => ({ manilaBusinessDate: () => "2026-10-25" }));

import { createPurchaseOrder } from "./operations.controller.js";

const branchId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const inventoryItemId = "33333333-3333-4333-8333-333333333333";

const request = (status: "DRAFT" | "ORDERED" = "ORDERED", orderDate = "2026-10-25") => ({
  body: {
    supplierName: "Libro Supplier",
    orderDate,
    expectedDeliveryDate: "2026-10-27",
    status,
    items: [{ inventoryItemId, quantityOrdered: 10, unitCost: 5, purchaseUom: "kg", conversionFactor: 1000 }],
  },
  user: { id: userId, role: "BRANCH_MANAGER", branchId },
});

function response() {
  const value = { status: vi.fn(), json: vi.fn() };
  value.status.mockReturnValue(value);
  return value;
}

function transactionClient(hasQualifyingFull: boolean) {
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (statement: unknown, values?: unknown[]) => {
      const sql = String(statement);
      statements.push({ sql, values });
      if (sql.includes("SELECT ic.id FROM inventory_counts")) {
        return { rows: hasQualifyingFull ? [{ id: "full-count-1" }] : [] };
      }
      if (sql.includes("SELECT id,unit FROM inventory_items")) return { rows: [{ id: inventoryItemId, unit: "g" }] };
      if (sql.includes("nextval('purchase_order_number_seq')")) return { rows: [{ poNo: "PO-2026-00001" }] };
      if (sql.includes("INSERT INTO purchase_orders")) return { rows: [{ id: "purchase-order-1" }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return { client, statements };
}

describe("purchase-order Full Physical Count prerequisite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: "purchase-order-1", items: [] }] });
  });

  it("rejects backdated or future order dates before opening a transaction", async () => {
    await expect(createPurchaseOrder(request("DRAFT", "2026-10-24") as never, response() as never, vi.fn()))
      .rejects.toMatchObject({ status: 422, code: "PO_ORDER_DATE_CURRENT_REQUIRED" });
    await expect(createPurchaseOrder(request("ORDERED", "2026-10-26") as never, response() as never, vi.fn()))
      .rejects.toMatchObject({ status: 422, code: "PO_ORDER_DATE_CURRENT_REQUIRED" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("does not allow Opening or Closing alone to satisfy the prerequisite", async () => {
    const { client, statements } = transactionClient(false);
    mocks.connect.mockResolvedValue(client);

    await expect(createPurchaseOrder(request() as never, response() as never, vi.fn()))
      .rejects.toMatchObject({ status: 409, code: "PHYSICAL_COUNT_REQUIRED" });

    const guard = statements.find(({ sql }) => sql.includes("SELECT ic.id FROM inventory_counts"));
    expect(guard?.sql).toContain("ic.count_type='FULL'");
    expect(guard?.sql).toContain("invalid_item.voided_at IS NOT NULL");
    expect(guard?.values).toEqual([branchId, "2026-10-25"]);
    expect(statements.some(({ sql }) => sql.includes("INSERT INTO purchase_orders"))).toBe(false);
    expect(statements.at(-1)?.sql).toBe("ROLLBACK");
  });

  it.each(["DRAFT", "ORDERED"] as const)("allows a same-day valid Full Count for a %s PO", async (status) => {
    const { client, statements } = transactionClient(true);
    mocks.connect.mockResolvedValue(client);

    await createPurchaseOrder(request(status) as never, response() as never, vi.fn());

    expect(statements.some(({ sql }) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(statements.find(({ sql }) => sql.includes("INSERT INTO purchase_orders"))?.values?.[6]).toBe(status);
    expect(statements.at(-1)?.sql).toBe("COMMIT");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ id: userId, branchId }),
      "CREATE_PURCHASE_ORDER",
      "PURCHASE_ORDER",
      "purchase-order-1",
      "Created PO-2026-00001",
      { branchId, status },
      client,
    );
  });
});
