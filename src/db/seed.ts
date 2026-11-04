/**
 * Demo seed — merchants (if needed) + 50 sample transactions.
 * Safe to re-run: skips existing demo merchants by email; always inserts 50 new txs.
 *
 *   bun run db:seed
 */

import { eq } from "drizzle-orm";
import { getDb, initSchema } from "./database";
import { merchants, transactions, CURRENCY_CODES, TRANSACTION_STATUSES } from "./schema";
import { generateId, generateIdempotencyKey, generateSecureToken } from "../lib/crypto";
import { firstRow } from "../lib/dbQuery";

const DEMO_MERCHANTS = [
  {
    name: "Northwind Checkout",
    email: "demo-northwind@seed.local",
    webhookUrl: "https://northwind.example/webhooks",
    phoneNumber: "+1-555-1001",
    originHeader: "https://checkout.northwind.example",
  },
  {
    name: "Atlas Pay",
    email: "demo-atlas@seed.local",
    webhookUrl: "https://atlas.example/hooks/payments",
    phoneNumber: "+1-555-1002",
    originHeader: "https://pay.atlas.example",
  },
  {
    name: "Summit Commerce",
    email: "demo-summit@seed.local",
    webhookUrl: "https://summit.example/api/webhook",
    phoneNumber: "+44-20-7946-0958",
    originHeader: "https://shop.summit.example",
  },
  {
    name: "Cedar Subscriptions",
    email: "demo-cedar@seed.local",
    webhookUrl: "https://cedar.example/events",
    phoneNumber: "+971-4-555-0100",
    originHeader: "https://billing.cedar.example",
  },
] as const;

const DESCRIPTIONS = [
  "Subscription renewal",
  "One-time purchase",
  "Invoice #1042",
  "Marketplace order",
  "Top-up wallet",
  "Annual plan",
  "Add-on seats",
  "Express shipping fee",
  "Digital goods",
  "POS terminal sale",
];

const STATUS_WEIGHTS: (typeof TRANSACTION_STATUSES)[number][] = [
  "CAPTURED",
  "CAPTURED",
  "CAPTURED",
  "AUTHORIZED",
  "PENDING",
  "FAILED",
  "REFUNDED",
];

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

function randomCreatedAt(index: number): string {
  const daysBack = (index * 3 + 7) % 55;
  const hour = (index * 5) % 24;
  const minute = (index * 11) % 60;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function ensureDemoMerchants(): Promise<string[]> {
  const db = getDb();
  const ids: string[] = [];

  for (const demo of DEMO_MERCHANTS) {
    const existing = await firstRow(
      db.select({ id: merchants.id }).from(merchants).where(eq(merchants.email, demo.email)).limit(1)
    );
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const id = generateId();
    await db.insert(merchants).values({
      id,
      name: demo.name,
      email: demo.email,
      webhookUrl: demo.webhookUrl,
      phoneNumber: demo.phoneNumber,
      originHeader: demo.originHeader,
      ipWhitelist: "[]",
      apiKey: generateSecureToken(32),
      webhookSecret: generateSecureToken(32),
    });
    ids.push(id);
  }

  const all = await db.select({ id: merchants.id }).from(merchants);
  return all.map((m) => m.id);
}

async function seedTransactions(merchantIds: string[], count: number): Promise<number> {
  const db = getDb();
  const rows = [];

  for (let i = 0; i < count; i++) {
    const merchantId = pick(merchantIds, i);
    const amount = 499 + (i * 137) % 25000;
    const currency = pick(CURRENCY_CODES, i);
    const status = pick(STATUS_WEIGHTS, i);
    const createdAt = randomCreatedAt(i);

    rows.push({
      id: generateId(),
      merchantId,
      idempotencyKey: generateIdempotencyKey(),
      amount,
      currency,
      status,
      description: pick(DESCRIPTIONS, i),
      metadata: null,
      createdAt,
      updatedAt: createdAt,
    });
  }

  await db.insert(transactions).values(rows);
  return rows.length;
}

async function main(): Promise<void> {
  await initSchema();
  const merchantIds = await ensureDemoMerchants();
  if (merchantIds.length === 0) {
    throw new Error("No merchants available to attach transactions to");
  }

  const inserted = await seedTransactions(merchantIds, 50);
  console.log(`✅ Seeded ${inserted} demo transactions across ${merchantIds.length} merchant(s)`);
  console.log("   Open the Transactions tab (All merchants) to browse and filter.");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}
