import { useState } from "react";

type Props = {
  emailMasked?: string;
  onRequestChange: (currentPassword: string, newPassword: string) => Promise<{
    error: string | null;
    message?: string;
    devCode?: string;
  }>;
  onConfirm: (code: string) => Promise<{ error: string | null; message?: string }>;
};

export function ChangePasswordPanel({ emailMasked, onRequestChange, onConfirm }: Props) {
  const [step, setStep] = useState<"form" | "code">("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHint(null);
    setDevCode(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    const result = await onRequestChange(currentPassword, newPassword);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setHint(result.message ?? "Check your email for the authorization code.");
    if (result.devCode) setDevCode(result.devCode);
    setStep("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await onConfirm(code.trim());
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCode("");
    setDevCode(null);
    setStep("form");
    setHint(result.message ?? "Password updated.");
  }

  return (
    <div className="glass">
      <p className="muted">
        Authorization code
        {emailMasked ? ` will be sent to ${emailMasked}` : " will be sent to your account email"}.
      </p>

      {step === "form" ? (
        <form className="login-form" onSubmit={(e) => void submitRequest(e)}>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            Send authorization email
          </button>
        </form>
      ) : (
        <form className="login-form" onSubmit={(e) => void submitCode(e)}>
          {hint && <p className="login-success">{hint}</p>}
          {devCode && (
            <p className="credential-banner">
              Dev mode (SMTP not configured): code <code className="mono">{devCode}</code>
            </p>
          )}
          <label>
            Authorization code
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </label>
          <div className="btn-row">
            <button type="submit" className="btn primary" disabled={busy}>
              Confirm new password
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setStep("form");
                setCode("");
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        </form>
      )}

      {error && <p className="login-error">{error}</p>}
    </div>
  );
}
