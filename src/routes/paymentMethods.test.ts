import { test, expect, describe, beforeAll } from "bun:test";

process.env.DATABASE_URL = ":memory:";
process.env.NODE_ENV = "test";

import { json, post, reqWithParams } from "../../src/test-utils/helpers";
import { applyTestSchema } from "../../src/db/database";
import { createUser } from "../../src/routes/users";
import {
  listPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
} from "../../src/routes/paymentMethods";
import { createTransaction, getTransaction } from "../../src/routes/transactions";
import type { ApiResponse, User, PaymentMethod, Transaction } from "../../src/types";

beforeAll(() => applyTestSchema());

const NEXT_YEAR = new Date().getFullYear() + 1;

const VALID_PM = {
  type:         "CARD" as const,
  token_id:     "tok_test_abc123",
  last_four:    "4242",
  expiry_month: 12,
  expiry_year:  NEXT_YEAR,
};

async function seedUser(email = "pm-user@example.com"): Promise<string> {
  const res          = await createUser(post("/api/v1/users", { email, name: "PM User" }));
  const { data }     = await json<ApiResponse<User>>(res);
  return data!.id;
}

// ─── POST /users/:userId/payment-methods ─────────────────────────────────────

describe("POST /users/:userId/payment-methods", () => {
  test("creates a payment method with valid payload", async () => {
    const userId = await seedUser("create-pm@example.com");
    const req    = reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, VALID_PM);
    const res    = await createPaymentMethod(req as Request & { params: { userId: string } });

    expect(res.status).toBe(201);
    const { data } = await json<ApiResponse<PaymentMethod>>(res);
    expect(data!.tokenId).toBe(VALID_PM.token_id);
    expect(data!.lastFour).toBe("4242");
    expect(data!.isDefault).toBe(false);
  });

  test("PCI-DSS: rejects raw PAN field", async () => {
    const userId = await seedUser("pci-pan@example.com");
    const req    = reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
      ...VALID_PM, token_id: "tok_other", pan: "4111111111111111",
    });
    const res = await createPaymentMethod(req as Request & { params: { userId: string } });

    expect(res.status).toBe(400);
    const { error } = await json<ApiResponse>(res);
    expect(error).toContain("tokenization");
  });

  test("PCI-DSS: rejects cvv field", async () => {
    const userId = await seedUser("pci-cvv@example.com");
    const req    = reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
      ...VALID_PM, token_id: "tok_cvv", cvv: "123",
    });
    const res = await createPaymentMethod(req as Request & { params: { userId: string } });
    expect(res.status).toBe(400);
  });

  test("rejects invalid payment method type", async () => {
    const userId = await seedUser("bad-type@example.com");
    const req    = reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
      ...VALID_PM, token_id: "tok_type", type: "CRYPTO",
    });
    const res = await createPaymentMethod(req as Request & { params: { userId: string } });
    expect(res.status).toBe(422);
  });

  test("rejects last_four not exactly 4 digits", async () => {
    const userId = await seedUser("bad-lastfour@example.com");
    const req    = reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
      ...VALID_PM, token_id: "tok_lf", last_four: "42",
    });
    const res = await createPaymentMethod(req as Request & { params: { userId: string } });
    expect(res.status).toBe(422);
  });

  test("rejects duplicate token_id with 409", async () => {
    const userId = await seedUser("dup-token@example.com");
    await createPaymentMethod(
      reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, VALID_PM) as
        Request & { params: { userId: string } }
    );
    const res = await createPaymentMethod(
      reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, VALID_PM) as
        Request & { params: { userId: string } }
    );
    expect(res.status).toBe(409);
  });

  test("returns 404 for non-existent user", async () => {
    const req = reqWithParams("POST", "/api/v1/users/ghost/payment-methods", { userId: "ghost" }, VALID_PM);
    const res = await createPaymentMethod(req as Request & { params: { userId: string } });
    expect(res.status).toBe(404);
  });
});

// ─── GET /users/:userId/payment-methods ──────────────────────────────────────

describe("GET /users/:userId/payment-methods", () => {
  test("returns methods ordered default-first", async () => {
    const userId = await seedUser("list-pm@example.com");

    await createPaymentMethod(
      reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
        ...VALID_PM, token_id: "tok_nond", is_default: false,
      }) as Request & { params: { userId: string } }
    );
    await createPaymentMethod(
      reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
        ...VALID_PM, token_id: "tok_def", last_four: "1234", is_default: true,
      }) as Request & { params: { userId: string } }
    );

    const req  = reqWithParams("GET", `/api/v1/users/${userId}/payment-methods`, { userId });
    const res  = await listPaymentMethods(req as Request & { params: { userId: string } });
    expect(res.status).toBe(200);
    const { data } = await json<ApiResponse<PaymentMethod[]>>(res);
    expect(data![0]!.isDefault).toBe(true);
  });
});

// ─── DELETE /users/:userId/payment-methods/:methodId ─────────────────────────

describe("DELETE /users/:userId/payment-methods/:methodId", () => {
  test("deletes an existing payment method", async () => {
    const userId    = await seedUser("del-pm@example.com");
    const createRes = await createPaymentMethod(
      reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
        ...VALID_PM, token_id: "tok_del",
      }) as Request & { params: { userId: string } }
    );
    const { data: pm } = await json<ApiResponse<PaymentMethod>>(createRes);

    const req = reqWithParams("DELETE", `/api/v1/users/${userId}/payment-methods/${pm!.id}`, {
      userId, methodId: pm!.id,
    });
    const res = await deletePaymentMethod(req as Request & { params: { userId: string; methodId: string } });
    expect(res.status).toBe(200);
  });

  test("deletes a payment method referenced by existing transactions (sets paymentMethodId to null)", async () => {
    const userId    = await seedUser("del-pm-tx@example.com");
    const createRes = await createPaymentMethod(
      reqWithParams("POST", `/api/v1/users/${userId}/payment-methods`, { userId }, {
        ...VALID_PM, token_id: "tok_del_tx",
      }) as Request & { params: { userId: string } }
    );
    const { data: pm } = await json<ApiResponse<PaymentMethod>>(createRes);

    const txRes = await createTransaction(
      post(
        "/api/v1/transactions",
        { user_id: userId, payment_method_id: pm!.id, amount: 2500, currency: "USD" },
        { "Idempotency-Key": crypto.randomUUID() }
      )
    );
    const { data: tx } = await json<ApiResponse<Transaction>>(txRes);
    expect(tx!.paymentMethodId).toBe(pm!.id);

    const req = reqWithParams("DELETE", `/api/v1/users/${userId}/payment-methods/${pm!.id}`, {
      userId, methodId: pm!.id,
    });
    const res = await deletePaymentMethod(req as Request & { params: { userId: string; methodId: string } });
    expect(res.status).toBe(200);

    const getTxRes = await getTransaction(
      reqWithParams("GET", `/api/v1/transactions/${tx!.id}`, { id: tx!.id }) as Request & { params: { id: string } }
    );
    const { data: fetchedTx } = await json<ApiResponse<Transaction>>(getTxRes);
    expect(fetchedTx!.paymentMethodId).toBeNull();
  });

  test("returns 404 for non-existent method", async () => {
    const userId = await seedUser("del-ghost@example.com");
    const req    = reqWithParams("DELETE", `/api/v1/users/${userId}/payment-methods/ghost`, {
      userId, methodId: "ghost",
    });
    const res = await deletePaymentMethod(req as Request & { params: { userId: string; methodId: string } });
    expect(res.status).toBe(404);
  });
});

