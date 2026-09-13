import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../db/database";
import { users, paymentMethods, transactions, CURRENCY_CODES, TRANSACTION_STATUSES } from "../db/schema";
import { generateId, isValidIdempotencyKey } from "../lib/crypto";
import {
  jsonOk,
  jsonCreated,
  jsonError,
  jsonNotFound,
  jsonInternalError,
  parseJsonBody,
  validateRequiredFields,
} from "../lib/http";
import { submitToProcessor } from "../lib/processor";
import type { CreateTransactionPayload, TransactionStatus } from "../types";

// ─── State machine ─────────────────────────────────────────────────────────────
//   PENDING    → AUTHORIZED | FAILED
//   AUTHORIZED → CAPTURED   | FAILED
//   CAPTURED   → REFUNDED
//   FAILED     → (terminal)
//   REFUNDED   → (terminal)

const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  PENDING:    ["AUTHORIZED", "FAILED"],
  AUTHORIZED: ["CAPTURED",   "FAILED"],
  CAPTURED:   ["REFUNDED"],
  FAILED:     [],
  REFUNDED:   [],
};

// ─── GET /transactions ────────────────────────────────────────────────────────

export async function listTransactions(req: Request): Promise<Response> {
  try {
    const url    = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const status = url.searchParams.get("status") as TransactionStatus | null;
    const limit  = Math.min(Number(url.searchParams.get("limit")  ?? 50), 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    if (status && !TRANSACTION_STATUSES.includes(status)) {
      return jsonError(`Invalid status filter. Must be one of: ${TRANSACTION_STATUSES.join(", ")}`, 422);
    }

    const conditions = [];
    if (userId) conditions.push(eq(transactions.userId, userId));
    if (status) conditions.push(eq(transactions.status, status));

    const results = await getDb()
      .select()
      .from(transactions)
      .where(conditions.length ? and(...(conditions as [typeof conditions[0], ...typeof conditions])) : undefined)
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    return jsonOk({ transactions: results, limit, offset, count: results.length });
  } catch (err) {
    return jsonInternalError(err);
  }
}

// ─── GET /transactions/:id ────────────────────────────────────────────────────

export async function getTransaction(
  req: Request & { params: { id: string } }
): Promise<Response> {
  try {
    const tx = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.id, req.params.id))
      .get();

    if (!tx) return jsonNotFound("Transaction");
    return jsonOk(tx);
  } catch (err) {
    return jsonInternalError(err);
  }
}

// ─── POST /transactions ───────────────────────────────────────────────────────

export async function createTransaction(req: Request): Promise<Response> {
  try {
    // Idempotency key validation
    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      return jsonError("Missing required header: Idempotency-Key. Generate a UUID v4 on the client side.", 400);
    }
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return jsonError("Idempotency-Key must be a valid UUID v4", 422);
    }

    const body = await parseJsonBody<CreateTransactionPayload>(req);
    if (!body) return jsonError("Invalid or missing JSON body");

    const validationError = validateRequiredFields(
      body as unknown as Record<string, unknown>,
      ["user_id", "payment_method_id", "amount", "currency"]
    );
    if (validationError) return jsonError(validationError, 422);

    const { user_id, payment_method_id, amount, currency, description, metadata } = body;

    if (!Number.isInteger(amount) || amount <= 0) {
      return jsonError(
        "amount must be a positive integer representing the smallest currency unit (e.g. cents for USD)",
        422
      );
    }

    if (!CURRENCY_CODES.includes(currency as (typeof CURRENCY_CODES)[number])) {
      return jsonError(`Unsupported currency. Must be one of: ${CURRENCY_CODES.join(", ")}`, 422);
    }

    // Atomic idempotency check + insert
    let isReplay = false;

    const transaction = await getDb().transaction(async (tx) => {
      // 1. Idempotency check
      const existing = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.idempotencyKey, idempotencyKey))
        .get();

      if (existing) {
        isReplay = true;
        return existing;
      }

      // 2. Verify user
      const user = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, user_id))
        .get();

      if (!user) throw new Error("USER_NOT_FOUND");

      // 3. Verify payment method belongs to user
      const pm = await tx
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.id, payment_method_id), eq(paymentMethods.userId, user_id)))
        .get();

      if (!pm) throw new Error("PM_NOT_FOUND");

      // 4. Insert
      const [inserted] = await tx
        .insert(transactions)
        .values({
          id:              generateId(),
          userId:          user_id,
          paymentMethodId: payment_method_id,
          idempotencyKey:  idempotencyKey,
          amount,
          currency:        currency as (typeof CURRENCY_CODES)[number],
          description:     description ?? null,
          metadata:        metadata ? JSON.stringify(metadata) : null,
        })
        .returning();

      return inserted;
    });

    if (isReplay) return jsonOk(transaction!);

    submitToProcessor(transaction!.id);
    return jsonCreated(transaction!);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "USER_NOT_FOUND") return jsonNotFound("User");
      if (err.message === "PM_NOT_FOUND")   return jsonError("Payment method not found or does not belong to this user", 404);
    }
    return jsonInternalError(err);
  }
}

// ─── PATCH /transactions/:id/status ──────────────────────────────────────────

export async function updateTransactionStatus(
  req: Request & { params: { id: string } }
): Promise<Response> {
  try {
    const body = await parseJsonBody<{ status: TransactionStatus }>(req);
    if (!body) return jsonError("Invalid or missing JSON body");

    const { status } = body;
    if (!TRANSACTION_STATUSES.includes(status)) {
      return jsonError(`Invalid status. Must be one of: ${TRANSACTION_STATUSES.join(", ")}`, 422);
    }

    const db = getDb();
    const tx = await db.select().from(transactions).where(eq(transactions.id, req.params.id)).get();
    if (!tx) return jsonNotFound("Transaction");

    if (!ALLOWED_TRANSITIONS[tx.status].includes(status)) {
      return jsonError(
        `Invalid transition: ${tx.status} → ${status}. Allowed: ${ALLOWED_TRANSITIONS[tx.status].join(", ") || "none"}`,
        422
      );
    }

    const [updated] = await db
      .update(transactions)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(transactions.id, req.params.id))
      .returning();

    return jsonOk(updated);
  } catch (err) {
    return jsonInternalError(err);
  }
}

// ─── POST /transactions/:id/refund ────────────────────────────────────────────

export async function refundTransaction(
  req: Request & { params: { id: string } }
): Promise<Response> {
  try {
    const body   = await parseJsonBody<{ reason?: string }>(req);
    const reason = body?.reason ?? "Refund requested";

    const updated = await getDb().transaction(async (tx) => {
      const record = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, req.params.id))
        .get();

      if (!record) throw new Error("TX_NOT_FOUND");
      if (record.status !== "CAPTURED") throw new Error(`INVALID_STATUS:${record.status}`);

      const existingMeta = record.metadata ? JSON.parse(record.metadata) : {};
      const updatedMeta  = JSON.stringify({
        ...existingMeta,
        refund: { reason, refunded_at: new Date().toISOString() },
      });

      const [result] = await tx
        .update(transactions)
        .set({ status: "REFUNDED", metadata: updatedMeta, updatedAt: new Date().toISOString() })
        .where(eq(transactions.id, req.params.id))
        .returning();

      return result;
    });

    return jsonOk(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "TX_NOT_FOUND") return jsonNotFound("Transaction");
      if (err.message.startsWith("INVALID_STATUS:")) {
        const current = err.message.split(":")[1];
        return jsonError(`Only CAPTURED transactions can be refunded. Current status: ${current}`, 422);
      }
    }
    return jsonInternalError(err);
  }
}
