import type { ReactNode } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { CollapsibleTxCard } from "./CollapsibleTxCard";
import { LazyList } from "./LazyList";
import { Select } from "./Select";

const WH_LIST_INITIAL = 4;
const WH_LIST_STEP = 12;
import type {
  MerchantResponse,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEvent,
} from "../../src/types";

const DELIVERY_STATUSES: WebhookDeliveryStatus[] = ["PENDING", "DELIVERED", "FAILED"];

const WEBHOOK_EVENTS: WebhookEvent[] = [
  "transaction.created",
  "transaction.authorized",
  "transaction.captured",
  "transaction.failed",
  "transaction.refunded",
  "transaction.status_updated",
];

export type WhFilters = {
  merchantId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  event: string;
};

type Props = {
  merchants: MerchantResponse[];
  deliveries: WebhookDelivery[];
  filters: WhFilters;
  onFiltersChange: (patch: Partial<WhFilters>) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  selectedId: string;
  onSelect: (id: string) => void;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function merchantName(merchants: MerchantResponse[], id: string): string {
  return merchants.find((m) => m.id === id)?.name ?? id.slice(0, 8) + "…";
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wh-detail-row">
      <span className="wh-detail-label">{label}</span>
      <div className="wh-detail-value">{children}</div>
    </div>
  );
}

function formatPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function statusClass(status: WebhookDeliveryStatus): string {
  switch (status) {
    case "DELIVERED":
      return "wh-status wh-status--ok";
    case "FAILED":
      return "wh-status wh-status--fail";
    default:
      return "wh-status wh-status--pending";
  }
}

