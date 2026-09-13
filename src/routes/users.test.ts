import { test, expect, describe, beforeAll } from "bun:test";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";

import { json, post, get, reqWithParams } from "../../src/test-utils/helpers";
import { applyTestSchema } from "../../src/db/database";
import { listUsers, getUser, createUser } from "../../src/routes/users";
import type { ApiResponse, User } from "../../src/types";

beforeAll(() => applyTestSchema());

// ─── POST /users ──────────────────────────────────────────────────────────────

describe("POST /users", () => {
  test("creates a user with valid payload", async () => {
    const res  = await createUser(post("/api/v1/users", { email: "alice@example.com", name: "Alice" }));
    expect(res.status).toBe(201);
    const { data } = await json<ApiResponse<User>>(res);
    expect(data!.id).toBeString();
    expect(data!.email).toBe("alice@example.com");
    expect(data!.name).toBe("Alice");
    expect(data!.createdAt).toBeString();
  });

  test("rejects missing email", async () => {
    const res  = await createUser(post("/api/v1/users", { name: "No Email" }));
    expect(res.status).toBe(422);
    const { error } = await json<ApiResponse>(res);
    expect(error).toContain("email");
  });

  test("rejects invalid email format", async () => {
    const res = await createUser(post("/api/v1/users", { email: "not-an-email", name: "Bad" }));
    expect(res.status).toBe(422);
  });

  test("rejects duplicate email with 409", async () => {
    const payload = { email: "duplicate@example.com", name: "First" };
    await createUser(post("/api/v1/users", payload));
    const res = await createUser(post("/api/v1/users", { ...payload, name: "Second" }));
    expect(res.status).toBe(409);
  });

  test("rejects missing JSON body", async () => {
    const req = new Request("http://localhost/api/v1/users", { method: "POST" });
    const res = await createUser(req);
    expect(res.status).toBe(400);
  });
});

// ─── GET /users ───────────────────────────────────────────────────────────────

describe("GET /users", () => {
  test("returns list of users", async () => {
    await createUser(post("/api/v1/users", { email: "list-test@example.com", name: "Listed" }));
    const res    = await listUsers(get("/api/v1/users"));
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<User[]>>(res);
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);
  });
});

// ─── GET /users/:id ───────────────────────────────────────────────────────────

describe("GET /users/:id", () => {
  test("returns a specific user", async () => {
    const createRes      = await createUser(post("/api/v1/users", { email: "get-user@example.com", name: "Getter" }));
    const { data: created } = await json<ApiResponse<User>>(createRes);

    const req = reqWithParams("GET", `/api/v1/users/${created!.id}`, { id: created!.id });
    const res = await getUser(req as Request & { params: { id: string } });
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<User>>(res);
    expect(data!.id).toBe(created!.id);
  });

  test("returns 404 for unknown ID", async () => {
    const req = reqWithParams("GET", "/api/v1/users/nonexistent", { id: "nonexistent" });
    const res = await getUser(req as Request & { params: { id: string } });
    expect(res.status).toBe(404);
  });
});
