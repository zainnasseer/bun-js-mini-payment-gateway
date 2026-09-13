import { test, expect, describe, beforeAll } from "bun:test";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";
process.env.PROCESSOR_DELAY_MS = "50000"; // disable auto-processing during tests

import { json, post, reqWithParams } from "../../src/test-utils/helpers";
import { applyTestSchema } from "../../src/db/database";
import { createUser } from "../../src/routes/users";
import { createPaymentMethod } from "../../src/routes/paymentMethods";
import {
  createTransaction,
  getTransaction,
  listTransactions,
  updateTransactionStatus,
  refundTransaction,
} from "../../src/routes/transactions";
import { generateIdempotencyKey } from "../../src/lib/crypto";
import type { ApiResponse, User, PaymentMethod, Transaction } from "../../src/types";

beforeAll(() => applyTestSchema());

const NEXT_YEAR = new Date().getFullYear() + 1;

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUser(emailSuffix: string): Promise<string> {
  const res      = await createUser(post("/api/v1/users", { email: `tx-${emailSuffix}@example.com`, name: "TX User" }));
  const { data } = await json<ApiResponse<User>>(res);
  return data!.id;
}

async function seedPaymentMethod(userId: string, tokenSuffix: string): Promise<string> {
  const res      = await createPaymentMethod(
    reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
      type:         "CARD",
      token_id:     `tok_${tokenSuffix}_${Date.now()}`,
      last_four:    "4242",
      expiry_month: 12,
      expiry_year:  NEXT_YEAR,
    }) as Request & { params: { userId: string } }
  );
  const { data } = await json<ApiResponse<PaymentMethod>>(res);
  return data!.id;
}

async function seedUserAndPM(suffix: string): Promise<{ userId: string; paymentMethodId: string }> {
  const userId          = await seedUser(suffix);
  const paymentMethodId = await seedPaymentMethod(userId, suffix);
  return { userId, paymentMethodId };
}

function createTxReq(userId: string, pmId: string, overrides: Record<string, unknown> = {}): Request {
  return post(
    "/api/v1/transactions",
    { user_id: userId, payment_method_id: pmId, amount: 1999, currency: "USD", ...overrides },
    { "Idempotency-Key": generateIdempotencyKey() }
  );
}

async function patchStatus(id: string, status: string): Promise<Response> {
  return updateTransactionStatus(
    reqWithParams("PATCH", `/api/v1/transactions/${id}/status`, { id }, { status }) as
      Request & { params: { id: string } }
  );
}

// ─── POST /transactions ───────────────────────────────────────────────────────

describe("POST /transactions", () => {
  test("creates a PENDING transaction", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("create");
    const res = await createTransaction(createTxReq(userId, paymentMethodId));

    expect(res.status).toBe(201);
    const { data } = await json<ApiResponse<Transaction>>(res);
    expect(data!.status).toBe("PENDING");
    expect(data!.amount).toBe(1999);
    expect(data!.currency).toBe("USD");
  });

  test("rejects missing Idempotency-Key header", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("no-idem");
    const req = post("/api/v1/transactions", { user_id: userId, payment_method_id: paymentMethodId, amount: 500, currency: "USD" });
    const res = await createTransaction(req);
    expect(res.status).toBe(400);
    const { error } = await json<ApiResponse>(res);
    expect(error).toContain("Idempotency-Key");
  });

  test("rejects malformed Idempotency-Key", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("bad-idem");
    const req = post(
      "/api/v1/transactions",
      { user_id: userId, payment_method_id: paymentMethodId, amount: 500, currency: "USD" },
      { "Idempotency-Key": "not-a-uuid" }
    );
    expect((await createTransaction(req)).status).toBe(422);
  });

  test("rejects floating-point amount", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("float");
    const res = await createTransaction(createTxReq(userId, paymentMethodId, { amount: 19.99 }));
    expect(res.status).toBe(422);
    const { error } = await json<ApiResponse>(res);
    expect(error).toContain("integer");
  });

  test("rejects zero amount", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("zero");
    expect((await createTransaction(createTxReq(userId, paymentMethodId, { amount: 0 }))).status).toBe(422);
  });

  test("rejects unsupported currency", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("cur");
    expect((await createTransaction(createTxReq(userId, paymentMethodId, { currency: "BTC" }))).status).toBe(422);
  });

  test("rejects payment method belonging to another user", async () => {
    const { userId }              = await seedUserAndPM("owner");
    const { paymentMethodId: pm } = await seedUserAndPM("other");
    const res = await createTransaction(
      post(
        "/api/v1/transactions",
        { user_id: userId, payment_method_id: pm, amount: 500, currency: "USD" },
        { "Idempotency-Key": generateIdempotencyKey() }
      )
    );
    expect(res.status).toBe(404);
  });
});

