import type { ApiCallResult } from "../lib/api";
import { CollapsibleSection } from "./CollapsibleSection";
import { LazyList } from "./LazyList";
import { IconTerminal } from "./icons";

type Props = {
  result: ApiCallResult | null;
  history: ApiCallResult[];
  onSelect: (item: ApiCallResult) => void;
};

const DEFAULT_VISIBLE_HISTORY = 2;
const HISTORY_MORE_INITIAL = 4;
const HISTORY_MORE_STEP = 8;

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "status-ok";
  if (status >= 400 && status < 500) return "status-client";
  if (status >= 500) return "status-server";
  return "status-other";
}

function HistoryList({
  items,
  onSelect,
}: {
  items: ApiCallResult[];
  onSelect: (item: ApiCallResult) => void;
}) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={`${item.meta.path}-${item.status}-${i}`}>
          <button type="button" className="history-btn" onClick={() => onSelect(item)}>
            <span className={`dot ${statusClass(item.status)}`} />
            <span>
              {item.meta.method} {item.meta.path}
            </span>
            <span className="muted">{item.status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ResponsePanel({ result, history, onSelect }: Props) {
  const active = result;
  return (
    <aside className="response-panel">
      <header className="response-panel__header">
        <div className="response-panel__title">
          <span className="response-panel__icon">
            <IconTerminal />
          </span>
          <div>
            <h2>API inspector</h2>
            <p className="muted">Live status, envelope, and raw JSON</p>
          </div>
        </div>
      </header>

      {!active ? (
        <div className="response-empty">Run an action to see success and error payloads here.</div>
      ) : (
        <>
          <div className="response-meta">
            <span className={`status-pill ${statusClass(active.status)}`}>
              {active.status}
            </span>
            <span className={`envelope-pill ${active.body.success ? "envelope-ok" : "envelope-err"}`}>
              success: {String(active.body.success)}
            </span>
            <span className="muted">{active.durationMs} ms</span>
          </div>

          <div className="response-detail">
            <div>
              <span className="label">Request</span>
              <code>
                {active.meta.method} {active.meta.path}
              </code>
            </div>
            {active.requestId && (
              <div>
                <span className="label">X-Request-ID</span>
                <code className="mono-sm">{active.requestId}</code>
              </div>
            )}
            {active.body.error && (
              <div className="error-banner">{active.body.error}</div>
            )}
          </div>

          <pre className="json-block">{JSON.stringify(active.body, null, 2)}</pre>
        </>
      )}

      {history.length > 0 && (
        <div className="history">
          <p className="history__heading">
            Recent calls
            <span className="collapsible__count">{history.length}</span>
          </p>
          <HistoryList items={history.slice(0, DEFAULT_VISIBLE_HISTORY)} onSelect={onSelect} />
          {history.length > DEFAULT_VISIBLE_HISTORY && (
            <CollapsibleSection
              title="More recent calls"
              count={history.length - DEFAULT_VISIBLE_HISTORY}
              className="history__more"
            >
              <LazyList
                items={history.slice(DEFAULT_VISIBLE_HISTORY)}
                initialCount={HISTORY_MORE_INITIAL}
                step={HISTORY_MORE_STEP}
                className="history-list"
                getKey={(item, i) => `${item.meta.path}-${item.status}-${i}`}
                renderItem={(item) => (
                  <button type="button" className="history-btn" onClick={() => onSelect(item)}>
                    <span className={`dot ${statusClass(item.status)}`} />
                    <span>
                      {item.meta.method} {item.meta.path}
                    </span>
                    <span className="muted">{item.status}</span>
                  </button>
                )}
              />
            </CollapsibleSection>
          )}
        </div>
      )}
    </aside>
  );
}
