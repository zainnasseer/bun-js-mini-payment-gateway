import { test, expect, describe } from "bun:test";
import {
  generateId,
  isValidIdempotencyKey,
  generateIdempotencyKey,
  signPayload,
  safeCompare,
  generateSecureToken,
} from "../../src/lib/crypto";

describe("generateId", () => {
  test("returns a valid UUID v4", () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test("returns unique values each call", () => {
    const ids = Array.from({ length: 100 }, generateId);
    expect(new Set(ids).size).toBe(100);
  });
});

describe("isValidIdempotencyKey", () => {
  test("accepts a valid UUID v4", () => {
    expect(isValidIdempotencyKey(generateIdempotencyKey())).toBe(true);
  });

  test("rejects an empty string", () => {
    expect(isValidIdempotencyKey("")).toBe(false);
  });

  test("rejects a UUID v1", () => {
    expect(isValidIdempotencyKey("550e8400-e29b-11d4-a716-446655440000")).toBe(false);
  });

  test("rejects random garbage", () => {
    expect(isValidIdempotencyKey("not-a-uuid")).toBe(false);
  });

  test("rejects UUID v4 without hyphens", () => {
    expect(isValidIdempotencyKey("550e8400e29b41d4a716446655440000")).toBe(false);
  });
});

describe("signPayload + safeCompare", () => {
  test("produces consistent HMAC for same inputs", () => {
    const sig1 = signPayload("secret", "payload");
    const sig2 = signPayload("secret", "payload");
    expect(sig1).toBe(sig2);
  });

  test("produces different HMAC for different payload", () => {
    const sig1 = signPayload("secret", "payload1");
    const sig2 = signPayload("secret", "payload2");
    expect(sig1).not.toBe(sig2);
  });

  test("produces different HMAC for different secret", () => {
    const sig1 = signPayload("secret1", "payload");
    const sig2 = signPayload("secret2", "payload");
    expect(sig1).not.toBe(sig2);
  });

  test("safeCompare returns true for equal strings", () => {
    expect(safeCompare("abc", "abc")).toBe(true);
  });

  test("safeCompare returns false for different strings", () => {
    expect(safeCompare("abc", "def")).toBe(false);
  });

  test("safeCompare returns false for different lengths", () => {
    expect(safeCompare("abc", "abcd")).toBe(false);
  });
});

describe("generateSecureToken", () => {
  test("returns a hex string of correct length", () => {
    const token = generateSecureToken(32);
    expect(token).toHaveLength(64); // 32 bytes → 64 hex chars
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  test("returns unique values each call", () => {
    const tokens = Array.from({ length: 50 }, () => generateSecureToken());
    expect(new Set(tokens).size).toBe(50);
  });
});
