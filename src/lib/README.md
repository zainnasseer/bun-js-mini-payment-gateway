# `src/lib` — Shared Utility Library

This folder contains **pure, reusable utility modules** with no knowledge of HTTP routing or middleware concerns. Every file here is independently testable and can be imported anywhere in the codebase.

---

## Files

### [`crypto.ts`](./crypto.ts)

Cryptographic utilities built on top of Bun's native `node:crypto` polyfill — **no external dependencies**.

| Export         | Description                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `generateId()` | Generates a cryptographically secure UUID v4. Used as the primary ID for entities (users, payment methods, transactions). |

| `isValidIdempotencyKey(key)` | Validates that a client-supplied idempotency key is a well-formed UUID v4. |

| `generateIdempotencyKey()` | Generates a random UUID v4. Intended for internal use / test seeding; clients should generate their own. |

| `signPayload(secret, payload)` | Creates a timing-safe HMAC-SHA256 hex digest. Useful for webhook signature verification. |

| `safeCompare(a, b)` | Compares two strings in constant time using `timingSafeEqual` to prevent timing attacks. |

| `generateSecureToken(byteLength?)` | Generates a secure random hex token of `byteLength` bytes (default: 32). Useful for API keys and webhook secrets. |

---

### [`http.ts`](./http.ts)

Response factory and request parsing helpers that standardise the JSON API envelope (`{ success, data }` / `{ success, error }`).

#### Response Helpers

| Export                        | Status        | Description                                                                                     |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `jsonOk(data, status?)`       | 200 (default) | Wraps `data` in a success envelope.                                                             |
| `jsonCreated(data)`           | 201           | Shortcut for resource-creation responses.                                                       |
| `jsonError(message, status?)` | 400 (default) | Wraps `message` in an error envelope.                                                           |
| `jsonNotFound(resource?)`     | 404           | Returns a "not found" error for a named resource.                                               |
| `jsonConflict(message)`       | 409           | Used for duplicate-resource / idempotency conflicts.                                            |
| `jsonUnprocessable(message)`  | 422           | Used for semantic validation failures.                                                          |
| `jsonInternalError(err?)`     | 500           | In `development` mode, exposes the raw error message; in production, returns a generic message. |

#### Request Helpers

| Export                                | Description                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseJsonBody<T>(req)`               | Safely parses the JSON body of a request. Returns `null` if the body is empty or malformed — never throws.                                      |
| `validateRequiredFields(obj, fields)` | Checks that all listed field names are present and non-empty. Returns the first missing-field error message, or `null` if all fields are valid. |

---

### [`processor.ts`](./processor.ts)

A **mock payment processor** that simulates asynchronous transaction settlement.

| Export                             | Description                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitToProcessor(transactionId)` | Schedules a `setTimeout` that, after a configurable delay, randomly marks the transaction as `AUTHORIZED` or `FAILED` and writes the result back to the database. |

**Configuration (environment variables):**

| Variable                 | Default | Description                                          |
| ------------------------ | ------- | ---------------------------------------------------- |
| `PROCESSOR_DELAY_MS`     | `3000`  | How long (ms) to wait before settling a transaction. |
| `PROCESSOR_SUCCESS_RATE` | `0.85`  | Probability (0–1) that a transaction is authorized.  |

When a transaction fails, a random failure reason is chosen from a fixed list (e.g. "Insufficient funds", "Card declined by issuer"). The processor reference and outcome are stored in the transaction's `metadata` JSON column.

> **Note:** This is an in-process, single-instance implementation. In production, replace with a proper job queue (e.g. BullMQ, Bun's native workers) to survive server restarts.

---

## Test Files

### [`crypto.test.ts`](./crypto.test.ts)

Unit tests for `crypto.ts` using `bun:test`. Covers:

- UUID v4 format and uniqueness for `generateId`
- Valid/invalid inputs for `isValidIdempotencyKey` (UUID v1, no hyphens, garbage strings)
- HMAC consistency and secret/payload sensitivity for `signPayload`
- Equal/different-length string handling for `safeCompare`
- Correct hex length and uniqueness for `generateSecureToken`

### [`http.test.ts`](./http.test.ts)

Unit tests for `http.ts`. Covers:

- Status codes and JSON envelope shape for all response helpers (`jsonOk`, `jsonCreated`, `jsonError`, `jsonNotFound`)
- `Content-Type: application/json` header is always set
- `parseJsonBody` handling of valid JSON, empty bodies, and malformed JSON
- `validateRequiredFields` handling of missing fields, empty strings, and `null` values
