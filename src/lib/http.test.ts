import { test, expect, describe } from "bun:test";
import { json, post } from "../../src/test-utils/helpers";
import {
  jsonOk,
  jsonCreated,
  jsonError,
  jsonNotFound,
  parseJsonBody,
  validateRequiredFields,
} from "../../src/lib/http";
import type { ApiResponse } from "../../src/types";

// ─── Response helpers ─────────────────────────────────────────────────────────

describe("jsonOk", () => {
  test("returns 200 with success envelope", async () => {
    const res  = jsonOk({ id: "123" });
    expect(res.status).toBe(200);
    const body = await json<ApiResponse<{ id: string }>>(res);
    expect(body).toEqual({ success: true, data: { id: "123" } });
  });

  test("accepts custom status code", async () => {
    expect(jsonOk({}, 202).status).toBe(202);
  });

  test("sets Content-Type to application/json", () => {
    expect(jsonOk({}).headers.get("Content-Type")).toBe("application/json");
  });
});

describe("jsonCreated", () => {
  test("returns 201", () => {
    expect(jsonCreated({}).status).toBe(201);
  });
});

describe("jsonError", () => {
  test("returns 400 by default with error envelope", async () => {
    const res  = jsonError("Something went wrong");
    expect(res.status).toBe(400);
    const body = await json<ApiResponse>(res);
    expect(body).toEqual({ success: false, error: "Something went wrong" });
  });

  test("accepts custom status", () => {
    expect(jsonError("Not found", 404).status).toBe(404);
    expect(jsonError("Server error", 500).status).toBe(500);
  });
});

describe("jsonNotFound", () => {
  test("returns 404 with resource name", async () => {
    const res  = jsonNotFound("Transaction");
    expect(res.status).toBe(404);
    const body = await json<ApiResponse>(res);
    expect(body.error).toContain("Transaction");
  });

  test("defaults to 'Resource' when no name provided", () => {
    expect(jsonNotFound().status).toBe(404);
  });
});

// ─── parseJsonBody ────────────────────────────────────────────────────────────

describe("parseJsonBody", () => {
  test("parses valid JSON body", async () => {
    const req    = post("/test", { name: "Zain" });
    const parsed = await parseJsonBody<{ name: string }>(req);
    expect(parsed).toEqual({ name: "Zain" });
  });

  test("returns null for empty body", async () => {
    const req = new Request("http://localhost/test", { method: "POST", body: "" });
    expect(await parseJsonBody(req)).toBeNull();
  });

  test("returns null for malformed JSON", async () => {
    const req = new Request("http://localhost/test", { method: "POST", body: "{ not valid }" });
    expect(await parseJsonBody(req)).toBeNull();
  });
});

// ─── validateRequiredFields ───────────────────────────────────────────────────

describe("validateRequiredFields", () => {
  test("returns null when all fields present", () => {
    expect(validateRequiredFields({ a: "1", b: "2" }, ["a", "b"])).toBeNull();
  });

  test("returns error message for missing field", () => {
    expect(validateRequiredFields({ a: "1" }, ["a", "b"])).toContain("b");
  });

  test("treats empty string as missing", () => {
    expect(validateRequiredFields({ a: "" }, ["a"])).toContain("a");
  });

  test("treats null as missing", () => {
    expect(validateRequiredFields({ a: null }, ["a"])).toContain("a");
  });
});
