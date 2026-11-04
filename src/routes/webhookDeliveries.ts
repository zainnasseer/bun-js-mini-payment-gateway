import { eq, desc, and, gte, lte } from "drizzle-orm";
import { getDb } from "../db/database";
import {
  merchantWebhookDeliveries,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENTS,
} from "../db/schema";
import { resolveAuthScope } from "../lib/authContext";
import {
  jsonOk,
  jsonError,
  jsonInternalError,
} from "../lib/http";

function parseDateFilter(value: string | null, endOfDay: boolean): string | null {
  if (!value?.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  return endOfDay ? `${value.trim()}T23:59:59.999Z` : `${value.trim()}T00:00:00.000Z`;
}

export async function listWebhookDeliveries(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const filterMerchantId = url.searchParams.get("merchant_id");
    const filterStatus = url.searchParams.get("status");
    const filterEvent = url.searchParams.get("event");
    const transactionId = url.searchParams.get("transaction_id");
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const fromIso = parseDateFilter(fromRaw, false);
    const toIso = parseDateFilter(toRaw, true);
    if (fromRaw && !fromIso) return jsonError("Invalid from date — use YYYY-MM-DD", 422);
    if (toRaw && !toIso) return jsonError("Invalid to date — use YYYY-MM-DD", 422);
    if (fromIso && toIso && fromIso > toIso) {
      return jsonError("`from` must be on or before `to`", 422);
    }

    if (
      filterStatus &&
      !WEBHOOK_DELIVERY_STATUSES.includes(
        filterStatus as (typeof WEBHOOK_DELIVERY_STATUSES)[number]
      )
    ) {
      return jsonError(
        `Invalid status. Must be one of: ${WEBHOOK_DELIVERY_STATUSES.join(", ")}`,
        422
      );
    }

    const scope = await resolveAuthScope(req);
    if (scope.kind === "merchant") {
      if (filterMerchantId && filterMerchantId !== scope.merchant.id) {
        return jsonError("Cannot list webhook deliveries for another merchant", 403);
      }
    }

    const merchantId =
      scope.kind === "merchant" ? scope.merchant.id : filterMerchantId ?? null;

    const conditions = [];
    if (merchantId) conditions.push(eq(merchantWebhookDeliveries.merchantId, merchantId));
    if (filterStatus) {
      conditions.push(
        eq(
          merchantWebhookDeliveries.status,
          filterStatus as (typeof WEBHOOK_DELIVERY_STATUSES)[number]
        )
      );
    }
    if (filterEvent) {
      if (!WEBHOOK_EVENTS.includes(filterEvent as (typeof WEBHOOK_EVENTS)[number])) {
        return jsonError(`Unknown event filter. Try: ${WEBHOOK_EVENTS.join(", ")}`, 422);
      }
      conditions.push(
        eq(merchantWebhookDeliveries.event, filterEvent as (typeof WEBHOOK_EVENTS)[number])
      );
    }
    if (transactionId) conditions.push(eq(merchantWebhookDeliveries.transactionId, transactionId));
    if (fromIso) conditions.push(gte(merchantWebhookDeliveries.createdAt, fromIso));
    if (toIso) conditions.push(lte(merchantWebhookDeliveries.createdAt, toIso));

    const deliveries = await getDb()
      .select()
      .from(merchantWebhookDeliveries)
      .where(
        conditions.length
          ? and(...(conditions as [typeof conditions[0], ...typeof conditions]))
          : undefined
      )
      .orderBy(desc(merchantWebhookDeliveries.createdAt))
      .limit(limit)
      .offset(offset);

    return jsonOk({ deliveries, limit, offset, count: deliveries.length });
  } catch (err) {
    return jsonInternalError(err);
  }
}
