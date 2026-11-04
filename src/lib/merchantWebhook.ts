import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { merchants, merchantWebhookDeliveries, WEBHOOK_EVENTS } from "../db/schema";
import { generateId, signPayload } from "./crypto";
import { firstRow } from "./dbQuery";
import type { Transaction } from "../types";

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const RESPONSE_MAX = 500;

function eventForTransactionStatus(status: Transaction["status"]): WebhookEvent {
  switch (status) {
    case "PENDING":
      return "transaction.created";
    case "AUTHORIZED":
      return "transaction.authorized";
    case "CAPTURED":
      return "transaction.captured";
    case "FAILED":
      return "transaction.failed";
    case "REFUNDED":
      return "transaction.refunded";
    default:
      return "transaction.status_updated";
  }
}

export function buildMerchantWebhookBody(
  event: WebhookEvent,
  transaction: Transaction
): Record<string, unknown> {
  return {
    event,
    transaction_id: transaction.id,
    merchant_id: transaction.merchantId,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    description: transaction.description,
    created_at: transaction.createdAt,
    updated_at: transaction.updatedAt,
    sent_at: new Date().toISOString(),
  };
}

/** POST signed payload to merchant webhook URL and persist delivery outcome. */
export async function deliverMerchantWebhook(
  transaction: Transaction,
  event?: WebhookEvent
): Promise<void> {
  const resolvedEvent = event ?? eventForTransactionStatus(transaction.status);
  const db = getDb();

  const merchant = await firstRow(
    db.select().from(merchants).where(eq(merchants.id, transaction.merchantId)).limit(1)
  );
  if (!merchant) return;

  const bodyObj = buildMerchantWebhookBody(resolvedEvent, transaction);
  const payload = JSON.stringify(bodyObj);
  const signature = signPayload(merchant.webhookSecret, payload);
  const deliveryId = generateId();
  const createdAt = new Date().toISOString();

  await db.insert(merchantWebhookDeliveries).values({
    id: deliveryId,
    merchantId: merchant.id,
    transactionId: transaction.id,
    event: resolvedEvent,
    targetUrl: merchant.webhookUrl,
    payload,
    status: "PENDING",
    createdAt,
  });

  try {
    const res = await fetch(merchant.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": resolvedEvent,
        "User-Agent": "PaymentGateway/2.0",
      },
      body: payload,
      signal: AbortSignal.timeout(12_000),
    });

    const excerpt = (await res.text()).slice(0, RESPONSE_MAX);
    await db
      .update(merchantWebhookDeliveries)
      .set({
        status: res.ok ? "DELIVERED" : "FAILED",
        httpStatus: res.status,
        responseExcerpt: excerpt || null,
        errorMessage: res.ok ? null : `HTTP ${res.status}`,
        deliveredAt: new Date().toISOString(),
      })
      .where(eq(merchantWebhookDeliveries.id, deliveryId));

    console.log(
      `[MerchantWebhook] ${res.ok ? "✅" : "❌"} ${resolvedEvent} → ${merchant.webhookUrl} (${res.status})`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delivery failed";
    await db
      .update(merchantWebhookDeliveries)
      .set({
        status: "FAILED",
        errorMessage: message,
        deliveredAt: new Date().toISOString(),
      })
      .where(eq(merchantWebhookDeliveries.id, deliveryId));

    console.warn(`[MerchantWebhook] ❌ ${resolvedEvent} → ${merchant.webhookUrl}: ${message}`);
  }
}

/** Fire-and-forget wrapper for route handlers / processor. */
export function queueMerchantWebhook(transaction: Transaction, event?: WebhookEvent): void {
  void deliverMerchantWebhook(transaction, event);
}
