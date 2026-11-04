import { useState } from "react";
import type { ApiCallResult } from "../lib/api";
import { apiCall } from "../lib/api";
import type { ConsoleUser } from "../lib/session";

type Props = {
  onSuccess: (token: string, user: ConsoleUser) => void;
};

export function LoginPage({ onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r: ApiCallResult = await apiCall(
        { method: "POST", path: "/api/v1/auth/login" },
        {
          method: "POST",
          body: JSON.stringify({ username, password }),
        }
      );
      if (!r.body.success || !r.body.data || typeof r.body.data !== "object") {
        setError(r.body.error ?? "Login failed");
        return;
      }
      const data = r.body.data as { token?: string; user?: ConsoleUser };
      if (!data.token || !data.user) {
        setError("Invalid login response");
        return;
      }
      onSuccess(data.token, data.user);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card glass">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden>
            <span />
          </div>
          <div>
            <p className="brand-kicker">Developer console</p>
            <h1>Payment Gateway</h1>
          </div>
        </div>
        <p className="login-lead muted">Sign in with your console admin account to manage merchants and view data.</p>
        <form className="login-form" onSubmit={(e) => void submit(e)}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="zain"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn primary login-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
