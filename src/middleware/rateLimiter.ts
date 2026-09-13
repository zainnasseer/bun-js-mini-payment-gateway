import { jsonError } from "../lib/http";

/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per IP address in a Map.
 * When the number of requests within the window exceeds the limit,
 * returns a 429 response.
 *
 * Configuration (via environment variables):
 *   RATE_LIMIT_WINDOW_MS   — window size in ms       (default: 60_000 = 1 min)
 *   RATE_LIMIT_MAX_REQUESTS — max requests per window (default: 100)
 *
 * In production, replace with a Redis-backed store (Bun.redis) for
 * distributed rate limiting across multiple server instances.
 */

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 100);

// Map<ip, timestamps[]>
const store = new Map<string, number[]>();

// Periodically prune stale windows to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of store.entries()) {
    const valid = timestamps.filter((t) => now - t < WINDOW_MS);
    if (valid.length === 0) {
      store.delete(ip);
    } else {
      store.set(ip, valid);
    }
  }
}, WINDOW_MS);

/**
 * Extracts the client IP from the request.
 * Respects X-Forwarded-For when behind a trusted proxy.
 */
function getClientIp(req: Request, serverIp?: string): string {
  const forwarded = req.headers.get("X-Forwarded-For");
  if (forwarded) return (forwarded.split(",")[0] ?? forwarded).trim();
  return serverIp ?? "unknown";
}

/**
 * Returns null if the request is within rate limit.
 * Returns a 429 Response if the limit is exceeded.
 */
export function rateLimitCheck(req: Request, serverIp?: string): Response | null {
  const ip = getClientIp(req, serverIp);
  const now = Date.now();

  const timestamps = store.get(ip) ?? [];
  // Slide the window: keep only requests within the current window
  const windowedTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);
  windowedTimestamps.push(now);
  store.set(ip, windowedTimestamps);

  if (windowedTimestamps.length > MAX_REQUESTS) {
    const retryAfterSec = Math.ceil(WINDOW_MS / 1000);
    const res = jsonError(
      `Rate limit exceeded. Max ${MAX_REQUESTS} requests per ${retryAfterSec}s window.`,
      429
    );
    // Standard rate-limit headers
    const headers = new Headers(res.headers);
    headers.set("Retry-After", String(retryAfterSec));
    headers.set("X-RateLimit-Limit", String(MAX_REQUESTS));
    headers.set("X-RateLimit-Remaining", "0");
    headers.set("X-RateLimit-Reset", String(Math.ceil((now + WINDOW_MS) / 1000)));
    return new Response(res.body, { status: 429, headers });
  }

  return null; // request is allowed
}
