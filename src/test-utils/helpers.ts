/**
 * Test utilities shared across all test files.
 */

import type { ApiResponse } from "../../src/types";

/**
 * Typed wrapper around Response.json() — avoids the `unknown` return type
 * that TS produces for res.json() in strict mode.
 */
export async function json<T = ApiResponse>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

/** Build a POST Request with JSON body and optional extra headers. */
export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Build a GET Request. */
export function get(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

/** Build any request and attach Bun-style params to it. */
export function reqWithParams(
  method: string,
  path: string,
  params: Record<string, string>,
  body?: unknown,
  headers: Record<string, string> = {}
): Request & { params: Record<string, string> } {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return Object.assign(req, { params });
}