export function WebhooksView({
  merchants,
  deliveries,
  filters,
  onFiltersChange,
  onApplyFilters,
  onClearFilters,
  selectedId,
  onSelect,
}: Props) {
  const selected = deliveries.find((d) => d.id === selectedId);
  const delivered = deliveries.filter((d) => d.status === "DELIVERED").length;
  const failed = deliveries.filter((d) => d.status === "FAILED").length;

  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Delivery log</p>
        <h2>Webhooks</h2>
        <p>
          Every notification POSTed to a merchant&apos;s webhook URL is logged here with delivery
          status, HTTP code, and payload.
        </p>
      </header>

      <section className="tx-toolbar glass">
        <CollapsibleSection
          variant="inline-head"
          title="Filters"
          defaultOpen
          actions={
            <div className="btn-row tx-toolbar__actions">
              <button type="button" className="btn primary sm" onClick={onApplyFilters}>
                Apply filters
              </button>
              <button type="button" className="btn sm" onClick={onClearFilters}>
                Clear
              </button>
            </div>
          }
        >
        <div className="tx-filters wh-filters">
          <label>
            Merchant
            <Select
              value={filters.merchantId}
              onValueChange={(merchantId) => onFiltersChange({ merchantId })}
              placeholder="All merchants"
              options={[
                { value: "", label: "All merchants" },
                ...merchants.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </label>
          <label>
            From date
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onFiltersChange({ dateFrom: e.target.value })}
            />
          </label>
          <label>
            To date
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onFiltersChange({ dateTo: e.target.value })}
            />
          </label>
          <label>
            Delivery status
            <Select
              value={filters.status}
              onValueChange={(status) => onFiltersChange({ status })}
              placeholder="Any status"
              options={[
                { value: "", label: "Any status" },
                ...DELIVERY_STATUSES.map((s) => ({ value: s, label: s })),
              ]}
            />
          </label>
          <label>
            Event
            <Select
              value={filters.event}
              onValueChange={(event) => onFiltersChange({ event })}
              placeholder="Any event"
              options={[
                { value: "", label: "Any event" },
                ...WEBHOOK_EVENTS.map((ev) => ({ value: ev, label: ev })),
              ]}
            />
          </label>
        </div>
        </CollapsibleSection>
      </section>

      <div className="stats">
        <div className="stat stat--accent">
          <div className="stat-label">Showing</div>
          <div className="stat-value">{deliveries.length}</div>
        </div>
        <div className="stat stat--success">
          <div className="stat-label">Delivered</div>
          <div className="stat-value">{delivered}</div>
        </div>
        <div className="stat stat--danger">
          <div className="stat-label">Failed</div>
          <div className="stat-value">{failed}</div>
        </div>
      </div>

      <div className={`wh-layout${selected ? " wh-layout--with-detail" : ""}`}>
        <section className="glass tx-list-panel">
          <CollapsibleSection title="Delivery log" count={deliveries.length} defaultOpen>
          {deliveries.length === 0 ? (
            <div className="tx-empty">
              <p>No webhook deliveries match these filters.</p>
              <p className="muted">Run bun run db:seed-webhooks or create transactions to generate logs.</p>
            </div>
          ) : (
            <LazyList
              items={deliveries}
              initialCount={WH_LIST_INITIAL}
              step={WH_LIST_STEP}
              className="tx-list"
              getKey={(d) => d.id}
              renderItem={(d) => (
                <CollapsibleTxCard
                  selected={selectedId === d.id}
                  onSelect={() => onSelect(d.id)}
                  summary={
                    <>
                      <span className="wh-event">{d.event}</span>
                      <span className={statusClass(d.status as WebhookDeliveryStatus)}>{d.status}</span>
                    </>
                  }
                >
                  <div className="tx-card__meta">
                    <span>{merchantName(merchants, d.merchantId)}</span>
                    <time dateTime={d.createdAt}>{formatWhen(d.createdAt)}</time>
                    {d.httpStatus != null && <span>HTTP {d.httpStatus}</span>}
                  </div>
                  <p className="wh-url muted">{d.targetUrl}</p>
                </CollapsibleTxCard>
              )}
            />
          )}
          </CollapsibleSection>
        </section>

        {selected && (
          <aside className="glass wh-detail">
            <h3>Delivery detail</h3>
            <div className="wh-detail-grid">
              <DetailRow label="Delivery ID">
                <code className="mono wh-copy">{selected.id}</code>
              </DetailRow>
              <DetailRow label="Status">
                <span className={statusClass(selected.status as WebhookDeliveryStatus)}>
                  {selected.status}
                </span>
              </DetailRow>
              <DetailRow label="Event">
                <code className="mono">{selected.event}</code>
              </DetailRow>
              <DetailRow label="Merchant">
                {merchantName(merchants, selected.merchantId)}
                <code className="mono wh-copy wh-sub">{selected.merchantId}</code>
              </DetailRow>
              <DetailRow label="Target URL">
                <code className="mono wh-url-break">{selected.targetUrl}</code>
              </DetailRow>
              <DetailRow label="Created">
                <time dateTime={selected.createdAt}>{formatWhen(selected.createdAt)}</time>
                <code className="mono wh-sub">{selected.createdAt}</code>
              </DetailRow>
              {selected.deliveredAt && (
                <DetailRow label="Delivered">
                  <time dateTime={selected.deliveredAt}>{formatWhen(selected.deliveredAt)}</time>
                  <code className="mono wh-sub">{selected.deliveredAt}</code>
                </DetailRow>
              )}
              {selected.transactionId && (
                <DetailRow label="Transaction ID">
                  <code className="mono wh-copy">{selected.transactionId}</code>
                </DetailRow>
              )}
              {selected.httpStatus != null && (
                <DetailRow label="HTTP status">{String(selected.httpStatus)}</DetailRow>
              )}
              {selected.errorMessage && (
                <DetailRow label="Error">
                  <span className="wh-error">{selected.errorMessage}</span>
                </DetailRow>
              )}
            </div>

            {selected.responseExcerpt && (
              <div className="wh-detail-block">
                <h4>Response excerpt</h4>
                <pre className="json-block json-block--detail">{selected.responseExcerpt}</pre>
              </div>
            )}

            <div className="wh-detail-block">
              <h4>Request payload</h4>
              <pre className="json-block json-block--detail">{formatPayload(selected.payload)}</pre>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
