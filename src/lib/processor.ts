import { eq, and } from "drizzle-orm";
import { getDb } from "../db/database";
import { transactions } from "../db/schema";

const DEFAULT_PROCESSOR_DELAY_MS = 3000;
const DEFAULT_SUCCESS_RATE       = 0.85;

const FAILURE_REASONS = [
  "Insufficient funds",
  "Card declined by issuer",
  "Do not honor",
  "Expired card",
  "Invalid card number",
];

export function submitToProcessor(transactionId: string): void {
  const delayMs     = Number(process.env.PROCESSOR_DELAY_MS     ?? DEFAULT_PROCESSOR_DELAY_MS);
  const successRate = Number(process.env.PROCESSOR_SUCCESS_RATE ?? DEFAULT_SUCCESS_RATE);

  setTimeout(async () => {
    try {
      const db = getDb();

      const record = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.status, "PENDING")))
        .get();

      if (!record) {
        console.log(`[Processor] ${transactionId} no longer PENDING — skipping.`);
        return;
      }

      const succeeded    = Math.random() < successRate;
      const newStatus    = succeeded ? "AUTHORIZED" : "FAILED";
      const processorRef = `proc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const failureReason = succeeded
        ? undefined
        : FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)];

      const existingMeta = record.metadata ? JSON.parse(record.metadata) : {};
      const updatedMeta  = JSON.stringify({
        ...existingMeta,
        processor: {
          reference:    processorRef,
          processed_at: new Date().toISOString(),
          ...(failureReason ? { failure_reason: failureReason } : {}),
        },
      });

      await db
        .update(transactions)
        .set({ status: newStatus, metadata: updatedMeta, updatedAt: new Date().toISOString() })
        .where(eq(transactions.id, transactionId));

      console.log(`[Processor] ${succeeded ? "✅" : "❌"} ${transactionId} → ${newStatus}`);
    } catch (err) {
      console.error(`[Processor] Failed to update ${transactionId}:`, err);
    }
  }, delayMs);
}
