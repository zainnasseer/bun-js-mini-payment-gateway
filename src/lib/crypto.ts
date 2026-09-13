/**
 * Cryptographic utilities using Bun's native Node.js crypto polyfill.
 * No external dependencies — all functions use `node:crypto` built into Bun.
 */
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Generates a cryptographically secure UUID v4.
 * Used for entity IDs (users, payment_methods, transactions).
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Validates that a client-supplied idempotency key is a well-formed UUID v4.
 * Callers should generate these on the client side and include them in the
 * `Idempotency-Key` request header.
 */
export function isValidIdempotencyKey(key: string): boolean {
  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(key);
}

/**
 * Generates a secure random idempotency key (UUID v4).
 * Exposed for internal use / test seeding — clients should generate their own.
 */
export function generateIdempotencyKey(): string {
  return randomUUID();
}

/**
 * Creates a timing-safe HMAC-SHA256 hex digest.
 * Useful for webhook signature verification.
 *
 * @param secret  - shared secret key
 * @param payload - raw request body string
 */
export function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Timing-safe comparison of two strings.
 * Use this when comparing HMAC signatures to prevent timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");

  if (aBuf.length !== bBuf.length) return false;

  // Node's timingSafeEqual requires same-length Buffers
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Generates a secure random hex token of `byteLength` bytes.
 * Useful for API keys, webhook secrets, etc.
 */
export function generateSecureToken(byteLength: number = 32): string {
  return randomBytes(byteLength).toString("hex");
}
