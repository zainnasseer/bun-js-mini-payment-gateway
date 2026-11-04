const LS_TOKEN = "pg_console_token";
const LS_USER = "pg_console_user";

export type ConsoleUser = {
  id: string;
  username: string;
  email: string;
  role: "owner" | "admin";
};

export function getStoredToken(): string {
  return localStorage.getItem(LS_TOKEN) ?? "";
}

export function getStoredUser(): ConsoleUser | null {
  try {
    const raw = localStorage.getItem(LS_USER);
    if (!raw) return null;
    return JSON.parse(raw) as ConsoleUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: ConsoleUser): void {
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_USER, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
}
