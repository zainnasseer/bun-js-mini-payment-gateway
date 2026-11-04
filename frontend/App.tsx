import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ApiCallResult } from "./lib/api";
import { apiCall } from "./lib/api";
import { ResponsePanel } from "./components/ResponsePanel";
import { TransactionsView, type TxFilters } from "./components/TransactionsView";
import { WebhooksView, type WhFilters } from "./components/WebhooksView";
import { MerchantsView, type MerchantScreen } from "./components/MerchantsView";
import { LoginPage } from "./components/LoginPage";
import { AdminsView, type ConsoleAdminRow } from "./components/AdminsView";
import type {
  FilteredVolumeUsd,
  MerchantResponse,
  Transaction,
  TransactionStatus,
  WebhookDelivery,
} from "../src/types";
import { applyTheme, getInitialTheme, type Theme } from "./lib/theme";
import {
  clearSession,
  getStoredToken,
  getStoredUser,
  saveSession,
  type ConsoleUser,
} from "./lib/session";
import { IconAdmins, IconMerchants, IconTransactions, IconWebhooks } from "./components/icons";
import {
  clampInspectorPanelWidth,
  getInitialInspectorPanelWidth,
  INSPECTOR_PANEL_MIN_W,
  inspectorPanelMaxWidth,
  persistInspectorPanelWidth,
} from "./lib/inspectorPanel";

