import { useCallback, useEffect, useState } from "react";
import type { ApiCallResult } from "./lib/api";
import { apiCall, newIdempotencyKey } from "./lib/api";
import { signWebhookPayload } from "./lib/webhook";
import { ResponsePanel } from "./components/ResponsePanel";
import type { PaymentMethod, Transaction, User } from "../src/types";

type Tab = "users" | "payments" | "transactions" | "webhooks" | "scenarios";

const LS_API_KEY = "pg_console_api_key";
const LS_WEBHOOK_SECRET = "pg_console_webhook_secret";

export function App() {
  const [tab, setTab] = useState<Tab>("users");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("change_me_before_production");

  const [users, setUsers] = useState<User[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedPmId, setSelectedPmId] = useState("");
  const [selectedTxId, setSelectedTxId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  const [userEmail, setUserEmail] = useState("demo@example.com");
  const [userName, setUserName] = useState("Demo User");
  const [amountDollars, setAmountDollars] = useState("49.99");
  const [txDescription, setTxDescription] = useState("Console test charge");

  const [lastResult, setLastResult] = useState<ApiCallResult | null>(null);
  const [history, setHistory] = useState<ApiCallResult[]>([]);

  useEffect(() => {
    setApiKey(localStorage.getItem(LS_API_KEY) ?? "");
    setWebhookSecret(localStorage.getItem(LS_WEBHOOK_SECRET) ?? "change_me_before_production");
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_API_KEY, apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem(LS_WEBHOOK_SECRET, webhookSecret);
  }, [webhookSecret]);

  const record = useCallback((result: ApiCallResult) => {
    setLastResult(result);
    setHistory((prev) => [result, ...prev].slice(0, 12));
    return result;
  }, []);

  const client = { apiKey };

  const refreshUsers = useCallback(async () => {
    const r = await record(
      await apiCall({ method: "GET", path: "/api/v1/users" }, { method: "GET" }, client)
    );
    if (r.body.success && Array.isArray(r.body.data)) {
      setUsers(r.body.data as User[]);
    }
  }, [client.apiKey, record]);

  const syncPaymentMethods = useCallback((methods: PaymentMethod[]) => {
    setPaymentMethods(methods);
    setSelectedPmId((prev) => {
      if (prev && methods.some((m) => m.id === prev)) return prev;
      return methods[0]?.id ?? "";
    });
  }, []);

  const refreshPaymentMethods = useCallback(async () => {
    if (!selectedUserId) return;
    const path = `/api/v1/users/${selectedUserId}/payment-methods`;
    const r = await record(await apiCall({ method: "GET", path }, { method: "GET" }, client));
    if (r.body.success && Array.isArray(r.body.data)) {
      syncPaymentMethods(r.body.data as PaymentMethod[]);
    }
  }, [client.apiKey, record, selectedUserId, syncPaymentMethods]);

  function selectUser(userId: string) {
    setSelectedUserId(userId);
    setSelectedPmId("");
    setSelectedTxId("");
    setPaymentMethods([]);
  }

  const refreshTransactions = useCallback(async () => {
    const qs = selectedUserId ? `?user_id=${selectedUserId}&limit=20` : "?limit=20";
    const path = `/api/v1/transactions${qs}`;
    const r = await record(await apiCall({ method: "GET", path }, { method: "GET" }, client));
    if (r.body.success && r.body.data && typeof r.body.data === "object" && "transactions" in r.body.data) {
      const data = r.body.data as { transactions: Transaction[] };
      setTransactions(data.transactions);
    }
  }, [client.apiKey, record, selectedUserId]);

  useEffect(() => {
    void refreshUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) void refreshPaymentMethods();
  }, [selectedUserId]);

  useEffect(() => {
    void refreshTransactions();
  }, [selectedUserId]);

  async function createUser() {
    const r = await record(
      await apiCall(
        { method: "POST", path: "/api/v1/users" },
        { method: "POST", body: JSON.stringify({ email: userEmail, name: userName }) },
        client
      )
    );
    if (r.body.success && r.body.data && typeof r.body.data === "object" && "id" in r.body.data) {
      const u = r.body.data as User;
      setSelectedUserId(u.id);
      await refreshUsers();
    }
  }

  async function addPaymentMethod(defaultCard = true) {
    if (!selectedUserId) return;
    const path = `/api/v1/users/${selectedUserId}/payment-methods`;
    const r = await record(
      await apiCall(
        { method: "POST", path },
        {
          method: "POST",
          body: JSON.stringify({
            type: "CARD",
            token_id: `tok_console_${crypto.randomUUID().slice(0, 8)}`,
            last_four: "4242",
            expiry_month: 12,
            expiry_year: new Date().getFullYear() + 2,
            is_default: defaultCard,
          }),
        },
        client
      )
    );
    if (r.body.success && r.body.data && typeof r.body.data === "object" && "id" in r.body.data) {
      setSelectedPmId((r.body.data as PaymentMethod).id);
      await refreshPaymentMethods();
    }
  }

  async function deletePaymentMethod(methodId: string) {
    if (!selectedUserId) return;
    const path = `/api/v1/users/${selectedUserId}/payment-methods/${methodId}`;
    await record(await apiCall({ method: "DELETE", path }, { method: "DELETE" }, client));
    await refreshPaymentMethods();
  }

  async function createTransaction(reuseKey: boolean) {
    if (!selectedUserId || !selectedPmId) return;
    const key = reuseKey ? idempotencyKey : newIdempotencyKey();
    if (!reuseKey) setIdempotencyKey(key);

    const cents = Math.round(parseFloat(amountDollars) * 100);
    const headers = new Headers();
    headers.set("Idempotency-Key", key);

    const r = await record(
      await apiCall(
        { method: "POST", path: "/api/v1/transactions" },
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            user_id: selectedUserId,
            payment_method_id: selectedPmId,
            amount: cents,
            currency: "USD",
            description: txDescription,
          }),
        },
        client
      )
    );
    if (r.body.success && r.body.data && typeof r.body.data === "object" && "id" in r.body.data) {
      setSelectedTxId((r.body.data as Transaction).id);
      await refreshTransactions();
    }
  }

  async function patchStatus(status: Transaction["status"]) {
    if (!selectedTxId) return;
    const path = `/api/v1/transactions/${selectedTxId}/status`;
    await record(
      await apiCall(
        { method: "PATCH", path },
        { method: "PATCH", body: JSON.stringify({ status }) },
        client
      )
    );
    await refreshTransactions();
  }

  async function refundTransaction() {
    if (!selectedTxId) return;
    const path = `/api/v1/transactions/${selectedTxId}/refund`;
    await record(
      await apiCall(
        { method: "POST", path },
        { method: "POST", body: JSON.stringify({ reason: "Console refund test" }) },
        client
      )
    );
    await refreshTransactions();
  }

  async function sendWebhook(status: "AUTHORIZED" | "CAPTURED" | "FAILED") {
    if (!selectedTxId) return;
    const payload = JSON.stringify({
      transaction_id: selectedTxId,
      status,
      processor_ref: `proc_console_${Date.now()}`,
    });
    const sig = await signWebhookPayload(webhookSecret, payload);
    await record(
      await apiCall(
        { method: "POST", path: "/webhooks/processor" },
        {
          method: "POST",
          headers: { "X-Webhook-Signature": sig },
          body: payload,
        },
        { apiKey: "" }
      )
    );
    await refreshTransactions();
  }

  async function runScenario(kind: string) {
    switch (kind) {
      case "duplicate-email":
        await record(
          await apiCall(
            { method: "POST", path: "/api/v1/users" },
            {
              method: "POST",
              body: JSON.stringify({ email: userEmail, name: "Duplicate" }),
            },
            client
          )
        );
        break;
      case "pci-pan":
        if (!selectedUserId) return;
        await record(
          await apiCall(
            { method: "POST", path: `/api/v1/users/${selectedUserId}/payment-methods` },
            {
              method: "POST",
              body: JSON.stringify({
                type: "CARD",
                pan: "4111111111111111",
                token_id: "bad",
                last_four: "4242",
                expiry_month: 12,
                expiry_year: 2030,
              }),
            },
            client
          )
        );
        break;
      case "no-idempotency":
        await record(
          await apiCall(
            { method: "POST", path: "/api/v1/transactions" },
            {
              method: "POST",
              body: JSON.stringify({
                user_id: selectedUserId || "00000000-0000-4000-8000-000000000000",
                payment_method_id: selectedPmId || "00000000-0000-4000-8000-000000000000",
                amount: 100,
                currency: "USD",
              }),
            },
            client
          )
        );
        break;
      case "invalid-transition":
        if (!selectedTxId) return;
        await record(
          await apiCall(
            { method: "PATCH", path: `/api/v1/transactions/${selectedTxId}/status` },
            { method: "PATCH", body: JSON.stringify({ status: "REFUNDED" }) },
            client
          )
        );
        break;
      case "bad-api-key":
        await record(
          await apiCall(
            { method: "GET", path: "/api/v1/users" },
            { method: "GET" },
            { apiKey: "definitely-wrong-key" }
          )
        );
        break;
      case "refund-pending":
        if (!selectedTxId) return;
        await record(
          await apiCall(
            { method: "POST", path: `/api/v1/transactions/${selectedTxId}/refund` },
            { method: "POST", body: JSON.stringify({ reason: "Too early" }) },
            client
          )
        );
        break;
      default:
        break;
    }
  }

  const selectedTx = transactions.find((t) => t.id === selectedTxId);

  return (
    <div className="layout">
      <header className="topbar">
        <div>
          <p className="eyebrow">Payment Gateway</p>
          <h1>Developer Console</h1>
        </div>
        <div className="topbar-actions">
          <a href="/openapi.yaml" target="_blank" rel="noreferrer" className="link-quiet">
            OpenAPI
          </a>
          <a href="/health" target="_blank" rel="noreferrer" className="link-quiet">
            Health
          </a>
        </div>
      </header>

      <section className="settings card">
        <h2>Connection</h2>
        <div className="grid-2">
          <label>
            X-API-Key
            <input
              type="password"
              placeholder="Leave empty in local dev if API_KEY unset"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <label>
            Webhook secret (HMAC demos)
            <input
              type="text"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </label>
        </div>
        <p className="hint">
          Matches server env vars <code>API_KEY</code> and <code>WEBHOOK_SECRET</code>. Responses appear
          on the right with HTTP status and <code>{`{ success, data | error }`}</code> envelope.
        </p>
      </section>

      <div className="main-grid">
        <div className="workspace">
          <nav className="tabs" aria-label="Sections">
            {(
              [
                ["users", "Users"],
                ["payments", "Payment methods"],
                ["transactions", "Transactions"],
                ["webhooks", "Webhooks"],
                ["scenarios", "Error scenarios"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? "tab active" : "tab"}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "users" && (
            <section className="card">
              <h2>Users</h2>
              <div className="grid-2">
                <label>
                  Email
                  <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
                </label>
                <label>
                  Name
                  <input value={userName} onChange={(e) => setUserName(e.target.value)} />
                </label>
              </div>
              <div className="btn-row">
                <button type="button" className="btn primary" onClick={() => void createUser()}>
                  POST /users (201)
                </button>
                <button type="button" className="btn" onClick={() => void refreshUsers()}>
                  GET /users
                </button>
              </div>
              <ul className="entity-list">
                {users.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={selectedUserId === u.id ? "entity selected" : "entity"}
                      onClick={() => selectUser(u.id)}
                    >
                      <strong>{u.name}</strong>
                      <span className="muted">{u.email}</span>
                      <code className="mono-sm">{u.id.slice(0, 8)}…</code>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "payments" && (
            <section className="card">
              <h2>Payment methods</h2>
              {!selectedUserId ? (
                <p className="warn">Select a user first.</p>
              ) : (
                <>
                  <p className="muted">User: <code>{selectedUserId}</code></p>
                  <div className="btn-row">
                    <button type="button" className="btn primary" onClick={() => void addPaymentMethod()}>
                      POST tokenized card
                    </button>
                    <button type="button" className="btn" onClick={() => void refreshPaymentMethods()}>
                      Refresh list
                    </button>
                  </div>
                  <ul className="entity-list">
                    {paymentMethods.map((pm) => (
                      <li key={pm.id} className="entity-row">
                        <button
                          type="button"
                          className={selectedPmId === pm.id ? "entity selected" : "entity"}
                          onClick={() => setSelectedPmId(pm.id)}
                        >
                          <strong>{pm.type}</strong>
                          <span>•••• {pm.lastFour}</span>
                          {pm.isDefault && <span className="badge">default</span>}
                        </button>
                        <button
                          type="button"
                          className="btn danger sm"
                          onClick={() => void deletePaymentMethod(pm.id)}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {tab === "transactions" && (
            <section className="card">
              <h2>Transactions</h2>
              <ul className="checklist">
                <li className={selectedUserId ? "ok" : "missing"}>
                  <span>
                    {selectedUserId ? "✓" : "1."} <strong>user_id</strong>
                  </span>
                  {selectedUserId ? (
                    <code className="id-full">{selectedUserId}</code>
                  ) : (
                    <span className="muted">Pick a user on the Users tab</span>
                  )}
                </li>
                <li className={selectedPmId ? "ok" : "missing"}>
                  <span>
                    {selectedPmId ? "✓" : "2."} <strong>payment_method_id</strong>
                  </span>
                  {selectedPmId ? (
                    <code className="id-full">{selectedPmId}</code>
                  ) : (
                    <span className="muted">Add or select a card on Payment methods</span>
                  )}
                </li>
              </ul>
              {!selectedUserId || !selectedPmId ? (
                <p className="warn">
                  The charge uses the selected user + payment method IDs automatically. The error
                  &quot;Payment method not found or does not belong to this user&quot; means those two
                  don&apos;t match (often after switching users without re-selecting a card).
                </p>
              ) : (
                <>
                  <div className="grid-2">
                    <label>
                      Amount (USD)
                      <input value={amountDollars} onChange={(e) => setAmountDollars(e.target.value)} />
                    </label>
                    <label>
                      Idempotency-Key (HTTP header, UUID v4)
                      <input
                        value={idempotencyKey}
                        onChange={(e) => setIdempotencyKey(e.target.value)}
                        aria-describedby="idempotency-hint"
                      />
                    </label>
                  </div>
                  <p id="idempotency-hint" className="hint">
                    Not a payment method ID. Leave the auto-generated UUID, or click{" "}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setIdempotencyKey(newIdempotencyKey())}
                    >
                      generate new key
                    </button>{" "}
                    for a fresh charge. Reuse the same key to test idempotent replay (200).
                  </p>
                  <label>
                    Description
                    <input value={txDescription} onChange={(e) => setTxDescription(e.target.value)} />
                  </label>
                  <div className="btn-row">
                    <button type="button" className="btn primary" onClick={() => void createTransaction(false)}>
                      POST charge (201)
                    </button>
                    <button type="button" className="btn" onClick={() => void createTransaction(true)}>
                      Replay same key (200)
                    </button>
                    <button type="button" className="btn" onClick={() => void refreshTransactions()}>
                      Refresh
                    </button>
                  </div>
                  {selectedTx && (
                    <div className="tx-detail">
                      <p>
                        Selected: <code>{selectedTx.id}</code> —{" "}
                        <span className={`badge status-${selectedTx.status.toLowerCase()}`}>
                          {selectedTx.status}
                        </span>
                      </p>
                      <div className="btn-row">
                        <button type="button" className="btn sm" onClick={() => void patchStatus("AUTHORIZED")}>
                          → AUTHORIZED
                        </button>
                        <button type="button" className="btn sm" onClick={() => void patchStatus("CAPTURED")}>
                          → CAPTURED
                        </button>
                        <button type="button" className="btn sm" onClick={() => void patchStatus("FAILED")}>
                          → FAILED
                        </button>
                        <button type="button" className="btn sm" onClick={() => void refundTransaction()}>
                          Refund
                        </button>
                      </div>
                      <p className="hint">
                        Async simulator may auto-move PENDING → AUTHORIZED/FAILED after a few seconds.
                      </p>
                    </div>
                  )}
                  <ul className="entity-list compact">
                    {transactions.map((tx) => (
                      <li key={tx.id}>
                        <button
                          type="button"
                          className={selectedTxId === tx.id ? "entity selected" : "entity"}
                          onClick={() => setSelectedTxId(tx.id)}
                        >
                          <strong>${(tx.amount / 100).toFixed(2)} {tx.currency}</strong>
                          <span className={`badge status-${tx.status.toLowerCase()}`}>{tx.status}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {tab === "webhooks" && (
            <section className="card">
              <h2>Processor webhooks</h2>
              {!selectedTxId ? (
                <p className="warn">Create or select a transaction first.</p>
              ) : (
                <>
                  <p className="muted">
                    Signs body with HMAC-SHA256 (<code>X-Webhook-Signature</code>) using your webhook secret.
                  </p>
                  <div className="btn-row">
                    <button type="button" className="btn primary" onClick={() => void sendWebhook("AUTHORIZED")}>
                      POST AUTHORIZED
                    </button>
                    <button type="button" className="btn" onClick={() => void sendWebhook("CAPTURED")}>
                      POST CAPTURED
                    </button>
                    <button type="button" className="btn danger" onClick={() => void sendWebhook("FAILED")}>
                      POST FAILED
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "scenarios" && (
            <section className="card">
              <h2>Error & edge-case demos</h2>
              <p className="muted">One-click requests that should fail with documented API errors.</p>
              <div className="scenario-grid">
                <button type="button" className="scenario" onClick={() => void runScenario("duplicate-email")}>
                  <strong>409 Duplicate email</strong>
                  <span>POST user with same email twice</span>
                </button>
                <button type="button" className="scenario" onClick={() => void runScenario("pci-pan")}>
                  <strong>400 PCI violation</strong>
                  <span>POST payment method with raw PAN</span>
                </button>
                <button type="button" className="scenario" onClick={() => void runScenario("no-idempotency")}>
                  <strong>400 Missing Idempotency-Key</strong>
                  <span>POST /transactions without header</span>
                </button>
                <button type="button" className="scenario" onClick={() => void runScenario("invalid-transition")}>
                  <strong>422 Invalid transition</strong>
                  <span>PATCH status the state machine rejects</span>
                </button>
                <button type="button" className="scenario" onClick={() => void runScenario("bad-api-key")}>
                  <strong>401 Invalid API key</strong>
                  <span>GET /users with wrong X-API-Key</span>
                </button>
                <button type="button" className="scenario" onClick={() => void runScenario("refund-pending")}>
                  <strong>422 Refund too early</strong>
                  <span>Refund non-CAPTURED transaction</span>
                </button>
              </div>
            </section>
          )}
        </div>

        <ResponsePanel result={lastResult} history={history} onSelect={setLastResult} />
      </div>
    </div>
  );
}
