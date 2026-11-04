/**
 * Domain types — derived from Drizzle schema.
 */

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  merchants,
  merchantWebhookDeliveries,
  transactions,
  TRANSACTION_STATUSES,
  CURRENCY_CODES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENTS,
} from "../db/schema";

export type Merchant = InferSelectModel<typeof merchants>;
export type NewMerchant = InferInsertModel<typeof merchants>;

export type MerchantResponse = Omit<Merchant, "ipWhitelist"> & { ipWhitelist: string[] };

export type Transaction = InferSelectModel<typeof transactions>;
export type NewTransaction = InferInsertModel<typeof transactions>;

export type WebhookDelivery = InferSelectModel<typeof merchantWebhookDeliveries>;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateMerchantPayload {
  name: string;
  email: string;
  webhook_url: string;
  phone_number: string;
  origin_header: string;
  ip_whitelist?: string[];
  api_key?: string;
  webhook_secret?: string;
}

export interface UpdateMerchantPayload {
  name?: string;
  email?: string;
  webhook_url?: string;
  phone_number?: string;
  origin_header?: string;
  ip_whitelist?: string[];
  api_key?: string;
  webhook_secret?: string;
}

export interface CurrencyVolumeBreakdown {
  currency: CurrencyCode;
  amountMinor: number;
  transactionCount: number;
}

export interface FilteredVolumeUsd {
  amountUsdMinor: number;
  currency: "USD";
  ratesAsOf: string;
  rateSource: string;
  byCurrency: CurrencyVolumeBreakdown[];
}

export interface TransactionListResponse {
  transactions: Transaction[];
  limit: number;
  offset: number;
  count: number;
  filteredVolume: FilteredVolumeUsd;
}

export interface CreateTransactionPayload {
  /** Required when using platform admin API key; ignored for merchant keys. */
  merchant_id?: string;
  amount: number;
  currency: CurrencyCode;
  description?: string;
  metadata?: Record<string, unknown>;
}
