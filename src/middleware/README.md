# `src/middleware` — Middleware Pipeline

This folder implements the **HTTP middleware pipeline** that runs before every route handler. Middleware is composable — each piece is a standalone function that either short-circuits with a `Response` or returns `null` to pass control to the next step.

The main entry point is [`index.ts`](./index.ts), which wires everything together and exports a single `runMiddleware` function for use in `Bun.serve()`.

---

## Execution Order

```
Incoming Request
      │
      ▼
1. Request ID injection  (requestId.ts)   — always runs, injects X-Request-ID
      │
      ▼
2. Logger start          (logger.ts)      — captures start time
      │
      ▼
3. Rate limiter          (rateLimiter.ts) — blocks with 429 if limit exceeded
      │
      ▼
4. Auth check            (auth.ts)        — blocks with 401 if key is missing/invalid
      │
      ▼
5. Content-Type guard    (contentType.ts) — blocks with 415 if wrong content type
      │
      ▼
6. Route handler (next)
      │
      ▼
Logger completion                         — logs method, path, status, latency
      │
      ▼
Outgoing Response (with X-Request-ID attached)
```

---

## Files

### [`index.ts`](./index.ts)

The **pipeline orchestrator**. Re-exports all middleware functions for convenience and exposes the main `runMiddleware` function.

| Export | Description |
|---|---|
| `runMiddleware(req, server, next)` | Runs the full middleware chain in order. Any middleware returning a `Response` short-circuits the chain. Unhandled errors from `next()` are caught and returned as a 500. |

All other middleware exports are re-exported from this file for a single import point:

```ts
import { runMiddleware, authCheck, rateLimitCheck } from "../middleware";
```

---

### [`requestId.ts`](./requestId.ts)

Assigns a unique trace ID to every request so it can be correlated across logs.

| Export | Description |
|---|---|
| `injectRequestId(req)` | Reads the incoming `X-Request-ID` header if present (useful for distributed tracing); otherwise generates a new UUID v4. Returns the ID string. |
| `attachRequestId(response, requestId)` | Clones the response and sets the `X-Request-ID` header on the outgoing response so clients can correlate requests. |

---

### [`logger.ts`](./logger.ts)

Structured request/response logger with dual output modes.

| Export | Description |
|---|---|
| `logRequest(req, requestId)` | Logs the incoming request and returns a `logDone(res)` callback. Call `logDone` once the response is ready to emit the final log line with status and latency. |

**Output format:**

- **Development** (`NODE_ENV` ≠ `production`): Human-readable coloured output.
  ```
  → GET /transactions [abc-123]
  ✓ 200 GET /transactions  4ms  [abc-123]
  ```
- **Production** (`NODE_ENV=production`): Structured JSON for log aggregators.
  ```json
  {"requestId":"abc-123","method":"GET","path":"/transactions","status":200,"latencyMs":4,"timestamp":"..."}
  ```

**Exported interface:**

```ts
interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  timestamp: string;
}
```

---

### [`rateLimiter.ts`](./rateLimiter.ts)

In-memory **sliding window rate limiter** keyed by client IP.

| Export | Description |
|---|---|
| `rateLimitCheck(req, serverIp?)` | Returns `null` if the request is within the limit; returns a `429` response with standard rate-limit headers if exceeded. |

**Configuration (environment variables):**

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `60000` (1 min) | Sliding window size in milliseconds. |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Maximum requests allowed per window per IP. |

**Response headers on 429:**

| Header | Description |
|---|---|
| `Retry-After` | Seconds until the window resets. |
| `X-RateLimit-Limit` | Configured max requests. |
| `X-RateLimit-Remaining` | Always `0` when rate-limited. |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets. |

IP resolution respects the `X-Forwarded-For` header when behind a proxy. A background `setInterval` periodically prunes stale entries to prevent unbounded memory growth.

> **Production note:** This is an in-process store — state is not shared across multiple server instances. Replace with a Redis-backed store (e.g. `Bun.redis`) for distributed deployments.

---

### [`auth.ts`](./auth.ts)

API key authentication via the `X-API-Key` request header.

| Export | Description |
|---|---|
| `authCheck(req)` | Returns `null` if the request is authenticated or exempt. Returns a `401` response if the key is missing or invalid. |

**Exempt paths** (no auth required):

| Path prefix | Reason |
|---|---|
| `/health` | Health-check endpoint for load balancers. |
| `/webhooks/` | Webhook endpoints use their own HMAC signature verification. |

**Behaviour by environment:**

| Condition | Result |
|---|---|
| `API_KEY` env var not set, `NODE_ENV` ≠ `production` | Logs a warning but allows the request through (dev convenience). |
| `API_KEY` env var not set, `NODE_ENV=production` | Returns 500 — server misconfiguration. |
| `X-API-Key` header missing | Returns 401. |
| `X-API-Key` header present but wrong | Returns 401 (timing-safe comparison via `safeCompare`). |

---

### [`contentType.ts`](./contentType.ts)

Enforces `Content-Type: application/json` on mutating requests.

| Export | Description |
|---|---|
| `enforceJsonContentType(req)` | Returns `null` if the content type is acceptable; returns a `415 Unsupported Media Type` response otherwise. |

**Applies to:** `POST`, `PUT`, `PATCH`, and `DELETE` (only when a body is present, checked via `Content-Length`).

**Passes through:** `GET`, `HEAD`, `OPTIONS`, and body-less `DELETE` requests.
