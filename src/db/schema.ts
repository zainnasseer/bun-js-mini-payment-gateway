/**
 * Drizzle ORM Schema — Payment Gateway (merchant-centric)
 */

import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const now = () => new Date().toISOString();

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

export const WEBHOOK_DELIVERY_STATUSES = ["PENDING", "DELIVERED", "FAILED"] as const;

export const CONSOLE_ADMIN_ROLES = ["owner", "admin"] as const;

export const WEBHOOK_EVENTS = [
  "transaction.created",
  "transaction.authorized",
  "transaction.captured",
  "transaction.failed",
  "transaction.refunded",
  "transaction.status_updated",
] as const;

export const consoleAdmins = pgTable(
  "console_admins",
  {
    id:           text("id").primaryKey(),
    username:     text("username").notNull().unique(),
    email:        text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role:         text("role", { enum: CONSOLE_ADMIN_ROLES }).notNull().default("admin"),
    createdAt:    text("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("idx_console_admins_username").on(t.username),
    uniqueIndex("idx_console_admins_email").on(t.email),
  ]
);

export const consolePasswordChallenges = pgTable(
  "console_password_challenges",
  {
    id:              text("id").primaryKey(),
    adminId:         text("admin_id")
                       .notNull()
                       .references(() => consoleAdmins.id, { onDelete: "cascade" }),
    codeHash:        text("code_hash").notNull(),
    newPasswordHash: text("new_password_hash").notNull(),
    expiresAt:       text("expires_at").notNull(),
    createdAt:       text("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("idx_pwd_challenge_admin").on(t.adminId),
    index("idx_pwd_challenge_expires").on(t.expiresAt),
  ]
);

export const merchants = pgTable(
  "merchants",
  {
    id:            text("id").primaryKey(),
    name:          text("name").notNull(),
    email:         text("email").notNull().unique(),
    webhookUrl:    text("webhook_url").notNull(),
    phoneNumber:   text("phone_number").notNull(),
    originHeader:  text("origin_header").notNull(),
    ipWhitelist:   text("ip_whitelist").notNull().default("[]"),
    apiKey:        text("api_key").notNull().unique(),
    webhookSecret: text("webhook_secret").notNull(),
    createdAt:     text("created_at").notNull().$defaultFn(now),
    updatedAt:     text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [
    index("idx_merchants_email").on(t.email),
    uniqueIndex("idx_merchants_api_key").on(t.apiKey),
  ]
);

export const transactions = pgTable(
  "transactions",
  {
    id:             text("id").primaryKey(),
    merchantId:     text("merchant_id")
                      .notNull()
                      .references(() => merchants.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    amount:         integer("amount").notNull(),
    currency:       text("currency", { enum: CURRENCY_CODES }).notNull(),
    status:         text("status", { enum: TRANSACTION_STATUSES })
                      .notNull()
                      .default("PENDING"),
    description:    text("description"),
    metadata:       text("metadata"),
    createdAt:      text("created_at").notNull().$defaultFn(now),
    updatedAt:      text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [
    index("idx_tx_merchant_id").on(t.merchantId),
    uniqueIndex("idx_tx_idempotency").on(t.idempotencyKey),
    index("idx_tx_status").on(t.status),
  ]
);

export const merchantWebhookDeliveries = pgTable(
  "merchant_webhook_deliveries",
  {
    id:              text("id").primaryKey(),
    merchantId:      text("merchant_id")
                       .notNull()
                       .references(() => merchants.id, { onDelete: "cascade" }),
    transactionId:   text("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    event:           text("event", { enum: WEBHOOK_EVENTS }).notNull(),
    targetUrl:       text("target_url").notNull(),
    payload:         text("payload").notNull(),
    status:          text("status", { enum: WEBHOOK_DELIVERY_STATUSES })
                       .notNull()
                       .default("PENDING"),
    httpStatus:      integer("http_status"),
    responseExcerpt: text("response_excerpt"),
    errorMessage:    text("error_message"),
    createdAt:       text("created_at").notNull().$defaultFn(now),
    deliveredAt:     text("delivered_at"),
  },
  (t) => [
    index("idx_wh_del_merchant").on(t.merchantId),
    index("idx_wh_del_status").on(t.status),
    index("idx_wh_del_created").on(t.createdAt),
    index("idx_wh_del_tx").on(t.transactionId),
  ]
);

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [transactions.merchantId],
    references: [merchants.id],
  }),
  webhookDeliveries: many(merchantWebhookDeliveries),
}));

export const merchantsRelations = relations(merchants, ({ many }) => ({
  transactions: many(transactions),
  webhookDeliveries: many(merchantWebhookDeliveries),
}));

export const merchantWebhookDeliveriesRelations = relations(merchantWebhookDeliveries, ({ one }) => ({
  merchant: one(merchants, {
    fields: [merchantWebhookDeliveries.merchantId],
    references: [merchants.id],
  }),
  transaction: one(transactions, {
    fields: [merchantWebhookDeliveries.transactionId],
    references: [transactions.id],
  }),
}));
