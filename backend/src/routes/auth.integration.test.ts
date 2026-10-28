import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testUser = {
  id: "00000000-0000-4000-8000-000000000001",
  branch_id: "00000000-0000-4000-8000-000000000002",
  first_name: "Maria",
  last_name: "Santos",
  email: "manager@libro.com",
  username: "libro.manager",
  phone_number: null,
  position: "Branch Manager",
  password_hash: "stored-bcrypt-hash",
  role: "BRANCH_MANAGER" as const,
  status: "ACTIVE",
  branch_code: "LPA",
  branch_name: "Lipa",
  failed_login_attempts: 0,
  locked_until: null,
};

const mocks = vi.hoisted(() => ({
  selectedUser: null as typeof testUser | null,
  passwordMatches: false,
  queries: [] as Array<{ sql: string; values?: unknown[] }>,
  compare: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: mocks.compare,
    hash: vi.fn(),
  },
}));

vi.mock("../config/database.js", () => ({
  pool: {
    connect: mocks.connect,
    query: vi.fn(),
  },
}));

let app: Awaited<typeof import("../app.js")>["app"];

function clientForLogin() {
  return {
    query: vi.fn(async (statement: unknown, values?: unknown[]) => {
      const sql = String(statement);
      mocks.queries.push({ sql, values });
      if (sql.includes("FROM users u") && sql.includes("FOR UPDATE")) {
        return { rows: mocks.selectedUser ? [mocks.selectedUser] : [] };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
}

function expectSerializedError(
  response: request.Response,
  status: number,
  code: string,
  message: string,
) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({
    success: false,
    error: {
      code,
      message,
      requestId: expect.any(String),
    },
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
  ({ app } = await import("../app.js"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
  mocks.selectedUser = null;
  mocks.passwordMatches = false;
  mocks.connect.mockImplementation(async () => clientForLogin());
  mocks.compare.mockImplementation(async () => mocks.passwordMatches);
});

describe("POST /api/auth/login response contract", () => {
  it("returns HTTP 400 for malformed JSON before authentication runs", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{identifier:manager@libro.com,password:correct-password}");

    expectSerializedError(
      response,
      400,
      "INVALID_JSON",
      "Request body contains invalid JSON",
    );
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("serializes the same generic response for an unknown email and a wrong password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "unknown@example.com", password: "arbitrary-password" });

    expectSerializedError(
      response,
      401,
      "INVALID_CREDENTIALS",
      "Unable to sign in with those credentials.",
    );
    expect(mocks.compare).toHaveBeenCalledWith(
      "arbitrary-password",
      expect.any(String),
    );
    expect(mocks.queries.some(({ values }) => values?.[2] === "LOGIN_FAILED")).toBe(true);
  });

  it("does not expose a different response for an existing account with the wrong password", async () => {
    mocks.selectedUser = testUser;
    const response = await request(app)
      .post("/api/auth/login")
      .send({ identifier: testUser.email, password: "wrong-password" });

    expectSerializedError(
      response,
      401,
      "INVALID_CREDENTIALS",
      "Unable to sign in with those credentials.",
    );
    expect(mocks.queries.some(({ sql }) => sql.includes("failed_login_attempts=$2"))).toBe(true);
    expect(mocks.queries.some(({ values }) => values?.[2] === "LOGIN_FAILED")).toBe(true);
  });

  it("keeps unknown-user and wrong-password public response contracts identical", async () => {
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "missing@example.com", password: "wrong-password" });
    mocks.selectedUser = testUser;
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ identifier: testUser.email, password: "wrong-password" });

    const publicContract = (response: request.Response) => ({
      status: response.status,
      success: response.body.success,
      code: response.body.error?.code,
      message: response.body.error?.message,
    });
    expect(publicContract(unknown)).toEqual(publicContract(wrongPassword));
  });

  it("serializes ACCOUNT_INACTIVE with the existing inactive-account message", async () => {
    mocks.selectedUser = { ...testUser, status: "INACTIVE" };
    mocks.passwordMatches = true;
    const response = await request(app)
      .post("/api/auth/login")
      .send({ identifier: testUser.email, password: "correct-password" });

    expectSerializedError(
      response,
      403,
      "ACCOUNT_INACTIVE",
      "This account is inactive. Please contact your administrator.",
    );
    expect(mocks.queries.some(({ values }) => values?.[2] === "LOGIN_FAILED")).toBe(true);
  });

  it("preserves successful login and session-cookie behavior", async () => {
    mocks.selectedUser = testUser;
    mocks.passwordMatches = true;
    const response = await request(app)
      .post("/api/auth/login")
      .send({ identifier: testUser.email, password: "correct-password" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { user: { id: testUser.id, email: testUser.email } },
    });
    expect(response.headers["set-cookie"]?.[0]).toContain("libro_session=");
    expect(mocks.queries.some(({ sql }) => sql.includes("INSERT INTO auth_sessions"))).toBe(true);
    expect(mocks.queries.some(({ values }) => values?.[2] === "LOGIN_SUCCESS")).toBe(true);
  });
});
