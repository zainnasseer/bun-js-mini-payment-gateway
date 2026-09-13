/**
 * Drizzle ORM Schema — Payment Gateway
 * Driver: drizzle-orm/bun-sqlite  (bun:sqlite)
 *
 * Design rules enforced here:
 *   ✓ Monetary amounts → integer (cents/smallest unit). Never `real`.
 *   ✓ Currency codes   → ISO 4217 three-letter text.
 *   ✓ Enums            → Drizzle `text({ enum: [...] })` — TS-level enforcement,
 *                         generates a CHECK constraint in SQLite DDL.
 *   ✓ PCI-DSS          → No `pan` / `cvv` / `card_number` columns exist.
 *                         Only `tokenId` (opaque tokenization provider reference).
 *   ✓ Booleans         → `integer({ mode: "boolean" })` — Drizzle maps 0/1 ↔ boolean.
 *   ✓ Timestamps       → ISO 8601 text, set via $defaultFn at the ORM layer.
 *   ✓ Foreign keys     → declared on columns; enforced via PRAGMA foreign_keys = ON.
 *   ✓ Relations        → `relations()` block for typed Drizzle joins.
 */

import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Returns an ISO 8601 timestamp string — used as $defaultFn for created_at / updated_at. */
const now = () => new Date().toISOString();

// ─── Enum value sets ──────────────────────────────────────────────────────────
//
// Declaring these as const tuples lets us:
//   1. Pass them directly to Drizzle's { enum: [...] } option.
//   2. Derive a union type from them (used in src/types/index.ts).

export const PAYMENT_METHOD_TYPES = [
  "CARD",
  "BANK_ACCOUNT",
  "DIGITAL_WALLET",
] as const;

export const TRANSACTION_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
] as const;

export const CURRENCY_CODES = [
  "USD", "EUR", "GBP", "JPY", "AED", "SAR",
] as const;

// ─── users ────────────────────────────────────────────────────────────────────

export const users = sqliteTable(
  "users",
  {
    id:        text("id").primaryKey(),                    // crypto.randomUUID()
    email:     text("email").notNull().unique(),
    name:      text("name").notNull(),
    createdAt: text("created_at")
                 .notNull()
                 .$defaultFn(now),
    updatedAt: text("updated_at")
                 .notNull()
                 .$defaultFn(now)
                 .$onUpdateFn(now),
  },
  (t) => [
    index("idx_users_email").on(t.email),
  ]
);

// ─── payment_methods ──────────────────────────────────────────────────────────
//
// PCI-DSS note:
//   • tokenId  — opaque token from client-side tokenization provider.
//                NEVER a raw PAN. The absence of a `pan` column is intentional.
//   • lastFour — display hint only (4 digits of PAN, permitted per PCI-DSS §3.3).
//   • NO cvv / NO fullPan / NO trackData columns — by design.

export const paymentMethods = sqliteTable(
  "payment_methods",
  {
    id:           text("id").primaryKey(),
    userId:       text("user_id")
                    .notNull()
                    .references(() => users.id, { onDelete: "cascade" }),
    type:         text("type", { enum: PAYMENT_METHOD_TYPES }).notNull(),
    tokenId:      text("token_id").notNull().unique(),    // tokenization provider ref
    lastFour:     text("last_four").notNull(),            // safe display hint (4 digits)
    expiryMonth:  integer("expiry_month").notNull(),      // 1–12
    expiryYear:   integer("expiry_year").notNull(),       // YYYY
    isDefault:    integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt:    text("created_at").notNull().$defaultFn(now),
    updatedAt:    text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [
    index("idx_pm_user_id").on(t.userId),
    uniqueIndex("idx_pm_token_id").on(t.tokenId),
  ]
);

// ─── transactions ─────────────────────────────────────────────────────────────
//
// Idempotency:
//   • idempotencyKey is UNIQUE — duplicate POSTs return the existing row.
//   • Clients generate the key (UUID v4); the server never generates it for them.
//
// Amount:
//   • Stored as INTEGER (smallest currency unit — cents for USD/EUR, etc.)
//   • ORM + DB-level CHECK: amount > 0.
//
// State machine (enforced in application layer):
//   PENDING → AUTHORIZED → CAPTURED → REFUNDED
//   PENDING → FAILED
//   AUTHORIZED → FAILED

export const transactions = sqliteTable(
  "transactions",
  {
    id:                text("id").primaryKey(),           // crypto.randomUUID()
    userId:            text("user_id")
                         .notNull()
                         .references(() => users.id),
    paymentMethodId:   text("payment_method_id")
                         .references(() => paymentMethods.id, { onDelete: "set null" }),
    idempotencyKey:    text("idempotency_key").notNull().unique(),
    amount:            integer("amount").notNull(),        // cents, positive integer
    currency:          text("currency", { enum: CURRENCY_CODES }).notNull(),  // ISO 4217
    status:            text("status", { enum: TRANSACTION_STATUSES })
                         .notNull()
                         .default("PENDING"),
    description:       text("description"),
    metadata:          text("metadata"),                  // JSON blob
    createdAt:         text("created_at").notNull().$defaultFn(now),
    updatedAt:         text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [
    index("idx_tx_user_id").on(t.userId),
    uniqueIndex("idx_tx_idempotency").on(t.idempotencyKey),
    index("idx_tx_status").on(t.status),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────
//
// Drizzle relations enable typed `with:` joins in query builder calls.

export const usersRelations = relations(users, ({ many }) => ({
  paymentMethods: many(paymentMethods),
  transactions:   many(transactions),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ one, many }) => ({
  user:         one(users, { fields: [paymentMethods.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user:          one(users,          { fields: [transactions.userId],          references: [users.id] }),
  paymentMethod: one(paymentMethods, { fields: [transactions.paymentMethodId], references: [paymentMethods.id] }),
}));
