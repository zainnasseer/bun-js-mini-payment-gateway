import { test, expect, describe, beforeAll } from "bun:test";
import { json, post } from "../test-utils/helpers";
import { setupIntegrationTests } from "../test-utils/db";
import { createMerchant } from "./merchants";
import { createTransaction } from "./transactions";
import { handleProcessorWebhook } from "./webhooks";
import { signPayload, generateIdempotencyKey } from "../lib/crypto";
import type { ApiResponse, MerchantResponse, Transaction } from "../types";

beforeAll(async () => {
  await setupIntegrationTests();
});

async function seedTx(): Promise<{ merchant: MerchantResponse; tx: Transaction }> {
  const mRes = await createMerchant(
    post("/api/v1/merchants", {
      name: "WH Store",
      email: `wh-${Date.now()}@example.com`,
      webhook_url: "https://example.com/hook",
      phone_number: "+1-555-0100",
      origin_header: "https://example.com",
      webhook_secret: "wh_secret_test_1234567890",
    })
  );
  const { data: merchant } = await json<ApiResponse<MerchantResponse>>(mRes);
  const txRes = await createTransaction(
    post(
      "/api/v1/transactions",
      { amount: 1500, currency: "USD" },
      {
        "X-API-Key": merchant!.apiKey,
        "Idempotency-Key": generateIdempotencyKey(),
      }
    )
  );
  const { data: tx } = await json<ApiResponse<Transaction>>(txRes);
  return { merchant: merchant!, tx: tx! };
}

describe("POST /webhooks/processor", () => {
  test("updates transaction with valid HMAC (merchant secret)", async () => {
    const { merchant, tx } = await seedTx();
    const payload = JSON.stringify({
      transaction_id: tx.id,
      status: "AUTHORIZED",
      processor_ref: "proc_123",
    });
    const sig = signPayload(merchant.webhookSecret, payload);
    const req = new Request("http://localhost/webhooks/processor", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Signature": sig },
      body: payload,
    });
    const res = await handleProcessorWebhook(req);
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<{ transaction: Transaction }>>(res);
    expect(data!.transaction.status).toBe("AUTHORIZED");
  });

  test("rejects bad signature", async () => {
    const { tx } = await seedTx();
    const payload = JSON.stringify({ transaction_id: tx.id, status: "AUTHORIZED" });
    const req = new Request("http://localhost/webhooks/processor", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Signature": "deadbeef" },
      body: payload,
    });
    expect((await handleProcessorWebhook(req)).status).toBe(401);
  });
});