// ─── IDEMPOTENCY ─────────────────────────────────────────────────────────────

describe("Idempotency guarantee", () => {
  test("duplicate key returns same transaction with 200 (not 201)", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("idem");
    const key     = generateIdempotencyKey();
    const payload = { user_id: userId, payment_method_id: paymentMethodId, amount: 999, currency: "GBP" };

    const first  = await createTransaction(post("/api/v1/transactions", payload, { "Idempotency-Key": key }));
    const second = await createTransaction(post("/api/v1/transactions", payload, { "Idempotency-Key": key }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);  // replay, not a new resource

    const { data: d1 } = await json<ApiResponse<Transaction>>(first);
    const { data: d2 } = await json<ApiResponse<Transaction>>(second);
    expect(d1!.id).toBe(d2!.id);     // same transaction — no double-charge
  });

  test("different keys create separate transactions", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("idem2");
    const payload = { user_id: userId, payment_method_id: paymentMethodId, amount: 500, currency: "USD" };

    const r1 = await createTransaction(post("/api/v1/transactions", payload, { "Idempotency-Key": generateIdempotencyKey() }));
    const r2 = await createTransaction(post("/api/v1/transactions", payload, { "Idempotency-Key": generateIdempotencyKey() }));

    const { data: d1 } = await json<ApiResponse<Transaction>>(r1);
    const { data: d2 } = await json<ApiResponse<Transaction>>(r2);
    expect(d1!.id).not.toBe(d2!.id);
  });
});

// ─── State Machine (updated: PENDING/AUTHORIZED/CAPTURED/FAILED/REFUNDED) ────

describe("Transaction state machine", () => {
  async function createPendingTx(suffix: string): Promise<string> {
    const { userId, paymentMethodId } = await seedUserAndPM(`sm-${suffix}`);
    const res    = await createTransaction(createTxReq(userId, paymentMethodId));
    const { data } = await json<ApiResponse<Transaction>>(res);
    return data!.id;
  }

  test("PENDING → AUTHORIZED is allowed", async () => {
    const id  = await createPendingTx("p-a");
    const res = await patchStatus(id, "AUTHORIZED");
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<Transaction>>(res);
    expect(data!.status).toBe("AUTHORIZED");
  });

  test("PENDING → FAILED is allowed", async () => {
    const id  = await createPendingTx("p-f");
    const res = await patchStatus(id, "FAILED");
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<Transaction>>(res);
    expect(data!.status).toBe("FAILED");
  });

  test("PENDING → CAPTURED is NOT allowed", async () => {
    const id  = await createPendingTx("p-c");
    expect((await patchStatus(id, "CAPTURED")).status).toBe(422);
  });

  test("PENDING → REFUNDED is NOT allowed", async () => {
    const id  = await createPendingTx("p-r");
    expect((await patchStatus(id, "REFUNDED")).status).toBe(422);
  });

  test("AUTHORIZED → CAPTURED is allowed", async () => {
    const id  = await createPendingTx("a-c");
    await patchStatus(id, "AUTHORIZED");
    const res = await patchStatus(id, "CAPTURED");
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<Transaction>>(res);
    expect(data!.status).toBe("CAPTURED");
  });

  test("AUTHORIZED → FAILED is allowed", async () => {
    const id  = await createPendingTx("a-f");
    await patchStatus(id, "AUTHORIZED");
    const res = await patchStatus(id, "FAILED");
    expect(res.status).toBe(200);
  });

  test("AUTHORIZED → PENDING is NOT allowed (terminal-ish)", async () => {
    const id = await createPendingTx("a-p");
    await patchStatus(id, "AUTHORIZED");
    expect((await patchStatus(id, "PENDING")).status).toBe(422);
  });

  test("FAILED → SUCCESS is NOT allowed (FAILED is terminal)", async () => {
    const id = await createPendingTx("f-s");
    await patchStatus(id, "FAILED");
    expect((await patchStatus(id, "AUTHORIZED")).status).toBe(422);
  });

  test("CAPTURED → REFUNDED via PATCH is allowed", async () => {
    const id = await createPendingTx("c-r");
    await patchStatus(id, "AUTHORIZED");
    await patchStatus(id, "CAPTURED");
    const res = await patchStatus(id, "REFUNDED");
    expect(res.status).toBe(200);
  });
});

