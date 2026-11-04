import { useState } from "react";
import { ChangePasswordPanel } from "./ChangePasswordPanel";

export type ConsoleAdminRow = {
  id: string;
  username: string;
  email: string;
  role: "owner" | "admin";
  createdAt: string;
};

type Props = {
  admins: ConsoleAdminRow[];
  currentUserId: string;
  currentRole: "owner" | "admin";
  currentEmail?: string;
  onRefresh: () => void;
  onCreate: (username: string, email: string, password: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
  onRequestPasswordChange: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ error: string | null; message?: string; devCode?: string }>;
  onConfirmPasswordChange: (code: string) => Promise<{ error: string | null; message?: string }>;
};

export function AdminsView({
  admins,
  currentUserId,
  currentRole,
  currentEmail,
  onRefresh,
  onCreate,
  onDelete,
  onRequestPasswordChange,
  onConfirmPasswordChange,
}: Props) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    const err = await onCreate(username.trim(), email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setUsername("");
    setEmail("");
    setPassword("");
    setMessage("Admin account created.");
    onRefresh();
  }

  async function handleDelete(id: string) {
    setError(null);
    setMessage(null);
    setBusy(true);
    const err = await onDelete(id);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setMessage("Admin removed.");
    onRefresh();
  }

  if (showPasswordChange) {
    return (
      <>
        <header className="page-header">
          <button type="button" className="btn back-link" onClick={() => setShowPasswordChange(false)}>
            ← Back to admins
          </button>
          <p className="page-eyebrow">Account</p>
          <h2>Change password</h2>
          <p>We email a one-time authorization code before your new password takes effect.</p>
        </header>
        <ChangePasswordPanel
          emailMasked={currentEmail ? maskEmail(currentEmail) : undefined}
          onRequestChange={onRequestPasswordChange}
          onConfirm={async (code) => {
            const result = await onConfirmPasswordChange(code);
            if (!result.error) setShowPasswordChange(false);
            return result;
          }}
        />
      </>
    );
  }

  return (
    <>
      <header className="page-header page-header--row">
        <div>
          <p className="page-eyebrow">Access control</p>
          <h2>Console admins</h2>
          <p>Authorized users who can sign in to this developer console. Only the owner can remove admins.</p>
        </div>
        <div className="btn-row page-header__actions">
          <button type="button" className="btn" onClick={() => setShowPasswordChange(true)}>
            Change password
          </button>
        </div>
      </header>

      <div className="glass">
        <div className="tx-list-panel__head">
          <h3>Active accounts</h3>
          <button type="button" className="btn sm" onClick={onRefresh} disabled={busy}>
            Refresh
          </button>
        </div>
        <ul className="admin-list">
          {admins.map((a) => (
            <li
              key={a.id}
              className={a.id === currentUserId ? "admin-row admin-row--current" : "admin-row"}
            >
              <div>
                <strong>{a.username}</strong>
                <span className="muted admin-row__meta">
                  {a.email} · {a.role === "owner" ? "Owner" : "Admin"}
                  {a.id === currentUserId ? " · you" : ""}
                </span>
              </div>
              {currentRole === "owner" && a.role !== "owner" && (
                <button
                  type="button"
                  className="btn sm danger"
                  disabled={busy}
                  onClick={() => void handleDelete(a.id)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="glass">
        <h3>Add admin</h3>
        <p className="muted">New admins can sign in and use the full console. Password must be at least 8 characters.</p>
        <form className="form-grid admin-form" onSubmit={(e) => void handleCreate(e)}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="new.admin"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <div className="btn-row full">
            <button type="submit" className="btn primary" disabled={busy}>
              Create admin
            </button>
          </div>
        </form>
        {message && <p className="login-success">{message}</p>}
        {error && <p className="login-error">{error}</p>}
      </div>
    </>
  );
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length <= 2 ? local.charAt(0) || "*" : local.slice(0, 2);
  return `${visible}***@${domain}`;
}
