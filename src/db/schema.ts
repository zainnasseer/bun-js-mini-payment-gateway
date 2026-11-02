/**
 * Drizzle ORM Schema — Payment Gateway
 * Driver: drizzle-orm/bun-sql (Bun.sql → PostgreSQL)
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const now = () => new Date().toISOString();

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

export const users = pgTable(
  "users",
  {
    id:        text("id").primaryKey(),
    email:     text("email").notNull().unique(),
    name:      text("name").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [index("idx_users_email").on(t.email)]
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id:          text("id").primaryKey(),
    userId:      text("user_id")
                   .notNull()
                   .references(() => users.id, { onDelete: "cascade" }),
    type:        text("type", { enum: PAYMENT_METHOD_TYPES }).notNull(),
    tokenId:     text("token_id").notNull().unique(),
    lastFour:    text("last_four").notNull(),
    expiryMonth: integer("expiry_month").notNull(),
    expiryYear:  integer("expiry_year").notNull(),
    isDefault:   boolean("is_default").notNull().default(false),
    createdAt:   text("created_at").notNull().$defaultFn(now),
    updatedAt:   text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [
    index("idx_pm_user_id").on(t.userId),
    uniqueIndex("idx_pm_token_id").on(t.tokenId),
  ]
);

export const transactions = pgTable(
  "transactions",
  {
    id:              text("id").primaryKey(),
    userId:          text("user_id")
                       .notNull()
                       .references(() => users.id),
    paymentMethodId: text("payment_method_id").references(() => paymentMethods.id, {
      onDelete: "set null",
    }),
    idempotencyKey:  text("idempotency_key").notNull().unique(),
    amount:          integer("amount").notNull(),
    currency:        text("currency", { enum: CURRENCY_CODES }).notNull(),
    status:          text("status", { enum: TRANSACTION_STATUSES })
                       .notNull()
                       .default("PENDING"),
    description:     text("description"),
    metadata:        text("metadata"),
    createdAt:       text("created_at").notNull().$defaultFn(now),
    updatedAt:       text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [
    index("idx_tx_user_id").on(t.userId),
    uniqueIndex("idx_tx_idempotency").on(t.idempotencyKey),
    index("idx_tx_status").on(t.status),
  ]
);

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
