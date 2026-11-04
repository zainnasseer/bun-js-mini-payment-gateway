import type { MerchantResponse, Transaction, TransactionStatus } from "../../src/types";
import { formatFilteredVolume, formatMoney } from "../lib/money";
import { Select } from "./Select";

const STATUSES: TransactionStatus[] = ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"];

export type TxFilters = {
  merchantId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
};

type Props = {
  merchants: MerchantResponse[];
  transactions: Transaction[];
  filters: TxFilters;
  onFiltersChange: (patch: Partial<TxFilters>) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  selectedTxId: string;
  onSelectTx: (id: string) => void;
  onPatchStatus: (status: TransactionStatus) => void;
  onRefund: () => void;
};

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
  filters,
  onFiltersChange,
  onApplyFilters,
  onClearFilters,
  selectedTxId,
  onSelectTx,
  onPatchStatus,
  onRefund,
}: Props) {
  const selectedTx = transactions.find((t) => t.id === selectedTxId);
  const capturedCount = transactions.filter((t) => t.status === "CAPTURED").length;
  const showMerchantColumn = !filters.merchantId;

  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Ledger</p>
        <h2>Transactions</h2>
        <p>Filter by merchant and date range. Platform view shows all merchants when no merchant is selected.</p>
      </header>

      <section className="tx-toolbar glass">
        <div className="tx-toolbar__head">
          <h3>Filters</h3>
          <div className="btn-row tx-toolbar__actions">
            <button type="button" className="btn primary sm" onClick={onApplyFilters}>
              Apply filters
            </button>
            <button type="button" className="btn sm" onClick={onClearFilters}>
              Clear
            </button>
          </div>
        </div>
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
        <div className="stat">
          <div className="stat-label">Volume (filtered)</div>
          <div className="stat-value stat-value--sm">{formatFilteredVolume(transactions)}</div>
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
          <div className="tx-list-panel__head">
            <h3>Results</h3>
            <span className="muted">{transactions.length} transaction(s)</span>
          </div>
          {transactions.length === 0 ? (
            <div className="tx-empty">
              <p>No transactions match these filters.</p>
              <p className="muted">Try widening the date range or choosing a different merchant.</p>
            </div>
          ) : (
            <div className="tx-list">
              {transactions.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  className={selectedTxId === tx.id ? "tx-card selected" : "tx-card"}
                  onClick={() => onSelectTx(tx.id)}
                >
                  <div className="tx-card__main">
                    <span className="tx-card__amount">{formatMoney(tx.amount, tx.currency)}</span>
                    <span className={`badge status-${tx.status.toLowerCase()}`}>{tx.status}</span>
                  </div>
                  <div className="tx-card__meta">
                    {showMerchantColumn && <span>{merchantName(merchants, tx.merchantId)}</span>}
                    <time dateTime={tx.createdAt}>{formatWhen(tx.createdAt)}</time>
                  </div>
                  {tx.description && <p className="tx-card__desc">{tx.description}</p>}
                  <code className="mono tx-card__id">{tx.id}</code>
                </button>
              ))}
            </div>
          )}
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
