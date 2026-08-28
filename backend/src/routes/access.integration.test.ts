import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

const secret = "test-secret-that-is-at-least-32-characters";
let app: Awaited<typeof import("../app.js")>["app"];

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.JWT_SECRET = secret;
  ({ app } = await import("../app.js"));
});

const session = (payload: object) => `libro_session=${jwt.sign(payload, secret, { expiresIn: "5m" })}`;

describe("access controls", () => {
  it("rejects unauthenticated API access", async () => {
    const response = await request(app).get("/api/access/owner-check");
    expect(response.status).toBe(401);
  });

  it("allows an Owner through an Owner-only endpoint", async () => {
    const response = await request(app).get("/api/access/owner-check").set("Cookie", session({ id: "owner", role: "OWNER", branchId: null }));
    expect(response.status).toBe(200);
  });

  it("returns 403 when a Manager requests an Owner endpoint", async () => {
    const response = await request(app).get("/api/access/owner-check").set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }));
    expect(response.status).toBe(403);
  });

  it("cannot be tricked into another branch through the query string", async () => {
    const response = await request(app).get("/api/access/branch-scope?branchId=vermosa").set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }));
    expect(response.status).toBe(200);
    expect(response.body.data.branchId).toBe("lipa");
  });

  it("blocks a Manager from User Management APIs", async () => {
    const response = await request(app).get("/api/users").set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" }));
    expect(response.status).toBe(403);
  });

  it("blocks a Manager from modifying global inventory definitions", async () => {
    const response = await request(app).post("/api/inventory-items").set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" })).send({});
    expect(response.status).toBe(403);
  });

  it("blocks an Owner from creating menu products and recipes", async () => {
    const response = await request(app).post("/api/menu-items/with-recipe").set("Cookie", session({ id: "owner", role: "OWNER", branchId: null })).send({});
    expect(response.status).toBe(403);
  });

  it("allows a Manager through product-management authorization", async () => {
    const response = await request(app).post("/api/menu-items/with-recipe").set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" })).send({});
    expect(response.status).toBe(422);
  });

  it("does not expose legacy product-only or recipe-only write paths", async () => {
    const cookie = session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" });
    const productOnly = await request(app).post("/api/menu-items").set("Cookie", cookie).send({});
    const recipeOnly = await request(app).post("/api/recipes").set("Cookie", cookie).send({});
    expect(productOnly.status).toBe(404);
    expect(recipeOnly.status).toBe(404);
  });

  it("blocks a Manager from managing menu categories", async () => {
    const response = await request(app).post("/api/menu-categories").set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" })).send({});
    expect(response.status).toBe(403);
  });

  it("blocks an Owner from importing branch POS sales", async () => {
    const response = await request(app).post("/api/pos-sales/import").set("Cookie", session({ id: "owner", role: "OWNER", branchId: null })).send({});
    expect(response.status).toBe(403);
  });

  it("does not expose manual shrinkage-report creation", async () => {
    const response = await request(app).post("/api/shrinkage-reports").set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "lipa" })).send({});
    expect(response.status).toBe(404);
  });

  it("blocks an Owner from submitting Manager investigation findings", async () => {
    const response = await request(app).patch("/api/shrinkage-reports/00000000-0000-0000-0000-000000000001/investigation").set("Cookie", session({ id: "owner", role: "OWNER", branchId: null })).send({});
    expect(response.status).toBe(403);
  });

  it("blocks a Manager from reviewing a shrinkage report", async () => {
    const response = await request(app).post("/api/shrinkage-reports/00000000-0000-0000-0000-000000000001/review").set("Cookie", session({ id: "manager", role: "BRANCH_MANAGER", branchId: "00000000-0000-0000-0000-000000000002" })).send({});
    expect(response.status).toBe(403);
  });
});
