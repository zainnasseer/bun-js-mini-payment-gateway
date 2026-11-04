import { signPayload, safeCompare } from "./crypto";

export type ConsoleAdminRole = "owner" | "admin";

export type ConsoleSession = {
  adminId: string;
  username: string;
  role: ConsoleAdminRole;
  exp: number;
};

function sessionSecret(): string {
  const s =
    process.env.CONSOLE_SESSION_SECRET?.trim() ||
    process.env.API_KEY?.trim() ||
    "dev-console-session-change-in-production";
  return s;
}

export function createConsoleSessionToken(session: Omit<ConsoleSession, "exp">): string {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const payload: ConsoleSession = { ...session, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signPayload(sessionSecret(), body);
  return `${body}.${sig}`;
}

export function verifyConsoleSessionToken(token: string): ConsoleSession | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPayload(sessionSecret(), body);
  if (!safeCompare(sig, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConsoleSession;
    if (
      typeof parsed.adminId !== "string" ||
      typeof parsed.username !== "string" ||
      (parsed.role !== "owner" && parsed.role !== "admin") ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}
