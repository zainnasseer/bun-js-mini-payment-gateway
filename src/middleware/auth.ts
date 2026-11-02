import { jsonError } from "../lib/http";
import { safeCompare } from "../lib/crypto";

/**
 * API Key authentication middleware.
 *
 * Reads the `X-API-Key` header and compares it timing-safely against
 * the `API_KEY` environment variable.
 *
 * Only `/api/v1/*` requires an API key. Static UI, health, OpenAPI, and
 * webhooks (HMAC) are exempt.
 */

function requiresApiKey(pathname: string): boolean {
  return pathname.startsWith("/api/v1/");
}

/**
 * Returns null if the request is authenticated or exempt.
 * Returns a 401 Response if the key is missing or invalid.
 */
export function authCheck(req: Request): Response | null {
  const url = new URL(req.url);
  if (!requiresApiKey(url.pathname)) return null;

  const apiKey = process.env.API_KEY ?? "";

  if (!apiKey) {
    // In development with no API_KEY set, warn but allow through
    if (process.env.NODE_ENV !== "production") return null;
    console.warn("⚠️  API_KEY is not set. All requests are rejected in production.");
    return jsonError("Server misconfiguration: API_KEY not set", 500);
  }

  const supplied = req.headers.get("X-API-Key") ?? "";
  if (!supplied) {
    return jsonError("Missing required header: X-API-Key", 401);
  }

  // Timing-safe comparison prevents timing attacks
  if (!safeCompare(supplied, apiKey)) {
    return jsonError("Invalid API key", 401);
  }

  return null; // authenticated
}
