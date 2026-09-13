import { test, expect, describe, beforeAll } from "bun:test";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";
process.env.WEBHOOK_SECRET = "test_webhook_secret_key";
process.env.PROCESSOR_DELAY_MS = "50000";

import { json, post, reqWithParams } from "../../src/test-utils/helpers";
import { applyTestSchema } from "../../src/db/database";
import { createUser } from "../../src/routes/users";
import { createPaymentMethod } from "../../src/routes/paymentMethods";
import { createTransaction } from "../../src/routes/transactions";
import { handleProcessorWebhook } from "../../src/routes/webhooks";
import { signPayload, generateIdempotencyKey } from "../../src/lib/crypto";
import type { ApiResponse, User, PaymentMethod, Transaction } from "../../src/types";

beforeAll(() => applyTestSchema());

const NEXT_YEAR = new Date().getFullYear() + 1;

async function seedPendingTransaction(suffix: string): Promise<string> {
  const userRes = await createUser(post("/api/v1/users", { email: `wh-${suffix}@example.com`, name: "WH User" }));
  const { data: user } = await json<ApiResponse<User>>(userRes);

  const pmRes = await createPaymentMethod(
    reqWithParams("POST", `/api/v1/users/${user!.id}/payment-methods`, { userId: user!.id }, {
      type: "CARD",
      token_id: `tok_wh_${suffix}_${Date.now()}`,
      last_four: "4242",
      expiry_month: 12,
      expiry_year: NEXT_YEAR,
    }) as Request & { params: { userId: string } }
  );
  const { data: pm } = await json<ApiResponse<PaymentMethod>>(pmRes);

  const txRes = await createTransaction(
    post(
      "/api/v1/transactions",
      { user_id: user!.id, payment_method_id: pm!.id, amount: 1500, currency: "USD" },
      { "Idempotency-Key": generateIdempotencyKey() }
    )
  );
  const { data: tx } = await json<ApiResponse<Transaction>>(txRes);
  return tx!.id;
}

function signedWebhookReq(body: Record<string, unknown>, secret = "test_webhook_secret_key"): Request {
  const rawBody = JSON.stringify(body);
  const signature = signPayload(secret, rawBody);
  return new Request("http://localhost/webhooks/processor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
    },
    body: rawBody,
  });
}

describe("POST /webhooks/processor", () => {
  test("successfully processes AUTHORIZED webhook with valid HMAC signature", async () => {
    const txId = await seedPendingTransaction("auth");
    const payload = {
      transaction_id: txId,
      status: "AUTHORIZED",
      processor_ref: "proc_ref_12345",
    };

    const req = signedWebhookReq(payload);
    const res = await handleProcessorWebhook(req);
    expect(res.status).toBe(200);

    const body = await json<ApiResponse<{ received: boolean; transaction: Transaction }>>(res);
    expect(body.data!.received).toBe(true);
    expect(body.data!.transaction.status).toBe("AUTHORIZED");
    const meta = JSON.parse(body.data!.transaction.metadata!);
    expect(meta.processor.reference).toBe("proc_ref_12345");
  });

  test("rejects webhook with missing signature header", async () => {
    const txId = await seedPendingTransaction("no-sig");
    const req = new Request("http://localhost/webhooks/processor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_id: txId, status: "AUTHORIZED" }),
    });

    const res = await handleProcessorWebhook(req);
    expect(res.status).toBe(401);
  });

  test("rejects webhook with invalid signature", async () => {
    const txId = await seedPendingTransaction("bad-sig");
    const req = signedWebhookReq({ transaction_id: txId, status: "AUTHORIZED" }, "wrong_secret");
    const res = await handleProcessorWebhook(req);
    expect(res.status).toBe(401);
  });

  test("rejects invalid status transition", async () => {
    const txId = await seedPendingTransaction("invalid-transition");
    // PENDING -> CAPTURED directly is disallowed by the state machine
    const req = signedWebhookReq({ transaction_id: txId, status: "CAPTURED" });
    const res = await handleProcessorWebhook(req);
    expect(res.status).toBe(422);
  });

  test("rejects unknown transaction id", async () => {
    const req = signedWebhookReq({ transaction_id: "unknown_id_999", status: "AUTHORIZED" });
    const res = await handleProcessorWebhook(req);
    expect(res.status).toBe(404);
  });
});