// ─── POST /transactions/:id/refund ────────────────────────────────────────────

describe("POST /transactions/:id/refund", () => {
  async function createCapturedTx(suffix: string): Promise<string> {
    const { userId, paymentMethodId } = await seedUserAndPM(`ref-${suffix}`);
    const txRes    = await createTransaction(createTxReq(userId, paymentMethodId));
    const { data } = await json<ApiResponse<Transaction>>(txRes);
    const id       = data!.id;
    await patchStatus(id, "AUTHORIZED");
    await patchStatus(id, "CAPTURED");
    return id;
  }

  test("refunds a CAPTURED transaction", async () => {
    const id  = await createCapturedTx("happy");
    const req = reqWithParams("POST", `/api/v1/transactions/${id}/refund`, { id }, { reason: "Customer request" });
    const res = await refundTransaction(req as Request & { params: { id: string } });
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<Transaction>>(res);
    expect(data!.status).toBe("REFUNDED");
    const meta = JSON.parse(data!.metadata!);
    expect(meta.refund.reason).toBe("Customer request");
  });

  test("cannot refund a PENDING transaction", async () => {
    const { userId, paymentMethodId } = await seedUserAndPM("ref-pending");
    const txRes    = await createTransaction(createTxReq(userId, paymentMethodId));
    const { data } = await json<ApiResponse<Transaction>>(txRes);
    const req = reqWithParams("POST", `/api/v1/transactions/${data!.id}/refund`, { id: data!.id });
    const res = await refundTransaction(req as Request & { params: { id: string } });
    expect(res.status).toBe(422);
  });

  test("returns 404 for unknown transaction", async () => {
    const req = reqWithParams("POST", "/api/v1/transactions/ghost/refund", { id: "ghost" });
    const res = await refundTransaction(req as Request & { params: { id: string } });
    expect(res.status).toBe(404);
  });
});

// ─── GET /transactions ────────────────────────────────────────────────────────

describe("GET /transactions", () => {
  test("returns paginated results", async () => {
    const req = new Request("http://localhost/api/v1/transactions?limit=10&offset=0");
    const res = await listTransactions(req);
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<{ transactions: Transaction[]; count: number }>>(res);
    expect(typeof data!.count).toBe("number");
    expect(Array.isArray(data!.transactions)).toBe(true);
  });

  test("rejects invalid status filter", async () => {
    const req = new Request("http://localhost/api/v1/transactions?status=BOGUS");
    expect((await listTransactions(req)).status).toBe(422);
  });
});

describe("GET /transactions/:id", () => {
  test("returns 404 for unknown transaction", async () => {
    const req = reqWithParams("GET", "/api/v1/transactions/ghost", { id: "ghost" });
    const res = await getTransaction(req as Request & { params: { id: string } });
    expect(res.status).toBe(404);
  });
});
