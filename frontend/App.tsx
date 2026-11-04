import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiCallResult } from "./lib/api";
import { apiCall } from "./lib/api";
import { ResponsePanel } from "./components/ResponsePanel";
import { TransactionsView, type TxFilters } from "./components/TransactionsView";
import { WebhooksView, type WhFilters } from "./components/WebhooksView";
import { MerchantsView, type MerchantScreen } from "./components/MerchantsView";
import type { MerchantResponse, Transaction, TransactionStatus, WebhookDelivery } from "../src/types";
import { applyTheme, getInitialTheme, type Theme } from "./lib/theme";
import { IconMerchants, IconTransactions, IconWebhooks } from "./components/icons";

type View = "merchants" | "transactions" | "webhooks";

const LS_ADMIN_KEY = "pg_admin_api_key";

const emptyForm = {
  name: "",
  email: "",
  webhookUrl: "",
  phoneNumber: "",
  originHeader: "",
  ipWhitelist: "",
  apiKey: "",
  webhookSecret: "",
};

export function App() {
  const [view, setView] = useState<View>("merchants");
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [adminKey, setAdminKey] = useState(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(LS_ADMIN_KEY) : null) ?? ""
  );

  const [merchants, setMerchants] = useState<MerchantResponse[]>([]);
  const [merchantScreen, setMerchantScreen] = useState<MerchantScreen>("list");
  const [selectedId, setSelectedId] = useState<string>("");
  const [form, setForm] = useState(emptyForm);
  const [lastCredentials, setLastCredentials] = useState<{ apiKey: string; webhookSecret: string } | null>(
    null
  );

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txFilters, setTxFilters] = useState<TxFilters>({
    merchantId: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [selectedTxId, setSelectedTxId] = useState("");

  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);
  const [whFilters, setWhFilters] = useState<WhFilters>({
    merchantId: "",
    dateFrom: "",
    dateTo: "",
    status: "",
    event: "",
  });
  const [selectedWhId, setSelectedWhId] = useState("");

  const [lastResult, setLastResult] = useState<ApiCallResult | null>(null);
  const [history, setHistory] = useState<ApiCallResult[]>([]);

  const selected = merchants.find((m) => m.id === selectedId) ?? null;

  const adminClient = useMemo(() => ({ apiKey: adminKey }), [adminKey]);

  useEffect(() => {
    localStorage.setItem(LS_ADMIN_KEY, adminKey);
  }, [adminKey]);

  function setColorTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  const record = useCallback((result: ApiCallResult) => {
    setLastResult(result);
    setHistory((prev) => [result, ...prev].slice(0, 15));
    return result;
  }, []);

  const parseIps = (raw: string) =>
    raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const refreshMerchants = useCallback(async () => {
    const r = await record(
      await apiCall({ method: "GET", path: "/api/v1/merchants" }, { method: "GET" }, adminClient)
    );
    if (r.body.success && Array.isArray(r.body.data)) {
      setMerchants(r.body.data as MerchantResponse[]);
    }
  }, [adminClient, record]);

  const apiKeyForMerchant = useCallback(
    (merchantId: string) => merchants.find((m) => m.id === merchantId)?.apiKey ?? "",
    [merchants]
  );

  const refreshTransactions = useCallback(async (override?: TxFilters) => {
    const f = override ?? txFilters;
    const params = new URLSearchParams({ limit: "100" });
    if (f.merchantId) params.set("merchant_id", f.merchantId);
    if (f.dateFrom) params.set("from", f.dateFrom);
    if (f.dateTo) params.set("to", f.dateTo);
    if (f.status) params.set("status", f.status);

    const scopedKey = f.merchantId ? apiKeyForMerchant(f.merchantId) : adminKey;
    const path = `/api/v1/transactions?${params.toString()}`;
    const r = await record(
      await apiCall({ method: "GET", path }, { method: "GET" }, { apiKey: scopedKey })
    );
    if (r.body.success && r.body.data && typeof r.body.data === "object" && "transactions" in r.body.data) {
      setTransactions((r.body.data as { transactions: Transaction[] }).transactions);
    }
  }, [txFilters, apiKeyForMerchant, adminKey, record]);

  useEffect(() => {
    void refreshMerchants();
  }, []);

  useEffect(() => {
    if (view === "merchants") {
      void refreshMerchants();
      setMerchantScreen("list");
    }
  }, [view]);

  const refreshWebhookDeliveries = useCallback(
    async (override?: WhFilters) => {
      const f = override ?? whFilters;
      const params = new URLSearchParams({ limit: "100" });
      if (f.merchantId) params.set("merchant_id", f.merchantId);
      if (f.dateFrom) params.set("from", f.dateFrom);
      if (f.dateTo) params.set("to", f.dateTo);
      if (f.status) params.set("status", f.status);
      if (f.event.trim()) params.set("event", f.event.trim());

      const scopedKey = f.merchantId ? apiKeyForMerchant(f.merchantId) : adminKey;
      const path = `/api/v1/webhook-deliveries?${params.toString()}`;
      const r = await record(
        await apiCall({ method: "GET", path }, { method: "GET" }, { apiKey: scopedKey })
      );
      if (r.body.success && r.body.data && typeof r.body.data === "object" && "deliveries" in r.body.data) {
        setWebhookDeliveries((r.body.data as { deliveries: WebhookDelivery[] }).deliveries);
      }
    },
    [whFilters, apiKeyForMerchant, adminKey, record]
  );

  useEffect(() => {
    if (view === "transactions") void refreshTransactions();
    if (view === "webhooks") void refreshWebhookDeliveries();
  }, [view]);

  function loadMerchant(m: MerchantResponse) {
    setSelectedId(m.id);
    setForm({
      name: m.name,
      email: m.email,
      webhookUrl: m.webhookUrl,
      phoneNumber: m.phoneNumber,
      originHeader: m.originHeader,
      ipWhitelist: m.ipWhitelist.join(", "),
      apiKey: m.apiKey,
      webhookSecret: m.webhookSecret,
    });
    setMerchantScreen("edit");
  }

  function goToCreateMerchant() {
    setSelectedId("");
    setForm(emptyForm);
    setLastCredentials(null);
    setMerchantScreen("create");
  }

  function goToMerchantList() {
    setMerchantScreen("list");
  }

  async function registerMerchant() {
    const body: Record<string, unknown> = {
      name: form.name,
      email: form.email,
      webhook_url: form.webhookUrl,
      phone_number: form.phoneNumber,
      origin_header: form.originHeader,
      ip_whitelist: parseIps(form.ipWhitelist),
    };
    if (form.apiKey.trim()) body.api_key = form.apiKey.trim();
    if (form.webhookSecret.trim()) body.webhook_secret = form.webhookSecret.trim();

    const r = await record(
      await apiCall({ method: "POST", path: "/api/v1/merchants" }, { method: "POST", body: JSON.stringify(body) }, {
        apiKey: "",
      })
    );
    if (r.body.success && r.body.data && typeof r.body.data === "object" && "id" in r.body.data) {
      const m = r.body.data as MerchantResponse;
      setLastCredentials({ apiKey: m.apiKey, webhookSecret: m.webhookSecret });
      setSelectedId(m.id);
      await refreshMerchants();
      setMerchantScreen("list");
    }
  }

  async function saveMerchant() {
    if (!selectedId) return;
    const r = await record(
      await apiCall(
        { method: "PATCH", path: `/api/v1/merchants/${selectedId}` },
        {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            webhook_url: form.webhookUrl,
            phone_number: form.phoneNumber,
            origin_header: form.originHeader,
            ip_whitelist: parseIps(form.ipWhitelist),
            api_key: form.apiKey,
            webhook_secret: form.webhookSecret,
          }),
        },
        { apiKey: form.apiKey || adminKey }
      )
    );
    if (r.body.success && r.body.data) {
      loadMerchant(r.body.data as MerchantResponse);
      await refreshMerchants();
      setMerchantScreen("list");
    }
  }

  async function removeMerchant() {
    if (!selectedId) return;
    await record(
      await apiCall(
        { method: "DELETE", path: `/api/v1/merchants/${selectedId}` },
        { method: "DELETE" },
        adminClient
      )
    );
    setSelectedId("");
    setForm(emptyForm);
    setMerchantScreen("list");
    await refreshMerchants();
  }

  function merchantForTx(txId: string): MerchantResponse | null {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return null;
    return merchants.find((m) => m.id === tx.merchantId) ?? null;
  }

  async function patchStatus(status: TransactionStatus) {
    if (!selectedTxId) return;
    const m = merchantForTx(selectedTxId);
    if (!m) return;
    await record(
      await apiCall(
        { method: "PATCH", path: `/api/v1/transactions/${selectedTxId}/status` },
        { method: "PATCH", body: JSON.stringify({ status }) },
        { apiKey: m.apiKey }
      )
    );
    await refreshTransactions();
  }

  async function refund() {
    if (!selectedTxId) return;
    const m = merchantForTx(selectedTxId);
    if (!m) return;
    await record(
      await apiCall(
        { method: "POST", path: `/api/v1/transactions/${selectedTxId}/refund` },
        { method: "POST", body: JSON.stringify({ reason: "Console refund" }) },
        { apiKey: m.apiKey }
      )
    );
    await refreshTransactions();
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <span />
          </div>
          <div className="brand-copy">
            <p className="brand-kicker">Developer console</p>
            <h1>Payment Gateway</h1>
          </div>
        </div>
        <nav aria-label="Main">
          {(
            [
              ["merchants", "Merchants", IconMerchants],
              ["transactions", "Transactions", IconTransactions],
              ["webhooks", "Webhooks", IconWebhooks],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => setView(id)}
            >
              <span className="nav-item__icon">
                <Icon />
              </span>
              <span className="nav-item__label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="segmented" role="group" aria-label="Color theme">
            <button
              type="button"
              className={theme === "light" ? "segmented__btn active" : "segmented__btn"}
              onClick={() => setColorTheme("light")}
            >
              Light
            </button>
            <button
              type="button"
              className={theme === "dark" ? "segmented__btn active" : "segmented__btn"}
              onClick={() => setColorTheme("dark")}
            >
              Dark
            </button>
          </div>
          <label className="sidebar-field">
            Admin API key
            <input
              type="password"
              placeholder="Optional — platform scope"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
            />
          </label>
          <div className="sidebar-links">
            <a href="/openapi.yaml" target="_blank" rel="noreferrer">
              OpenAPI
            </a>
            <span className="sidebar-links__dot" aria-hidden />
            <a href="/health" target="_blank" rel="noreferrer">
              Health
            </a>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">
        {view === "merchants" && (
          <MerchantsView
            screen={merchantScreen}
            merchants={merchants}
            form={form}
            onFormChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            lastCredentials={lastCredentials}
            onNavigate={(screen) => {
              if (screen === "create") goToCreateMerchant();
              else if (screen === "list") goToMerchantList();
              else setMerchantScreen("edit");
            }}
            onRefresh={() => void refreshMerchants()}
            onRegister={() => void registerMerchant()}
            onSave={() => void saveMerchant()}
            onDelete={() => void removeMerchant()}
            onSelectMerchant={loadMerchant}
          />
        )}

        {view === "transactions" && (
          <TransactionsView
            merchants={merchants}
            transactions={transactions}
            filters={txFilters}
            onFiltersChange={(patch) => setTxFilters((f) => ({ ...f, ...patch }))}
            onApplyFilters={() => void refreshTransactions()}
            onClearFilters={() => {
              const empty: TxFilters = { merchantId: "", dateFrom: "", dateTo: "", status: "" };
              setTxFilters(empty);
              void refreshTransactions(empty);
            }}
            selectedTxId={selectedTxId}
            onSelectTx={setSelectedTxId}
            onPatchStatus={(s) => void patchStatus(s)}
            onRefund={() => void refund()}
          />
        )}

        {view === "webhooks" && (
          <WebhooksView
            merchants={merchants}
            deliveries={webhookDeliveries}
            filters={whFilters}
            onFiltersChange={(patch) => setWhFilters((f) => ({ ...f, ...patch }))}
            onApplyFilters={() => void refreshWebhookDeliveries()}
            onClearFilters={() => {
              const empty: WhFilters = {
                merchantId: "",
                dateFrom: "",
                dateTo: "",
                status: "",
                event: "",
              };
              setWhFilters(empty);
              void refreshWebhookDeliveries(empty);
            }}
            selectedId={selectedWhId}
            onSelect={setSelectedWhId}
          />
        )}
        </div>
      </main>

      <aside className="panel-right">
        <ResponsePanel result={lastResult} history={history} onSelect={setLastResult} />
      </aside>
    </div>
  );
}
