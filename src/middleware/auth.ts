import { jsonError } from "../lib/http";
import {
  attachAuthScope,
  isAdminApiKey,
  resolveMerchantByApiKey,
} from "../lib/authContext";

/**
 * API authentication:
 * - POST /api/v1/merchants — open registration (no key)
 * - Other /api/v1/* — X-API-Key must match platform API_KEY (admin) or a merchant api_key
 */

function requiresApiKey(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/v1/")) return false;
  if (pathname === "/api/v1/merchants" && method === "POST") return false;
  return true;
}

export async function authCheck(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (!requiresApiKey(url.pathname, req.method)) {
    attachAuthScope(req, { kind: "anonymous" });
    return null;
  }

  const supplied = req.headers.get("X-API-Key") ?? "";
  const adminKey = process.env.API_KEY?.trim() ?? "";

  if (!supplied) {
    if (!adminKey && process.env.NODE_ENV !== "production") {
      attachAuthScope(req, { kind: "anonymous" });
      return null;
    }
    return jsonError("Missing required header: X-API-Key", 401);
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

  if (!adminKey && process.env.NODE_ENV !== "production") {
    attachAuthScope(req, { kind: "anonymous" });
    return null;
  }

  return jsonError("Invalid API key", 401);
}
