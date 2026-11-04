import { eq, desc, and, gte, lte } from "drizzle-orm";
import { getDb } from "../db/database";
import { merchants, transactions, CURRENCY_CODES, TRANSACTION_STATUSES } from "../db/schema";
import { generateId, isValidIdempotencyKey } from "../lib/crypto";
import { resolveAuthScope } from "../lib/authContext";
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
import { queueMerchantWebhook } from "../lib/merchantWebhook";
import { isUniqueViolation } from "../lib/dbErrors";
import { firstRow } from "../lib/dbQuery";
import { parseTransactionMetadata } from "../lib/metadata";
import type { CreateTransactionPayload, TransactionStatus } from "../types";

const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  PENDING:    ["AUTHORIZED", "FAILED"],
  AUTHORIZED: ["CAPTURED",   "FAILED"],
  CAPTURED:   ["REFUNDED"],
  FAILED:     [],
  REFUNDED:   [],
};

async function resolveMerchantIdForWrite(
  req: Request,
  body: CreateTransactionPayload
): Promise<string | Response> {
  const scope = await resolveAuthScope(req);
  if (scope.kind === "merchant") return scope.merchant.id;
  if (scope.kind === "admin" || scope.kind === "anonymous") {
    if (!body.merchant_id?.trim()) {
      return jsonError("merchant_id is required when using the platform admin API key", 422);
    }
    return body.merchant_id.trim();
  }
  return jsonError("Unauthorized", 401);
}

