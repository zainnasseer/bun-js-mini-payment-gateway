import { eq, and } from "drizzle-orm";
import { getDb } from "../db/database";
import { merchants, transactions, TRANSACTION_STATUSES } from "../db/schema";
import { signPayload, safeCompare } from "../lib/crypto";
import { jsonOk, jsonError, jsonInternalError } from "../lib/http";
import { parseTransactionMetadata } from "../lib/metadata";
import { firstRow } from "../lib/dbQuery";
import { queueMerchantWebhook } from "../lib/merchantWebhook";
import type { TransactionStatus } from "../types";

const WEBHOOK_VALID_STATUSES: TransactionStatus[] = ["AUTHORIZED", "CAPTURED", "FAILED"];

const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  PENDING:    ["AUTHORIZED", "FAILED"],
  AUTHORIZED: ["CAPTURED",   "FAILED"],
  CAPTURED:   ["REFUNDED"],
  FAILED:     [],
  REFUNDED:   [],
};

async function verifySignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!secret) return process.env.NODE_ENV !== "production";
  const expected = signPayload(secret, rawBody);
  return safeCompare(signature, expected);
}

async function verifySignatureAndReadBody(req: Request): Promise<string | Response> {
  const signature = req.headers.get("X-Webhook-Signature");
  if (!signature) return jsonError("Missing required header: X-Webhook-Signature", 401);

  const rawBody = await req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  const transactionId = payload.transaction_id as string | undefined;
  let secret = process.env.WEBHOOK_SECRET?.trim() ?? "";

  if (transactionId) {
    const tx = await firstRow(
      getDb()
        .select({ merchantId: transactions.merchantId })
        .from(transactions)
        .where(eq(transactions.id, String(transactionId)))
        .limit(1)
    );
    if (tx) {
      const merchant = await firstRow(
        getDb()
          .select({ webhookSecret: merchants.webhookSecret })
          .from(merchants)
          .where(eq(merchants.id, tx.merchantId))
          .limit(1)
      );
      if (merchant?.webhookSecret) secret = merchant.webhookSecret;
    }
  }

  if (!secret && process.env.NODE_ENV !== "production") {
    console.warn("⚠️  No webhook secret — skipping signature check in dev.");
    return rawBody;
  }

  if (!secret) {
    return jsonError("Server misconfiguration: webhook secret not available", 500);
  }

  if (!(await verifySignature(rawBody, signature, secret))) {
    return jsonError("Webhook signature verification failed", 401);
  }

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

    const txId = String(transaction_id);
    const nextStatus = status as TransactionStatus;

    const updated = await getDb().transaction(async (tx) => {
      const record = await firstRow(
        tx.select().from(transactions).where(eq(transactions.id, txId)).limit(1)
      );
      if (!record) throw new Error("TX_NOT_FOUND");

      const fromStatus = record.status as TransactionStatus;
      if (!ALLOWED_TRANSITIONS[fromStatus].includes(nextStatus)) {
        throw new Error(`INVALID_TRANSITION:${fromStatus}:${nextStatus}`);
      }

      const existingMeta = parseTransactionMetadata(record.metadata);
      const updatedMeta = JSON.stringify({
        ...existingMeta,
        processor: {
          reference:    processor_ref ?? null,
          processed_at: new Date().toISOString(),
          ...(failure_reason ? { failure_reason } : {}),
        },
      });

      const [row] = await tx
        .update(transactions)
        .set({ status: nextStatus, metadata: updatedMeta, updatedAt: new Date().toISOString() })
        .where(and(eq(transactions.id, txId), eq(transactions.status, fromStatus)))
        .returning();

      if (!row) throw new Error("STATUS_CONFLICT");
      return row;
    });

    queueMerchantWebhook(updated);

    console.log(`[Webhook] Transaction ${transaction_id} → ${status}`);
    return jsonOk({ received: true, transaction: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "TX_NOT_FOUND") return jsonError("Transaction not found", 404);
      if (err.message.startsWith("INVALID_TRANSITION:")) {
        const [, from, to] = err.message.split(":");
        return jsonError(`Invalid transition: ${from} → ${to}`, 422);
      }
      if (err.message === "STATUS_CONFLICT") {
        return jsonError("Transaction status changed concurrently; retry webhook", 409);
      }
      if (err.message === "INVALID_METADATA") {
        return jsonError("Transaction metadata is not valid JSON", 422);
      }
    }
    return jsonInternalError(err);
  }
}
