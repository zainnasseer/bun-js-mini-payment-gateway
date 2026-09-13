/**
 * Domain types — derived from Drizzle schema via InferSelectModel / InferInsertModel.
 *
 * This file is the single source of truth for all type shapes.
 * Never hand-write interface { id: string; ... } — always infer from the schema.
 * If a column is added/removed/renamed in schema.ts, these types update automatically.
 */

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  users,
  paymentMethods,
  transactions,
  PAYMENT_METHOD_TYPES,
  TRANSACTION_STATUSES,
  CURRENCY_CODES,
} from "../db/schema";

// ─── Domain model types ───────────────────────────────────────────────────────

/** A row selected from the `users` table. */
export type User = InferSelectModel<typeof users>;

/** A row to be inserted into the `users` table. */
export type NewUser = InferInsertModel<typeof users>;

/**
 * A row selected from the `payment_methods` table.
 *
 * PCI-DSS: only `tokenId` is stored — never raw PAN or CVV.
 */
export type PaymentMethod = InferSelectModel<typeof paymentMethods>;

/** A row to be inserted into the `payment_methods` table. */
export type NewPaymentMethod = InferInsertModel<typeof paymentMethods>;

/** A row selected from the `transactions` table. */
export type Transaction = InferSelectModel<typeof transactions>;

/** A row to be inserted into the `transactions` table. */
export type NewTransaction = InferInsertModel<typeof transactions>;

// ─── Enum union types (derived from schema const tuples) ─────────────────────

export type PaymentMethodType  = (typeof PAYMENT_METHOD_TYPES)[number];
export type TransactionStatus  = (typeof TRANSACTION_STATUSES)[number];
export type CurrencyCode       = (typeof CURRENCY_CODES)[number];

// ─── API request payload shapes ───────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateUserPayload {
  email: string;
  name: string;
}

/**
 * PCI-DSS reminder: `token_id` must be the opaque token from the client-side
 * tokenization provider. Raw PANs / CVVs must never reach this API.
 */
export interface CreatePaymentMethodPayload {
  user_id: string;
  type: PaymentMethodType;
  token_id: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  is_default?: boolean;
}

export interface CreateTransactionPayload {
  user_id: string;
  payment_method_id: string;
  /** Must be a positive integer in the smallest currency unit (e.g. cents for USD). */
  amount: number;
  currency: CurrencyCode;
  description?: string;
  metadata?: Record<string, unknown>;
}
