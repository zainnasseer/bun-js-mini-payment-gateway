import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { transactions, TRANSACTION_STATUSES } from "../db/schema";
import { signPayload, safeCompare } from "../lib/crypto";
import { jsonOk, jsonError, jsonInternalError } from "../lib/http";
import type { TransactionStatus } from "../types";

const WEBHOOK_VALID_STATUSES: TransactionStatus[] = ["AUTHORIZED", "CAPTURED", "FAILED"];

const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  PENDING:    ["AUTHORIZED", "FAILED"],
  AUTHORIZED: ["CAPTURED",   "FAILED"],
  CAPTURED:   ["REFUNDED"],
  FAILED:     [],
  REFUNDED:   [],
};

async function verifySignatureAndReadBody(req: Request): Promise<string | Response> {
  const signature = req.headers.get("X-Webhook-Signature");
  if (!signature) return jsonError("Missing required header: X-Webhook-Signature", 401);

  const rawBody = await req.text();
  const secret = process.env.WEBHOOK_SECRET ?? "";

  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("⚠️  WEBHOOK_SECRET not set — skipping signature check in dev.");
      return rawBody;
    }
    return jsonError("Server misconfiguration: WEBHOOK_SECRET not set", 500);
  }

  const expected = signPayload(secret, rawBody);
  if (!safeCompare(signature, expected)) return jsonError("Webhook signature verification failed", 401);

  return rawBody;
}

export async function handleProcessorWebhook(req: Request): Promise<Response> {
  try {
    const bodyOrError = await verifySignatureAndReadBody(req);
    if (bodyOrError instanceof Response) return bodyOrError;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyOrError);
    } catch {
      return jsonError("Invalid JSON payload", 400);
    }

    const { transaction_id, status, processor_ref, failure_reason } = payload as {
      transaction_id?: string;
      status?: string;
      processor_ref?: string;
      failure_reason?: string;
    };

    if (!transaction_id || !status) return jsonError("Missing required fields: transaction_id, status", 422);

    if (!WEBHOOK_VALID_STATUSES.includes(status as TransactionStatus)) {
      return jsonError(`Invalid status for webhook. Must be one of: ${WEBHOOK_VALID_STATUSES.join(", ")}`, 422);
    }

    const db     = getDb();
    const record = await db.select().from(transactions).where(eq(transactions.id, String(transaction_id))).get();
    if (!record) return jsonError("Transaction not found", 404);

    if (!ALLOWED_TRANSITIONS[record.status].includes(status as TransactionStatus)) {
      return jsonError(`Invalid transition: ${record.status} → ${status}`, 422);
    }

    const existingMeta = record.metadata ? JSON.parse(record.metadata) : {};
    const updatedMeta  = JSON.stringify({
      ...existingMeta,
      processor: {
        reference:    processor_ref ?? null,
        processed_at: new Date().toISOString(),
        ...(failure_reason ? { failure_reason } : {}),
      },
    });

    const [updated] = await db
      .update(transactions)
      .set({ status: status as TransactionStatus, metadata: updatedMeta, updatedAt: new Date().toISOString() })
      .where(eq(transactions.id, String(transaction_id)))
      .returning();

    console.log(`[Webhook] Transaction ${transaction_id} → ${status}`);
    return jsonOk({ received: true, transaction: updated });
  } catch (err) {
    return jsonInternalError(err);
  }
}
