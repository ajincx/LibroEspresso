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

import { receivePurchaseOrder } from "./operations.controller.js";

const orderId = "00000000-0000-4000-8000-000000000041";
const branchId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
const itemId = "00000000-0000-4000-8000-000000000004";
const poItemId = "00000000-0000-4000-8000-000000000005";
const requestId = "00000000-0000-4000-8000-000000000006";
const manager = { id: userId, role: "BRANCH_MANAGER", branchId } as const;

function request(
  quantityReceived: number,
  receiptRequestId = requestId,
  receivedDate = "2026-10-01",
) {
  return {
    params: { id: orderId },
    body: {
      receiptRequestId,
      receivedDate,
      items: [{ purchaseOrderItemId: poItemId, quantityReceived }],
    },
    user: manager,
  } as never;
}

function response() {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function clientFor(options?: {
  status?: string;
  remaining?: number;
  priorReceipt?: { inventoryItemId: string; quantity: number; receivedDate: string }[];
  latestPhysicalCountDate?: string | null;
}) {
  const statements: { sql: string; values?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (statement: unknown, values?: unknown[]) => {
      const sql = String(statement);
      statements.push({ sql, values });
      if (sql.includes('FROM purchase_orders WHERE id=$1')) {
        return {
          rows: [{
            poNo: "PO-2026-00001",
            orderDate: "2026-09-30",
            isTestData: false,
            status: options?.status ?? "ORDERED",
          }],
        };
      }
      if (sql.includes('FROM purchase_order_items WHERE id=$1')) {
        return {
          rows: [{
            inventoryItemId: itemId,
            remaining: options?.remaining ?? 10,
            unitCost: 4,
            conversionFactor: 2,
          }],
        };
      }
      if (sql.includes("receipt_request_id=$3::uuid")) {
        return { rows: options?.priorReceipt ?? [] };
      }
      if (sql.includes("FROM inventory_counts")) {
        return { rows: [{ countDate: options?.latestPhysicalCountDate ?? null }] };
      }
      if (sql.includes("RETURNING updated_at")) {
        return { rows: [{ updatedAt: new Date("2026-10-01T00:00:00Z") }] };
      }
      if (sql.includes("SELECT count(*) count FROM purchase_order_items")) {
        return { rows: [{ count: "1" }] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return { client, statements };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeAudit.mockResolvedValue(undefined);
  mocks.poolQuery.mockResolvedValue({ rows: [{ id: orderId, items: [] }] });
});

describe("purchase-order receipt idempotency", () => {
  it("processes a normal partial receipt once", async () => {
    const { client, statements } = clientFor();
    mocks.connect.mockResolvedValue(client);

    await receivePurchaseOrder(request(3), response() as never, vi.fn());

    const movement = statements.find(({ sql }) => sql.includes("INSERT INTO inventory_movements"));
    expect(movement?.values).toEqual([
      branchId, itemId, 6, "2026-10-01", "PO-2026-00001", userId, false, requestId,
    ]);
    expect(statements.filter(({ sql }) => sql.includes("SET quantity_received=quantity_received+$2"))).toHaveLength(1);
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
    expect(statements.at(-1)?.sql).toBe("COMMIT");
  });

  it("accepts a receipt date after the latest physical count", async () => {
    const { client, statements } = clientFor({ latestPhysicalCountDate: "2026-09-30" });
    mocks.connect.mockResolvedValue(client);

    await receivePurchaseOrder(request(3), response() as never, vi.fn());

    expect(statements.some(({ sql }) => sql.includes("INSERT INTO inventory_movements"))).toBe(true);
    expect(statements.at(-1)?.sql).toBe("COMMIT");
  });

  it.each([
    ["equal to", "2026-10-01"],
    ["before", "2026-10-02"],
  ])("rejects a receipt date %s the latest physical count", async (_label, latestPhysicalCountDate) => {
    const { client, statements } = clientFor({ latestPhysicalCountDate });
    mocks.connect.mockResolvedValue(client);

    await expect(
      receivePurchaseOrder(request(3), response() as never, vi.fn()),
    ).rejects.toMatchObject({ status: 422, code: "PO_RECEIPT_DATE_BEFORE_LATEST_COUNT" });

    expect(statements.some(({ sql }) => sql.includes("INSERT INTO inventory_movements"))).toBe(false);
    expect(statements.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("continues to reject a receipt date before the purchase-order date", async () => {
    const { client, statements } = clientFor();
    mocks.connect.mockResolvedValue(client);

    await expect(
      receivePurchaseOrder(request(3, requestId, "2026-09-29"), response() as never, vi.fn()),
    ).rejects.toMatchObject({ status: 422, code: "PO_RECEIPT_DATE_INVALID" });

    expect(statements.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("keeps existing receipt behavior when no physical-count baseline exists", async () => {
    const { client, statements } = clientFor({ latestPhysicalCountDate: null });
    mocks.connect.mockResolvedValue(client);

    await receivePurchaseOrder(request(3), response() as never, vi.fn());

    expect(statements.some(({ sql }) => sql.includes("INSERT INTO inventory_movements"))).toBe(true);
    expect(statements.at(-1)?.sql).toBe("COMMIT");
  });

  it("treats an identical repeated request as a successful replay", async () => {
    const { client, statements } = clientFor({
      status: "RECEIVED",
      remaining: 0,
      priorReceipt: [{ inventoryItemId: itemId, quantity: 6, receivedDate: "2026-10-01" }],
    });
    mocks.connect.mockResolvedValue(client);

    await receivePurchaseOrder(request(3), response() as never, vi.fn());

    expect(statements.some(({ sql }) => sql.includes("SET quantity_received=quantity_received+$2"))).toBe(false);
    expect(statements.some(({ sql }) => sql.includes("INSERT INTO inventory_movements"))).toBe(false);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(statements.at(-1)?.sql).toBe("COMMIT");
  });

  it("accepts a different legitimate subsequent receipt request", async () => {
    const secondRequestId = "00000000-0000-4000-8000-000000000007";
    const { client, statements } = clientFor({ status: "PARTIALLY_RECEIVED", remaining: 7 });
    mocks.connect.mockResolvedValue(client);

    await receivePurchaseOrder(request(2, secondRequestId), response() as never, vi.fn());

    const movement = statements.find(({ sql }) => sql.includes("INSERT INTO inventory_movements"));
    expect(movement?.values?.at(-1)).toBe(secondRequestId);
    expect(movement?.values?.[2]).toBe(4);
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
  });

  it("continues to reject an over-receipt and rolls back", async () => {
    const { client, statements } = clientFor({ status: "PARTIALLY_RECEIVED", remaining: 2 });
    mocks.connect.mockResolvedValue(client);

    await expect(
      receivePurchaseOrder(request(3), response() as never, vi.fn()),
    ).rejects.toMatchObject({ status: 422, code: "PO_RECEIPT_EXCEEDS_ORDER" });

    expect(statements.some(({ sql }) => sql.includes("INSERT INTO inventory_movements"))).toBe(false);
    expect(statements.at(-1)?.sql).toBe("ROLLBACK");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
