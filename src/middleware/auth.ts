import { jsonError } from "../lib/http";
import {
  attachAuthScope,
  isAdminApiKey,
  resolveMerchantByApiKey,
} from "../lib/authContext";
import { verifyConsoleSessionToken } from "../lib/consoleSession";

/**
 * API authentication:
 * - POST /api/v1/merchants — open registration (no key)
 * - POST /api/v1/auth/login — console login (no key)
 * - Other /api/v1/* — Bearer console session, X-API-Key (platform or merchant), or blocked
 */

function isPublicApi(pathname: string, method: string): boolean {
  if (pathname === "/api/v1/merchants" && method === "POST") return true;
  if (pathname === "/api/v1/auth/login" && method === "POST") return true;
  return false;
}

function requiresApiKey(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/v1/")) return false;
  if (isPublicApi(pathname, method)) return false;
  return true;
}

function parseBearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m?.[1]?.trim() || null;
}

export async function authCheck(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (!requiresApiKey(url.pathname, req.method)) {
    attachAuthScope(req, { kind: "anonymous" });
    return null;
  }

  const bearer = parseBearer(req);
  if (bearer) {
    const session = verifyConsoleSessionToken(bearer);
    if (session) {
      attachAuthScope(req, {
        kind: "admin",
        console: {
          adminId: session.adminId,
          username: session.username,
          role: session.role,
        },
      });
      return null;
    }
    return jsonError("Invalid or expired session", 401);
  }

  const supplied = req.headers.get("X-API-Key") ?? "";
  const adminKey = process.env.API_KEY?.trim() ?? "";

  if (!supplied) {
    return jsonError("Authentication required — sign in or send X-API-Key", 401);
  }

  if (adminKey && isAdminApiKey(supplied)) {
    attachAuthScope(req, { kind: "admin" });
    return null;
  }

  const merchant = await resolveMerchantByApiKey(supplied);
  if (merchant) {
    attachAuthScope(req, { kind: "merchant", merchant });
    return null;
  }

  return jsonError("Invalid API key", 401);
}
