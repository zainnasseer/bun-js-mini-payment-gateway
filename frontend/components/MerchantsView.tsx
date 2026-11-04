import type { MerchantResponse } from "../../src/types";

export type MerchantScreen = "list" | "create" | "edit";

export type MerchantFormState = {
  name: string;
  email: string;
  webhookUrl: string;
  phoneNumber: string;
  originHeader: string;
  ipWhitelist: string;
  apiKey: string;
  webhookSecret: string;
};

type Props = {
  screen: MerchantScreen;
  merchants: MerchantResponse[];
  form: MerchantFormState;
  onFormChange: (patch: Partial<MerchantFormState>) => void;
  lastCredentials: { apiKey: string; webhookSecret: string } | null;
  onNavigate: (screen: MerchantScreen) => void;
  onRefresh: () => void;
  onRegister: () => void;
  onSave: () => void;
  onDelete: () => void;
  onSelectMerchant: (m: MerchantResponse) => void;
};

function MerchantFormFields({
  form,
  onFormChange,
  mode,
}: {
  form: MerchantFormState;
  onFormChange: (patch: Partial<MerchantFormState>) => void;
  mode: "create" | "edit";
}) {
  return (
    <div className="form-grid">
      <label>
        Merchant name
        <input
          value={form.name}
          onChange={(e) => onFormChange({ name: e.target.value })}
          placeholder="Acme Payments"
        />
      </label>
      <label>
        Email
        <input
          type="email"
          value={form.email}
          onChange={(e) => onFormChange({ email: e.target.value })}
        />
      </label>
      <label>
        Webhook URL
        <input
          value={form.webhookUrl}
          onChange={(e) => onFormChange({ webhookUrl: e.target.value })}
          placeholder="https://…"
        />
      </label>
      <label>
        Phone number
        <input
          value={form.phoneNumber}
          onChange={(e) => onFormChange({ phoneNumber: e.target.value })}
        />
      </label>
      <label>
        Origin header
        <input
          value={form.originHeader}
          onChange={(e) => onFormChange({ originHeader: e.target.value })}
          placeholder="https://checkout.example.com"
        />
      </label>
      <label>
        IP whitelist (comma-separated)
        <input
          value={form.ipWhitelist}
          onChange={(e) => onFormChange({ ipWhitelist: e.target.value })}
          placeholder="203.0.113.1, 198.51.100.0/24"
        />
      </label>
      <label>
        X-API-Key {mode === "create" ? "(optional — auto-generated)" : ""}
        <input
          value={form.apiKey}
          onChange={(e) => onFormChange({ apiKey: e.target.value })}
          placeholder={mode === "create" ? "Leave blank to generate" : undefined}
        />
      </label>
      <label>
        Webhook secret (HMAC) {mode === "create" ? "(optional)" : ""}
        <input
          value={form.webhookSecret}
          onChange={(e) => onFormChange({ webhookSecret: e.target.value })}
          placeholder={mode === "create" ? "Auto-generated if empty" : undefined}
        />
      </label>
    </div>
  );
}

export function MerchantsView({
  screen,
  merchants,
  form,
  onFormChange,
  lastCredentials,
  onNavigate,
  onRefresh,
  onRegister,
  onSave,
  onDelete,
  onSelectMerchant,
}: Props) {
  if (screen === "list") {
    return (
      <>
        <header className="page-header page-header--row">
          <div>
            <p className="page-eyebrow">Overview</p>
            <h2>Merchants</h2>
            <p>Registered merchants on your gateway. Create a new merchant to issue API and webhook credentials.</p>
          </div>
          <div className="btn-row page-header__actions">
            <button type="button" className="btn primary" onClick={() => onNavigate("create")}>
              Create merchant
            </button>
            <button type="button" className="btn" onClick={onRefresh}>
              Refresh
            </button>
          </div>
        </header>

        {lastCredentials && (
          <div className="credential-banner">
            <strong>Credentials from last registration</strong> — store these securely.
            <br />
            X-API-Key: <code className="mono">{lastCredentials.apiKey}</code>
            <br />
            Webhook secret: <code className="mono">{lastCredentials.webhookSecret}</code>
          </div>
        )}

        <div className="stats">
          <div className="stat stat--accent">
            <div className="stat-label">Total merchants</div>
            <div className="stat-value">{merchants.length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Webhook endpoints</div>
            <div className="stat-value">{merchants.filter((m) => m.webhookUrl?.trim()).length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">IP restrictions</div>
            <div className="stat-value">{merchants.filter((m) => m.ipWhitelist?.length).length}</div>
          </div>
        </div>

        <div className="glass">
          <div className="tx-list-panel__head">
            <h3>All merchants</h3>
            <span className="muted">{merchants.length} registered</span>
          </div>
          {merchants.length === 0 ? (
            <div className="tx-empty">
              <p>No merchants yet.</p>
              <button type="button" className="btn primary" onClick={() => onNavigate("create")}>
                Create your first merchant
              </button>
            </div>
          ) : (
            <ul className="merchant-list">
              {merchants.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="merchant-card"
                    onClick={() => onSelectMerchant(m)}
                  >
                    <span className="avatar" aria-hidden>
                      {m.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div className="merchant-card__body">
                      <strong>{m.name}</strong>
                      <span>{m.email}</span>
                    </div>
                    <code className="mono merchant-card__id">{m.id.slice(0, 8)}…</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  if (screen === "create") {
    return (
      <>
        <header className="page-header">
          <button type="button" className="btn back-link" onClick={() => onNavigate("list")}>
            ← Back to merchants
          </button>
          <h2>Create merchant</h2>
          <p>Register a new merchant. API key and webhook secret are generated unless you provide your own.</p>
        </header>
        <div className="glass">
          <MerchantFormFields form={form} onFormChange={onFormChange} mode="create" />
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={onRegister}>
              Register merchant
            </button>
            <button type="button" className="btn" onClick={() => onNavigate("list")}>
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <button type="button" className="btn back-link" onClick={() => onNavigate("list")}>
          ← Back to merchants
        </button>
        <h2>Edit merchant</h2>
        <p>Update merchant settings and credentials.</p>
      </header>
      <div className="glass">
        <MerchantFormFields form={form} onFormChange={onFormChange} mode="edit" />
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={onSave}>
            Save changes
          </button>
          <button type="button" className="btn danger" onClick={onDelete}>
            Delete merchant
          </button>
          <button type="button" className="btn" onClick={() => onNavigate("list")}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
