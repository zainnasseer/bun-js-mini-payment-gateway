import { jsonError } from "../lib/http";
import { safeCompare } from "../lib/crypto";

/**
 * API Key authentication middleware.
 *
 * Reads the `X-API-Key` header and compares it timing-safely against
 * the `API_KEY` environment variable.
 *
 * Routes exempt from auth:
 *   - GET  /health
 *   - POST /webhooks/*   (webhook signature is its own auth mechanism)
 */



// Paths exempt from API key requirement
const EXEMPT_PREFIXES = ["/health", "/webhooks/"];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Returns null if the request is authenticated or exempt.
 * Returns a 401 Response if the key is missing or invalid.
 */
export function authCheck(req: Request): Response | null {
  const url = new URL(req.url);
  if (isExempt(url.pathname)) return null;

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