type View = "merchants" | "transactions" | "webhooks" | "admins";

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
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState<ConsoleUser | null>(() => getStoredUser());
  const [view, setView] = useState<View>("merchants");
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [consoleAdmins, setConsoleAdmins] = useState<ConsoleAdminRow[]>([]);

  const [merchants, setMerchants] = useState<MerchantResponse[]>([]);
  const [merchantScreen, setMerchantScreen] = useState<MerchantScreen>("list");
  const [selectedId, setSelectedId] = useState<string>("");
  const [form, setForm] = useState(emptyForm);
  const [lastCredentials, setLastCredentials] = useState<{ apiKey: string; webhookSecret: string } | null>(
    null
  );

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredVolumeUsd, setFilteredVolumeUsd] = useState<FilteredVolumeUsd | null>(null);
  const [txFilters, setTxFilters] = useState<TxFilters>({
    merchantId: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [selectedTxId, setSelectedTxId] = useState("");
  const [lookupTx, setLookupTx] = useState<Transaction | null>(null);

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
  const [inspectorWidth, setInspectorWidth] = useState(() => getInitialInspectorPanelWidth());
  const inspectorWidthRef = useRef(inspectorWidth);
  inspectorWidthRef.current = inspectorWidth;

  const selected = merchants.find((m) => m.id === selectedId) ?? null;

  const authClient = useMemo(() => ({ token }), [token]);

  useEffect(() => {
    function onResize() {
      setInspectorWidth((w) => clampInspectorPanelWidth(w));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onInspectorResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidthRef.current;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("inspector-resizing");

    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      setInspectorWidth(clampInspectorPanelWidth(startW + delta));
    };
    const onUp = (ev: PointerEvent) => {
      if (handle.hasPointerCapture(ev.pointerId)) {
        handle.releasePointerCapture(ev.pointerId);
      }
      document.body.classList.remove("inspector-resizing");
      persistInspectorPanelWidth(inspectorWidthRef.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!token) {
        setAuthReady(true);
        return;
      }
      const r = await apiCall({ method: "GET", path: "/api/v1/auth/me" }, { method: "GET" }, { token });
      if (cancelled) return;
      if (r.body.success && r.body.data && typeof r.body.data === "object" && "username" in r.body.data) {
        setUser(r.body.data as ConsoleUser);
      } else {
        clearSession();
        setToken("");
        setUser(null);
      }
      setAuthReady(true);
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleLogin(nextToken: string, nextUser: ConsoleUser) {
    saveSession(nextToken, nextUser);
    setToken(nextToken);
    setUser(nextUser);
  }

  function handleLogout() {
    clearSession();
    setToken("");
    setUser(null);
    setMerchants([]);
    setTransactions([]);
    setWebhookDeliveries([]);
  }

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
      await apiCall({ method: "GET", path: "/api/v1/merchants" }, { method: "GET" }, authClient)
    );
    if (r.body.success && Array.isArray(r.body.data)) {
      setMerchants(r.body.data as MerchantResponse[]);
    }
  }, [authClient, record]);

  const refreshConsoleAdmins = useCallback(async () => {
    const r = await record(
      await apiCall({ method: "GET", path: "/api/v1/admins" }, { method: "GET" }, authClient)
    );
    if (r.body.success && Array.isArray(r.body.data)) {
      setConsoleAdmins(r.body.data as ConsoleAdminRow[]);
    }
  }, [authClient, record]);

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

    const path = `/api/v1/transactions?${params.toString()}`;
    const r = await record(
      await apiCall({ method: "GET", path }, { method: "GET" }, authClient)
    );
    if (r.body.success && r.body.data && typeof r.body.data === "object" && "transactions" in r.body.data) {
      const data = r.body.data as {
        transactions: Transaction[];
        filteredVolume?: FilteredVolumeUsd;
      };
      setTransactions(data.transactions);
      setFilteredVolumeUsd(data.filteredVolume ?? null);
    }
  }, [txFilters, authClient, record]);

  useEffect(() => {
    if (token && user) void refreshMerchants();
  }, [token, user]);

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

      const path = `/api/v1/webhook-deliveries?${params.toString()}`;
      const r = await record(
        await apiCall({ method: "GET", path }, { method: "GET" }, authClient)
      );
      if (r.body.success && r.body.data && typeof r.body.data === "object" && "deliveries" in r.body.data) {
        setWebhookDeliveries((r.body.data as { deliveries: WebhookDelivery[] }).deliveries);
      }
    },
    [whFilters, authClient, record]
  );

  useEffect(() => {
    if (!token || !user) return;
    if (view === "transactions") void refreshTransactions();
    if (view === "webhooks") void refreshWebhookDeliveries();
    if (view === "admins") void refreshConsoleAdmins();
  }, [view, token, user]);

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
        authClient
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
        authClient
      )
    );
    setSelectedId("");
    setForm(emptyForm);
    setMerchantScreen("list");
    await refreshMerchants();
  }

  function txById(txId: string): Transaction | null {
    if (lookupTx?.id === txId) return lookupTx;
    return transactions.find((t) => t.id === txId) ?? null;
  }

  function merchantForTx(txId: string): MerchantResponse | null {
    const tx = txById(txId);
    if (!tx) return null;
    return merchants.find((m) => m.id === tx.merchantId) ?? null;
  }

  async function reloadLookupTx() {
    if (!lookupTx) return;
    const r = await apiCall(
      { method: "GET", path: `/api/v1/transactions/${lookupTx.id}` },
      { method: "GET" },
      authClient
    );
    if (r.body.success && r.body.data && typeof r.body.data === "object" && "id" in r.body.data) {
      setLookupTx(r.body.data as Transaction);
    }
  }

  async function lookupTransactionById(id: string): Promise<string | null> {
    const trimmed = id.trim();
    if (!trimmed) return "Enter a transaction ID";
    const r = await record(
      await apiCall(
        { method: "GET", path: `/api/v1/transactions/${encodeURIComponent(trimmed)}` },
        { method: "GET" },
        authClient
      )
    );
    if (!r.body.success || !r.body.data || typeof r.body.data !== "object" || !("id" in r.body.data)) {
      return r.body.error ?? "Transaction not found";
    }
    const tx = r.body.data as Transaction;
    setLookupTx(tx);
    setSelectedTxId(tx.id);
    return null;
  }

  function selectTransaction(id: string) {
    setLookupTx(null);
    setSelectedTxId(id);
  }

  function clearTransactionLookup() {
    setLookupTx(null);
    setSelectedTxId("");
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
    await reloadLookupTx();
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
    await reloadLookupTx();
  }

  async function createConsoleAdmin(
    username: string,
    email: string,
    password: string
  ): Promise<string | null> {
    const r = await record(
      await apiCall(
        { method: "POST", path: "/api/v1/admins" },
        { method: "POST", body: JSON.stringify({ username, email, password, role: "admin" }) },
        authClient
      )
    );
    if (!r.body.success) return r.body.error ?? "Could not create admin";
    return null;
  }

  async function requestPasswordChange(currentPassword: string, newPassword: string) {
    const r = await record(
      await apiCall(
        { method: "POST", path: "/api/v1/auth/password/request-change" },
        {
          method: "POST",
          body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        },
        authClient
      )
    );
    if (!r.body.success) {
      return { error: r.body.error ?? "Could not start password change" };
    }
    const data = r.body.data as {
      message?: string;
      devAuthorizationCode?: string;
    };
    return {
      error: null,
      message: data.message,
      devCode: data.devAuthorizationCode,
    };
  }

  async function confirmPasswordChange(code: string) {
    const r = await record(
      await apiCall(
        { method: "POST", path: "/api/v1/auth/password/confirm" },
        { method: "POST", body: JSON.stringify({ code }) },
        authClient
      )
    );
    if (!r.body.success) {
      return { error: r.body.error ?? "Could not confirm password change" };
    }
    const data = r.body.data as { message?: string };
    return { error: null, message: data.message ?? "Password updated." };
  }

  async function deleteConsoleAdmin(id: string): Promise<string | null> {
    const r = await record(
      await apiCall({ method: "DELETE", path: `/api/v1/admins/${id}` }, { method: "DELETE" }, authClient)
    );
    if (!r.body.success) return r.body.error ?? "Could not remove admin";
    return null;
  }

  if (!authReady) {
    return <div className="login-shell login-shell--loading muted">Loading…</div>;
  }

  if (!token || !user) {
    return <LoginPage onSuccess={handleLogin} />;
  }

  return (
    <div
      className="shell"
      style={{ ["--inspector-w" as string]: `${inspectorWidth}px` }}
    >
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
              ["admins", "Admins", IconAdmins],
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
          <div className="sidebar-user">
            <span className="sidebar-user__name">{user.username}</span>
            <span className="muted sidebar-user__role">
              {user.email} · {user.role === "owner" ? "Owner" : "Admin"}
            </span>
            <button type="button" className="btn sm sidebar-logout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
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
            filteredVolumeUsd={filteredVolumeUsd}
            filters={txFilters}
            onFiltersChange={(patch) => setTxFilters((f) => ({ ...f, ...patch }))}
            onApplyFilters={() => void refreshTransactions()}
            onClearFilters={() => {
              const empty: TxFilters = { merchantId: "", dateFrom: "", dateTo: "", status: "" };
              setTxFilters(empty);
              void refreshTransactions(empty);
            }}
            selectedTxId={selectedTxId}
            focusedTransaction={
              lookupTx ?? transactions.find((t) => t.id === selectedTxId) ?? null
            }
            lookupActive={lookupTx !== null}
            onSelectTx={selectTransaction}
            onLookupById={lookupTransactionById}
            onClearLookup={clearTransactionLookup}
            onPatchStatus={(s) => void patchStatus(s)}
            onRefund={() => void refund()}
          />
        )}

        {view === "admins" && (
          <AdminsView
            admins={consoleAdmins}
            currentUserId={user.id}
            currentRole={user.role}
            currentEmail={user.email}
            onRefresh={() => void refreshConsoleAdmins()}
            onCreate={createConsoleAdmin}
            onDelete={deleteConsoleAdmin}
            onRequestPasswordChange={requestPasswordChange}
            onConfirmPasswordChange={confirmPasswordChange}
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

      <div className="panel-right-wrap">
        <div
          className="panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize API inspector panel"
          aria-valuemin={INSPECTOR_PANEL_MIN_W}
          aria-valuemax={inspectorPanelMaxWidth()}
          aria-valuenow={inspectorWidth}
          onPointerDown={onInspectorResizePointerDown}
        />
        <aside className="panel-right">
          <ResponsePanel result={lastResult} history={history} onSelect={setLastResult} />
        </aside>
      </div>
    </div>
  );
}
