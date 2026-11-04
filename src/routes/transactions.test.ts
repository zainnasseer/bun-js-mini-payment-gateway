import { test, expect, describe, beforeAll } from "bun:test";
import { json, post, reqWithParams } from "../test-utils/helpers";
import { setupIntegrationTests } from "../test-utils/db";
import { createMerchant } from "./merchants";
import {
  createTransaction,
  listTransactions,
  getTransaction,
  updateTransactionStatus,
  refundTransaction,
} from "./transactions";
import { generateIdempotencyKey } from "../lib/crypto";
import type { ApiResponse, MerchantResponse, Transaction } from "../types";

beforeAll(async () => {
  await setupIntegrationTests();
});

async function seedMerchant(suffix: string): Promise<MerchantResponse> {
  const res = await createMerchant(
    post("/api/v1/merchants", {
      name: `Store ${suffix}`,
      email: `store-${suffix}@example.com`,
      webhook_url: "https://example.com/hook",
      phone_number: "+1-555-0100",
      origin_header: "https://example.com",
      ip_whitelist: [],
    })
  );
  const { data } = await json<ApiResponse<MerchantResponse>>(res);
  return data!;
}

function txPost(merchant: MerchantResponse, body: Record<string, unknown>, idem?: string): Request {
  const headers: Record<string, string> = { "X-API-Key": merchant.apiKey };
  if (idem) headers["Idempotency-Key"] = idem;
  return post("/api/v1/transactions", body, headers);
}

describe("POST /transactions", () => {
  test("creates a charge for authenticated merchant", async () => {
    const merchant = await seedMerchant("tx-create");
    const res = await createTransaction(
      txPost(merchant, { amount: 1999, currency: "USD", description: "Test" }, generateIdempotencyKey())
    );
    expect(res.status).toBe(201);
    const { data } = await json<ApiResponse<Transaction>>(res);
    expect(data!.merchantId).toBe(merchant.id);
    expect(data!.amount).toBe(1999);
  });

  test("requires idempotency key", async () => {
    const merchant = await seedMerchant("tx-idem");
    const req = post(
      "/api/v1/transactions",
      { amount: 500, currency: "USD" },
      { "X-API-Key": merchant.apiKey }
    );
    expect((await createTransaction(req)).status).toBe(400);
  });
});

describe("GET /transactions", () => {
  test("lists merchant-scoped transactions", async () => {
    const merchant = await seedMerchant("tx-list");
    await createTransaction(
      txPost(merchant, { amount: 100, currency: "USD" }, generateIdempotencyKey())
    );
    const req = post("/api/v1/transactions", {}, { "X-API-Key": merchant.apiKey });
    Object.defineProperty(req, "method", { value: "GET" });
    const listReq = new Request("http://localhost/api/v1/transactions", {
      method: "GET",
      headers: { "X-API-Key": merchant.apiKey },
    });
    const res = await listTransactions(listReq);
    expect(res.status).toBe(200);
    const { data } = await json<
      ApiResponse<{ transactions: Transaction[]; filteredVolume: { amountUsdMinor: number } }>
    >(res);
    expect(data!.transactions.length).toBeGreaterThan(0);
    expect(data!.transactions.every((t) => t.merchantId === merchant.id)).toBe(true);
    expect(data!.filteredVolume.amountUsdMinor).toBeGreaterThan(0);
  });

  test("filtered volume converts mixed currencies to USD", async () => {
    const merchant = await seedMerchant("tx-volume-fx");
    await createTransaction(
      txPost(merchant, { amount: 100, currency: "USD" }, generateIdempotencyKey())
    );
    await createTransaction(
      txPost(merchant, { amount: 100, currency: "EUR" }, generateIdempotencyKey())
    );
    const listReq = new Request("http://localhost/api/v1/transactions", {
      method: "GET",
      headers: { "X-API-Key": merchant.apiKey },
    });
    const res = await listTransactions(listReq);
    const { data } = await json<
      ApiResponse<{ filteredVolume: { amountUsdMinor: number; currency: string } }>
    >(res);
    expect(data!.filteredVolume.currency).toBe("USD");
    expect(data!.filteredVolume.amountUsdMinor).toBeGreaterThan(100);
    expect(data!.filteredVolume.rateSource).toBeTruthy();
    expect(data!.filteredVolume.byCurrency.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Refund flow", () => {
  test("refunds captured transaction", async () => {
    const merchant = await seedMerchant("tx-refund");
    const createRes = await createTransaction(
      txPost(merchant, { amount: 5000, currency: "USD" }, generateIdempotencyKey())
    );
    const { data: tx } = await json<ApiResponse<Transaction>>(createRes);

    await updateTransactionStatus(
      reqWithParams("PATCH", `/api/v1/transactions/${tx!.id}/status`, { id: tx!.id }, { status: "AUTHORIZED" }, {
        "X-API-Key": merchant.apiKey,
      }) as Request & { params: { id: string } }
    );
    await updateTransactionStatus(
      reqWithParams("PATCH", `/api/v1/transactions/${tx!.id}/status`, { id: tx!.id }, { status: "CAPTURED" }, {
        "X-API-Key": merchant.apiKey,
      }) as Request & { params: { id: string } }
    );

    const refundReq = reqWithParams(
      "POST",
      `/api/v1/transactions/${tx!.id}/refund`,
      { id: tx!.id },
      { reason: "Test" },
      { "X-API-Key": merchant.apiKey }
    );
    const res = await refundTransaction(refundReq as Request & { params: { id: string } });
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<Transaction>>(res);
    expect(data!.status).toBe("REFUNDED");
  });
});

describe("GET /transactions/:id", () => {
  test("returns transaction for owner merchant", async () => {
    const merchant = await seedMerchant("tx-get");
    const createRes = await createTransaction(
      txPost(merchant, { amount: 300, currency: "USD" }, generateIdempotencyKey())
    );
    const { data: tx } = await json<ApiResponse<Transaction>>(createRes);
    const req = reqWithParams("GET", `/api/v1/transactions/${tx!.id}`, { id: tx!.id });
    Object.assign(req.headers, { "X-API-Key": merchant.apiKey });
    const getReq = Object.assign(
      new Request(`http://localhost/api/v1/transactions/${tx!.id}`, {
        method: "GET",
        headers: { "X-API-Key": merchant.apiKey },
      }),
      { params: { id: tx!.id } }
    );
    const res = await getTransaction(getReq as Request & { params: { id: string } });
    expect(res.status).toBe(200);
  });
});
