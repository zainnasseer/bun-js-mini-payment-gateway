import { useId, useState } from "react";
import type { FilteredVolumeUsd, MerchantResponse, Transaction, TransactionStatus } from "../../src/types";
import { formatFilteredVolumeUsd, formatFxRateSourceTag, formatMoney } from "../lib/money";
import { CollapsibleSection } from "./CollapsibleSection";
import { CollapsibleTxCard } from "./CollapsibleTxCard";
import { LazyList } from "./LazyList";
import { Select } from "./Select";

const STATUSES: TransactionStatus[] = ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"];
const TX_LIST_INITIAL = 4;
const TX_LIST_STEP = 12;

export type TxFilters = {
  merchantId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
};

type Props = {
  merchants: MerchantResponse[];
  transactions: Transaction[];
  filteredVolumeUsd: FilteredVolumeUsd | null;
  filters: TxFilters;
  onFiltersChange: (patch: Partial<TxFilters>) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  selectedTxId: string;
  focusedTransaction: Transaction | null;
  lookupActive: boolean;
  onSelectTx: (id: string) => void;
  onLookupById: (id: string) => Promise<string | null>;
  onClearLookup: () => void;
  onPatchStatus: (status: TransactionStatus) => void;
  onRefund: () => void;
};

function formatMetadata(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function merchantName(merchants: MerchantResponse[], id: string): string {
  return merchants.find((m) => m.id === id)?.name ?? id.slice(0, 8) + "…";
}

export function TransactionsView({
  merchants,
  transactions,
  filteredVolumeUsd,
  filters,
  onFiltersChange,
  onApplyFilters,
  onClearFilters,
  selectedTxId,
  focusedTransaction,
  lookupActive,
  onSelectTx,
  onLookupById,
  onClearLookup,
  onPatchStatus,
  onRefund,
}: Props) {
  const selectedTx = focusedTransaction;
  const [searchTxId, setSearchTxId] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const capturedCount = transactions.filter((t) => t.status === "CAPTURED").length;
  const showMerchantColumn = !filters.merchantId;
  const [volumeExpanded, setVolumeExpanded] = useState(false);
  const volumeBreakdownId = useId();
  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Ledger</p>
        <h2>Transactions</h2>
        <p>Filter by merchant and date range. Platform view shows all merchants when no merchant is selected.</p>
      </header>

      <section className="glass tx-lookup">
        <h3 className="tx-lookup__title">Look up by ID</h3>
        <p className="muted tx-lookup__hint">Paste a transaction UUID to load full details from the API.</p>
        <form
          className="tx-lookup__form"
          onSubmit={(e) => {
            e.preventDefault();
            setSearchError(null);
            setSearchBusy(true);
            void onLookupById(searchTxId).then((err) => {
              setSearchBusy(false);
              if (err) setSearchError(err);
            });
          }}
        >
          <label className="tx-lookup__field">
            Transaction ID
            <input
              value={searchTxId}
              onChange={(e) => setSearchTxId(e.target.value)}
              placeholder="319eb235-5ba2-4914-92e2-315f67a283f0"
              className="mono"
              spellCheck={false}
            />
          </label>
          <div className="btn-row tx-lookup__actions">
            <button type="submit" className="btn primary sm" disabled={searchBusy}>
              {searchBusy ? "Searching…" : "Search"}
            </button>
            {(lookupActive || searchTxId) && (
              <button
                type="button"
                className="btn sm"
                disabled={searchBusy}
                onClick={() => {
                  setSearchTxId("");
                  setSearchError(null);
                  onClearLookup();
                }}
              >
                Clear
              </button>
            )}
          </div>
        </form>
        {searchError && <p className="login-error">{searchError}</p>}
        {lookupActive && selectedTx && (
          <p className="login-success">Showing transaction loaded by ID search.</p>
        )}
      </section>

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
        <div className="tx-filters">
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
            Status
            <Select
              value={filters.status}
              onValueChange={(status) => onFiltersChange({ status })}
              placeholder="Any status"
              options={[
                { value: "", label: "Any status" },
                ...STATUSES.map((s) => ({ value: s, label: s })),
              ]}
            />
          </label>
        </div>
        </CollapsibleSection>
      </section>

      <div className="stats">
        <div className="stat stat--accent">
          <div className="stat-label">Showing</div>
          <div className="stat-value">{transactions.length}</div>
        </div>
        <div className="stat stat--success">
          <div className="stat-label">Captured</div>
          <div className="stat-value">{capturedCount}</div>
        </div>
        <div className={`stat stat--expandable${volumeExpanded ? " stat--expanded" : ""}`}>
          <button
            type="button"
            className="stat-expand-trigger"
            aria-expanded={volumeExpanded}
            aria-controls={volumeBreakdownId}
            title={
              filteredVolumeUsd
                ? `FX as of ${filteredVolumeUsd.ratesAsOf} (${filteredVolumeUsd.rateSource}). Click for totals by currency.`
                : "Click for totals by currency."
            }
            onClick={() => setVolumeExpanded((open) => !open)}
          >
            <div className="stat-label">Volume (filtered)</div>
            <div className="stat-value stat-value--sm">{formatFilteredVolumeUsd(filteredVolumeUsd)}</div>
            {filteredVolumeUsd ? (
              <span
                className="volume-fx-tag"
                title={`FX rates as of ${filteredVolumeUsd.ratesAsOf} · ${filteredVolumeUsd.rateSource}`}
              >
                {formatFxRateSourceTag(filteredVolumeUsd.rateSource)}
              </span>
            ) : null}
            <span className="stat-expand-chevron" aria-hidden />
          </button>
          {volumeExpanded && (
            <div className="volume-breakdown" id={volumeBreakdownId}>
              {!filteredVolumeUsd?.byCurrency?.length ? (
                <p className="muted volume-breakdown__empty">No volume in this filter.</p>
              ) : (
                <ul className="volume-breakdown__list">
                  {filteredVolumeUsd.byCurrency.map((row) => (
                    <li key={row.currency}>
                      <span className="volume-breakdown__amount">{formatMoney(row.amountMinor, row.currency)}</span>
                      <span className="muted volume-breakdown__meta">
                        {row.currency} · {row.transactionCount} tx
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="stat">
          <div className="stat-label">Scope</div>
          <div className="stat-value stat-value--sm">
            {filters.merchantId ? merchantName(merchants, filters.merchantId) : "All merchants"}
          </div>
        </div>
      </div>

      <div className={`tx-layout${selectedTx ? " tx-layout--with-detail" : ""}`}>
        <section className="glass tx-list-panel">
          <CollapsibleSection title="Results" count={transactions.length} defaultOpen>
          {transactions.length === 0 ? (
            <div className="tx-empty">
              <p>No transactions match these filters.</p>
              <p className="muted">Try widening the date range or choosing a different merchant.</p>
            </div>
          ) : (
            <LazyList
              items={transactions}
              initialCount={TX_LIST_INITIAL}
              step={TX_LIST_STEP}
              className="tx-list"
              getKey={(tx) => tx.id}
              renderItem={(tx) => (
                <CollapsibleTxCard
                  selected={selectedTxId === tx.id}
                  onSelect={() => onSelectTx(tx.id)}
                  summary={
                    <>
                      <span className="tx-card__amount">{formatMoney(tx.amount, tx.currency)}</span>
                      <span className={`badge status-${tx.status.toLowerCase()}`}>{tx.status}</span>
                    </>
                  }
                >
                  <div className="tx-card__meta">
                    {showMerchantColumn && <span>{merchantName(merchants, tx.merchantId)}</span>}
                    <time dateTime={tx.createdAt}>{formatWhen(tx.createdAt)}</time>
                  </div>
                  {tx.description && <p className="tx-card__desc">{tx.description}</p>}
                  <code className="mono tx-card__id">{tx.id}</code>
                </CollapsibleTxCard>
              )}
            />
          )}
          </CollapsibleSection>
        </section>

        {selectedTx && (
          <aside className="glass tx-side">
            <h3>Transaction detail</h3>
            <p className="mono tx-detail-id">{selectedTx.id}</p>
            <div className="tx-side__amount">{formatMoney(selectedTx.amount, selectedTx.currency)}</div>
            <p>
              <span className={`badge status-${selectedTx.status.toLowerCase()}`}>
                {selectedTx.status}
              </span>
            </p>
            <p className="muted tx-side__meta">
              {merchantName(merchants, selectedTx.merchantId)} ·{" "}
              <time dateTime={selectedTx.createdAt}>{formatWhen(selectedTx.createdAt)}</time>
            </p>
            {selectedTx.description && <p className="tx-card__desc">{selectedTx.description}</p>}
            <dl className="tx-detail-dl">
              <div>
                <dt>Merchant</dt>
                <dd>{merchantName(merchants, selectedTx.merchantId)}</dd>
              </div>
              <div>
                <dt>Merchant ID</dt>
                <dd>
                  <code className="mono tx-detail-id">{selectedTx.merchantId}</code>
                </dd>
              </div>
              <div>
                <dt>Idempotency key</dt>
                <dd>
                  <code className="mono tx-detail-id">{selectedTx.idempotencyKey}</code>
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>
                  <time dateTime={selectedTx.createdAt}>{formatWhen(selectedTx.createdAt)}</time>
                </dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>
                  <time dateTime={selectedTx.updatedAt}>{formatWhen(selectedTx.updatedAt)}</time>
                </dd>
              </div>
            </dl>
            {formatMetadata(selectedTx.metadata) && (
              <div className="tx-detail-block">
                <h4 className="section-label">Metadata</h4>
                <pre className="json-block json-block--detail">{formatMetadata(selectedTx.metadata)}</pre>
              </div>
            )}
            <div className="tx-detail-block">
              <h4 className="section-label">Actions</h4>
              <div className="btn-row">
                <button type="button" className="btn sm" onClick={() => onPatchStatus("AUTHORIZED")}>
                  Authorize
                </button>
                <button type="button" className="btn sm primary" onClick={() => onPatchStatus("CAPTURED")}>
                  Capture
                </button>
                <button type="button" className="btn sm" onClick={() => onPatchStatus("FAILED")}>
                  Fail
                </button>
                <button type="button" className="btn sm danger" onClick={onRefund}>
                  Refund
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
