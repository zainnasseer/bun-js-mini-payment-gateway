/**
 * Backfill merchant webhook delivery logs for existing transactions (no HTTP).
 *
 *   bun run db:seed-webhooks
 */

import { eq } from "drizzle-orm";
import { getDb, initSchema } from "./database";
import { merchants, merchantWebhookDeliveries, transactions } from "./schema";
import { generateId } from "../lib/crypto";
import { buildMerchantWebhookBody } from "../lib/merchantWebhook";
import { firstRow } from "../lib/dbQuery";
import type { Transaction } from "../types";

function eventForTx(tx: Transaction) {
  switch (tx.status) {
    case "AUTHORIZED":
      return "transaction.authorized" as const;
    case "CAPTURED":
      return "transaction.captured" as const;
    case "FAILED":
      return "transaction.failed" as const;
    case "REFUNDED":
      return "transaction.refunded" as const;
    case "PENDING":
      return "transaction.created" as const;
    default:
      return "transaction.status_updated" as const;
  }
}

async function main(): Promise<void> {
  await initSchema();
  const db = getDb();

  const txs = await db.select().from(transactions).limit(120);
  if (txs.length === 0) {
    console.log("No transactions found — run bun run db:seed first.");
    return;
  }

  const rows = [];
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i]!;
    const merchant = await firstRow(
      db.select().from(merchants).where(eq(merchants.id, tx.merchantId)).limit(1)
    );
    if (!merchant) continue;

    const event = eventForTx(tx);
    const payload = JSON.stringify(buildMerchantWebhookBody(event, tx));
    const delivered = i % 5 !== 0;
    const createdAt = tx.updatedAt || tx.createdAt;

    rows.push({
      id: generateId(),
      merchantId: tx.merchantId,
      transactionId: tx.id,
      event,
      targetUrl: merchant.webhookUrl,
      payload,
      status: delivered ? ("DELIVERED" as const) : ("FAILED" as const),
      httpStatus: delivered ? 200 : null,
      responseExcerpt: delivered ? '{"ok":true}' : null,
      errorMessage: delivered ? null : "Connection refused (demo)",
      createdAt,
      deliveredAt: createdAt,
    });
  }

  await db.insert(merchantWebhookDeliveries).values(rows);
  console.log(`✅ Seeded ${rows.length} webhook delivery log(s)`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("❌ Webhook seed failed:", err);
    process.exit(1);
  });
}
