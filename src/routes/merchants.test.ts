import { test, expect, describe, beforeAll } from "bun:test";
import { json, post, get, reqWithParams } from "../test-utils/helpers";
import { setupIntegrationTests } from "../test-utils/db";
import {
  listMerchants,
  getMerchant,
  createMerchant,
  updateMerchant,
  deleteMerchant,
} from "./merchants";
import { attachAuthScope } from "../lib/authContext";
import type { ApiResponse, MerchantResponse } from "../types";

beforeAll(async () => {
  await setupIntegrationTests();
});

const samplePayload = {
  name: "Acme Store",
  email: "merchant@acme.example",
  webhook_url: "https://acme.example/webhooks/payments",
  phone_number: "+1-555-0100",
  origin_header: "https://checkout.acme.example",
  ip_whitelist: ["203.0.113.10"],
  webhook_secret: "test_wh_secret_abc123",
};

describe("POST /merchants", () => {
  test("creates a merchant with credentials", async () => {
    const res = await createMerchant(
      post("/api/v1/merchants", { ...samplePayload, email: "create@acme.example" })
    );
    expect(res.status).toBe(201);
    const { data } = await json<ApiResponse<MerchantResponse>>(res);
    expect(data!.apiKey).toBeString();
    expect(data!.webhookSecret).toBe(samplePayload.webhook_secret);
    expect(data!.ipWhitelist).toEqual(samplePayload.ip_whitelist);
  });
});

describe("GET /merchants", () => {
  test("returns list of merchants", async () => {
    await createMerchant(post("/api/v1/merchants", { ...samplePayload, email: "list@acme.example" }));
    const listReq = get("/api/v1/merchants");
    attachAuthScope(listReq, { kind: "admin" });
    const res = await listMerchants(listReq);
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<MerchantResponse[]>>(res);
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("PATCH /merchants/:id", () => {
  test("updates merchant", async () => {
    const createRes = await createMerchant(
      post("/api/v1/merchants", { ...samplePayload, email: "patch@acme.example" })
    );
    const { data: created } = await json<ApiResponse<MerchantResponse>>(createRes);
    const req = reqWithParams(
      "PATCH",
      `/api/v1/merchants/${created!.id}`,
      { id: created!.id },
      { name: "Updated Name" },
      { "X-API-Key": created!.apiKey }
    );
    const res = await updateMerchant(req as Request & { params: { id: string } });
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<MerchantResponse>>(res);
    expect(data!.name).toBe("Updated Name");
  });
});

describe("DELETE /merchants/:id", () => {
  test("deletes a merchant", async () => {
    const createRes = await createMerchant(
      post("/api/v1/merchants", { ...samplePayload, email: "del@acme.example" })
    );
    const { data: created } = await json<ApiResponse<MerchantResponse>>(createRes);
    const delReq = reqWithParams("DELETE", `/api/v1/merchants/${created!.id}`, { id: created!.id });
    attachAuthScope(delReq, { kind: "admin" });
    expect((await deleteMerchant(delReq as Request & { params: { id: string } })).status).toBe(200);
  });
});