/** YYYY-MM-DD → ISO bounds for `created_at` (stored as ISO text). */
function parseDateFilter(value: string | null, endOfDay: boolean): string | null {
  if (!value?.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  return endOfDay ? `${value.trim()}T23:59:59.999Z` : `${value.trim()}T00:00:00.000Z`;
}

async function canAccessMerchant(req: Request, merchantId: string): Promise<boolean> {
  const scope = await resolveAuthScope(req);
  if (scope.kind === "admin" || scope.kind === "anonymous") return true;
  if (scope.kind === "merchant") return scope.merchant.id === merchantId;
  return false;
}

export async function listTransactions(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const filterMerchantId = url.searchParams.get("merchant_id");
    const status = url.searchParams.get("status") as TransactionStatus | null;
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const fromIso = parseDateFilter(fromRaw, false);
    const toIso = parseDateFilter(toRaw, true);
    if (fromRaw && !fromIso) return jsonError("Invalid from date — use YYYY-MM-DD", 422);
    if (toRaw && !toIso) return jsonError("Invalid to date — use YYYY-MM-DD", 422);
    if (fromIso && toIso && fromIso > toIso) {
      return jsonError("`from` must be on or before `to`", 422);
    }

    const scope = await resolveAuthScope(req);
    if (scope.kind === "merchant") {
      if (filterMerchantId && filterMerchantId !== scope.merchant.id) {
        return jsonError("Cannot list transactions for another merchant", 403);
      }
    }

    if (status && !TRANSACTION_STATUSES.includes(status)) {
      return jsonError(`Invalid status filter. Must be one of: ${TRANSACTION_STATUSES.join(", ")}`, 422);
    }

    const merchantId =
      scope.kind === "merchant" ? scope.merchant.id : filterMerchantId ?? null;

    const conditions = [];
    if (merchantId) conditions.push(eq(transactions.merchantId, merchantId));
    if (status) conditions.push(eq(transactions.status, status));
    if (fromIso) conditions.push(gte(transactions.createdAt, fromIso));
    if (toIso) conditions.push(lte(transactions.createdAt, toIso));

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

export async function getTransaction(
  req: Request & { params: { id: string } }
): Promise<Response> {
  try {
    const tx = await firstRow(
      getDb().select().from(transactions).where(eq(transactions.id, req.params.id)).limit(1)
    );

    if (!tx) return jsonNotFound("Transaction");
    if (!(await canAccessMerchant(req, tx.merchantId))) {
      return jsonError("Forbidden", 403);
    }
    return jsonOk(tx);
  } catch (err) {
    return jsonInternalError(err);
  }
}

export async function createTransaction(req: Request): Promise<Response> {
  try {
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
      ["amount", "currency"]
    );
    if (validationError) return jsonError(validationError, 422);

    const merchantIdOrErr = await resolveMerchantIdForWrite(req, body);
    if (merchantIdOrErr instanceof Response) return merchantIdOrErr;
    const merchantId = merchantIdOrErr;

    const { amount, currency, description, metadata } = body;

    if (!Number.isInteger(amount) || amount <= 0) {
      return jsonError(
        "amount must be a positive integer representing the smallest currency unit (e.g. cents for USD)",
        422
      );
    }

    if (!CURRENCY_CODES.includes(currency as (typeof CURRENCY_CODES)[number])) {
      return jsonError(`Unsupported currency. Must be one of: ${CURRENCY_CODES.join(", ")}`, 422);
    }

    let isReplay = false;

    const transaction = await getDb().transaction(async (tx) => {
      const existing = await firstRow(
        tx.select().from(transactions).where(eq(transactions.idempotencyKey, idempotencyKey)).limit(1)
      );
      if (existing) {
        isReplay = true;
        return existing;
      }

      const merchant = await firstRow(
        tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).limit(1)
      );
      if (!merchant) throw new Error("MERCHANT_NOT_FOUND");

      try {
        const [inserted] = await tx
          .insert(transactions)
          .values({
            id:             generateId(),
            merchantId,
            idempotencyKey: idempotencyKey,
            amount,
            currency:       currency as (typeof CURRENCY_CODES)[number],
            description:    description ?? null,
            metadata:       metadata ? JSON.stringify(metadata) : null,
          })
          .returning();

        return inserted;
      } catch (insertErr) {
        if (!isUniqueViolation(insertErr)) throw insertErr;
        isReplay = true;
        const replay = await firstRow(
          tx.select().from(transactions).where(eq(transactions.idempotencyKey, idempotencyKey)).limit(1)
        );
        if (!replay) throw insertErr;
        return replay;
      }
    });

    if (isReplay) return jsonOk(transaction!);

    queueMerchantWebhook(transaction!, "transaction.created");
    submitToProcessor(transaction!.id);
    return jsonCreated(transaction!);
  } catch (err) {
    if (err instanceof Error && err.message === "MERCHANT_NOT_FOUND") {
      return jsonNotFound("Merchant");
    }
    return jsonInternalError(err);
  }
}

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
    const tx = await firstRow(
      db.select().from(transactions).where(eq(transactions.id, req.params.id)).limit(1)
    );
    if (!tx) return jsonNotFound("Transaction");
    if (!(await canAccessMerchant(req, tx.merchantId))) return jsonError("Forbidden", 403);

    if (!ALLOWED_TRANSITIONS[tx.status as TransactionStatus].includes(status)) {
      return jsonError(
        `Invalid transition: ${tx.status} → ${status}. Allowed: ${ALLOWED_TRANSITIONS[tx.status as TransactionStatus].join(", ") || "none"}`,
        422
      );
    }

    const [updated] = await db
      .update(transactions)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(transactions.id, req.params.id))
      .returning();

    if (updated) queueMerchantWebhook(updated, "transaction.status_updated");

    return jsonOk(updated);
  } catch (err) {
    return jsonInternalError(err);
  }
}

export async function refundTransaction(
  req: Request & { params: { id: string } }
): Promise<Response> {
  try {
    const body = await parseJsonBody<{ reason?: string }>(req);
    const reason = body?.reason ?? "Refund requested";

    const updated = await getDb().transaction(async (tx) => {
      const record = await firstRow(
        tx.select().from(transactions).where(eq(transactions.id, req.params.id)).limit(1)
      );

      if (!record) throw new Error("TX_NOT_FOUND");
      if (!(await canAccessMerchant(req, record.merchantId))) throw new Error("FORBIDDEN");
      if (record.status !== "CAPTURED") throw new Error(`INVALID_STATUS:${record.status}`);

      const existingMeta = parseTransactionMetadata(record.metadata);
      const updatedMeta = JSON.stringify({
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

    if (updated) queueMerchantWebhook(updated, "transaction.refunded");

    return jsonOk(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "TX_NOT_FOUND") return jsonNotFound("Transaction");
      if (err.message === "FORBIDDEN") return jsonError("Forbidden", 403);
      if (err.message.startsWith("INVALID_STATUS:")) {
        const current = err.message.split(":")[1];
        return jsonError(`Only CAPTURED transactions can be refunded. Current status: ${current}`, 422);
      }
      if (err.message === "INVALID_METADATA") {
        return jsonError("Transaction metadata is not valid JSON", 422);
      }
    }
    return jsonInternalError(err);
  }
}
