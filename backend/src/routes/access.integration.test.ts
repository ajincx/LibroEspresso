import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

const secret = "test-secret-that-is-at-least-32-characters";
let app: Awaited<typeof import("../app.js")>["app"];

vi.mock("../services/auth.service.js", async () => {
  const jwtModule = await import("jsonwebtoken");
  return {
    validateSessionToken: async (token: string) => jwtModule.default.verify(token, "test-secret-that-is-at-least-32-characters"),
    authenticateCredentials: vi.fn(),
    findCurrentUser: vi.fn(),
    revokeSessionToken: vi.fn(),
    revokeAllUserSessions: vi.fn(),
    signSession: vi.fn(),
  };
});

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.JWT_SECRET = secret;
  ({ app } = await import("../app.js"));
});

const session = (payload: object) =>
  `libro_session=${jwt.sign(payload, secret, { expiresIn: "5m" })}`;

describe("access controls", () => {
  it("rejects unauthenticated API access", async () => {
    const response = await request(app).get("/api/access/owner-check");
    expect(response.status).toBe(401);
  });

  it("allows an Owner through an Owner-only endpoint", async () => {
    const response = await request(app)
      .get("/api/access/owner-check")
      .set("Cookie", session({ id: "owner", role: "OWNER", branchId: null }));
    expect(response.status).toBe(200);
  });

  it("returns 403 when a Manager requests an Owner endpoint", async () => {
    const response = await request(app)
      .get("/api/access/owner-check")
      .set(
        "Cookie",
        session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }),
      );
    expect(response.status).toBe(403);
  });

  it("cannot be tricked into another branch through the query string", async () => {
    const response = await request(app)
      .get("/api/access/branch-scope?branchId=vermosa")
      .set(
        "Cookie",
        session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }),
      );
    expect(response.status).toBe(200);
    expect(response.body.data.branchId).toBe("lipa");
  });

  it("blocks a Manager from User Management APIs", async () => {
    const response = await request(app)
      .get("/api/users")
      .set(
        "Cookie",
        session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }),
      );
    expect(response.status).toBe(403);
  });

  it("allows Manager branch ingredient creation while validating the submitted fields", async () => {
    const response = await request(app)
      .post("/api/inventory-items")
      .set(
        "Cookie",
        session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }),
      )
      .send({});
    expect(response.status).toBe(422);
  });

  it("keeps branch inventory settings writable by Managers but read-only for the Owner", async () => {
    const path =
      "/api/inventory-overview/00000000-0000-0000-0000-000000000001/settings";
    const manager = await request(app)
      .patch(path)
      .set(
        "Cookie",
        session({
          id: "manager",
          role: "BRANCH_MANAGER",
          branchId: "00000000-0000-0000-0000-000000000002",
        }),
      )
      .send({});
    const owner = await request(app)
      .patch(path)
      .set("Cookie", session({ id: "owner", role: "OWNER", branchId: null }))
      .send({});
    expect(manager.status).toBe(422);
    expect(owner.status).toBe(403);
  });

  it("allows an Owner into global product creation validation", async () => {
    const response = await request(app)
      .post("/api/menu-items/with-recipe")
      .set("Cookie", session({ id: "owner", role: "OWNER", branchId: null }))
      .send({});
    expect(response.status).toBe(422);
  });

  it("allows a Manager through product-management authorization", async () => {
    const response = await request(app)
      .post("/api/menu-items/with-recipe")
      .set(
        "Cookie",
        session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }),
      )
      .send({});
    expect(response.status).toBe(422);
  });

  it("allows only Managers into branch product status validation", async () => {
    const productId = "00000000-0000-0000-0000-000000000001";
    const ownerCookie = session({ id: "owner", role: "OWNER", branchId: null });
    const managerCookie = session({
      id: "manager",
      role: "BRANCH_MANAGER",
      branchId: "00000000-0000-0000-0000-000000000002",
    });
    const [invalidOwnerStatus, invalidManagerStatus] = await Promise.all([
      request(app)
        .patch(`/api/menu-items/${productId}/status`)
        .set("Cookie", ownerCookie)
        .send({ status: "REMOVED" }),
      request(app)
        .patch(`/api/menu-items/${productId}/status`)
        .set("Cookie", managerCookie)
        .send({ status: "REMOVED" }),
    ]);
    expect([invalidOwnerStatus.status, invalidManagerStatus.status]).toEqual([
      403, 422,
    ]);
  });

  it("enforces the correct reviewer for each product proposal", async () => {
    const productId = "00000000-0000-0000-0000-000000000001";
    const ownerCookie = session({ id: "owner", role: "OWNER", branchId: null });
    const managerCookie = session({
      id: "manager",
      role: "BRANCH_MANAGER",
      branchId: "00000000-0000-0000-0000-000000000002",
    });
    const [
      managerOnOwnerReview,
      ownerOnBranchReview,
      invalidOwnerReview,
      invalidManagerReview,
    ] = await Promise.all([
      request(app)
        .post(`/api/menu-items/${productId}/owner-review`)
        .set("Cookie", managerCookie)
        .send({ decision: "APPROVE" }),
      request(app)
        .post(`/api/menu-items/${productId}/branch-review`)
        .set("Cookie", ownerCookie)
        .send({ decision: "APPROVE" }),
      request(app)
        .post(`/api/menu-items/${productId}/owner-review`)
        .set("Cookie", ownerCookie)
        .send({ decision: "WAIT" }),
      request(app)
        .post(`/api/menu-items/${productId}/branch-review`)
        .set("Cookie", managerCookie)
        .send({ decision: "WAIT" }),
    ]);
    expect([
      managerOnOwnerReview.status,
      ownerOnBranchReview.status,
      invalidOwnerReview.status,
      invalidManagerReview.status,
    ]).toEqual([403, 403, 422, 422]);
  });

  it("does not expose legacy product-only or recipe-only write paths", async () => {
    const cookie = session({
      id: "manager",
      role: "BRANCH_MANAGER",
      branchId: "lipa",
    });
    const productOnly = await request(app)
      .post("/api/menu-items")
      .set("Cookie", cookie)
      .send({});
    const recipeOnly = await request(app)
      .post("/api/recipes")
      .set("Cookie", cookie)
      .send({});
    expect(productOnly.status).toBe(404);
    expect(recipeOnly.status).toBe(404);
  });

  it("blocks a Manager from managing menu categories", async () => {
    const response = await request(app)
      .post("/api/menu-categories")
      .set(
        "Cookie",
        session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }),
      )
      .send({});
    expect(response.status).toBe(403);
  });

  it("blocks an Owner from importing branch POS sales", async () => {
    const cookie = session({ id: "owner", role: "OWNER", branchId: null });
    const responses = await Promise.all([
      request(app).post("/api/pos-sales/preview").set("Cookie", cookie).send({}),
      request(app).post("/api/pos-sales/import").set("Cookie", cookie).send({}),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403]);
  });

  it("allows only an authenticated Branch Manager into POS preview validation", async () => {
    const cookie = session({
      id: "manager",
      role: "BRANCH_MANAGER",
      branchId: "00000000-0000-0000-0000-000000000002",
    });
    const responses = await Promise.all([
      request(app).post("/api/pos-sales/preview").set("Cookie", cookie).send({}),
      request(app).post("/api/pos-sales/import").set("Cookie", cookie).send({}),
      request(app).post("/api/pos-sales/preview").send({}),
      request(app).post("/api/pos-sales/import").send({}),
    ]);
    expect(responses.map((response) => response.status)).toEqual([422, 422, 401, 401]);
  });

  it("does not expose manual shrinkage-report creation", async () => {
    const response = await request(app)
      .post("/api/shrinkage-reports")
      .set(
        "Cookie",
        session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }),
      )
      .send({});
    expect(response.status).toBe(404);
  });

  it("blocks an Owner from submitting Manager investigation findings", async () => {
    const response = await request(app)
      .patch(
        "/api/shrinkage-reports/00000000-0000-0000-0000-000000000001/investigation",
      )
      .set("Cookie", session({ id: "owner", role: "OWNER", branchId: null }))
      .send({});
    expect(response.status).toBe(403);
  });

  it("blocks a Manager from reviewing a shrinkage report", async () => {
    const response = await request(app)
      .post(
        "/api/shrinkage-reports/00000000-0000-0000-0000-000000000001/review",
      )
      .set(
        "Cookie",
        session({
          id: "manager",
          role: "BRANCH_MANAGER",
          branchId: "00000000-0000-0000-0000-000000000002",
        }),
      )
      .send({});
    expect(response.status).toBe(403);
  });

  it("keeps Purchase Orders read-only for the Owner", async () => {
    const response = await request(app)
      .post("/api/purchase-orders")
      .set("Cookie", session({ id: "owner", role: "OWNER", branchId: null }))
      .send({});
    expect(response.status).toBe(403);
  });

  it("allows a Manager into Purchase Order validation", async () => {
    const response = await request(app)
      .post("/api/purchase-orders")
      .set(
        "Cookie",
        session({
          id: "manager",
          role: "BRANCH_MANAGER",
          branchId: "00000000-0000-0000-0000-000000000002",
        }),
      )
      .send({});
    expect(response.status).toBe(422);
  });

  it("blocks an Owner from submitting operational incidents", async () => {
    const response = await request(app)
      .post("/api/incidents")
      .set("Cookie", session({ id: "owner", role: "OWNER", branchId: null }))
      .send({});
    expect(response.status).toBe(403);
  });

  it("blocks Staff from management and inventory data APIs", async () => {
    const cookie = session({
      id: "staff",
      role: "STAFF",
      branchId: "00000000-0000-0000-0000-000000000002",
    });
    const responses = await Promise.all([
      request(app).get("/api/users").set("Cookie", cookie),
      request(app).get("/api/inventory-overview").set("Cookie", cookie),
      request(app).get("/api/purchase-orders").set("Cookie", cookie),
      request(app)
        .get("/api/purchase-orders/00000000-0000-0000-0000-000000000001")
        .set("Cookie", cookie),
      request(app).get("/api/inventory-items").set("Cookie", cookie),
      request(app).get("/api/pos-sales").set("Cookie", cookie),
      request(app).post("/api/pos-sales/preview").set("Cookie", cookie).send({}),
      request(app).post("/api/pos-sales/import").set("Cookie", cookie).send({}),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 403, 403, 403, 403,
    ]);
  });

  it("allows only management roles to request validated predictive forecasts", async () => {
    const path = "/api/predictive-analytics/generate";
    const owner = await request(app)
      .post(path)
      .set("Cookie", session({ id: "owner", role: "OWNER", branchId: null }))
      .send({});
    const manager = await request(app)
      .post(path)
      .set(
        "Cookie",
        session({
          id: "manager",
          role: "BRANCH_MANAGER",
          branchId: "00000000-0000-0000-0000-000000000002",
        }),
      )
      .send({});
    const staff = await request(app)
      .post(path)
      .set(
        "Cookie",
        session({
          id: "staff",
          role: "STAFF",
          branchId: "00000000-0000-0000-0000-000000000002",
        }),
      )
      .send({});
    expect([owner.status, manager.status, staff.status]).toEqual([
      422, 422, 403,
    ]);
  });

  it("does not expose the removed standalone management-analytics endpoint", async () => {
    const path = "/api/management-analytics";
    const [owner, manager, staff, anonymous] = await Promise.all([
      request(app).get(path).set("Cookie", session({ id: "owner", role: "OWNER", branchId: null })),
      request(app).get(path).set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "00000000-0000-0000-0000-000000000002" })),
      request(app).get(path).set("Cookie", session({ id: "staff", role: "STAFF", branchId: "00000000-0000-0000-0000-000000000002" })),
      request(app).get(path),
    ]);
    expect([owner.status, manager.status, staff.status, anonymous.status]).toEqual([404, 404, 404, 404]);
  });

  it("protects report preview and export endpoints by management role", async () => {
    const paths=["/api/reports/preview","/api/reports/export/pdf","/api/reports/export/xlsx"];
    const ownerCookie=session({id:"owner",role:"OWNER",branchId:null});
    const managerCookie=session({id:"manager",role:"BRANCH_MANAGER",branchId:"00000000-0000-0000-0000-000000000002"});
    const staffCookie=session({id:"staff",role:"STAFF",branchId:"00000000-0000-0000-0000-000000000002"});
    for(const path of paths){const [owner,manager,staff,anonymous]=await Promise.all([request(app).post(path).set("Cookie",ownerCookie).send({}),request(app).post(path).set("Cookie",managerCookie).send({}),request(app).post(path).set("Cookie",staffCookie).send({}),request(app).post(path).send({})]);expect([owner.status,manager.status,staff.status,anonymous.status]).toEqual([422,422,403,401]);}
  });

  it("allows Staff into incident submission validation", async () => {
    const response = await request(app)
      .post("/api/incidents")
      .set(
        "Cookie",
        session({
          id: "staff",
          role: "STAFF",
          branchId: "00000000-0000-0000-0000-000000000002",
        }),
      )
      .send({});
    expect(response.status).toBe(422);
  });

  it("blocks Staff from final classification and incident-evidence linking endpoints", async () => {
    const cookie = session({
      id: "staff",
      role: "STAFF",
      branchId: "00000000-0000-0000-0000-000000000002",
    });
    const id = "00000000-0000-0000-0000-000000000001";
    const [classification, linking] = await Promise.all([
      request(app).patch(`/api/shrinkage-reports/${id}/investigation`).set("Cookie", cookie).send({}),
      request(app).patch(`/api/incidents/${id}/link`).set("Cookie", cookie).send({ shrinkageReportId: id }),
    ]);
    expect([classification.status, linking.status]).toEqual([403, 403]);
  });

  it("does not let Staff link an incident during submission", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const response = await request(app)
      .post("/api/incidents")
      .set("Cookie", session({ id: "staff", role: "STAFF", branchId: "00000000-0000-4000-8000-000000000002" }))
      .send({ inventoryItemId: id, shrinkageReportId: id, incidentType: "SPOILAGE", quantity: 1, occurredAt: "2026-09-09T08:00:00.000Z", reason: "Observed during operations" });
    expect(response.status).toBe(403);
  });
});
