import { randomUUID } from "node:crypto";

/**
 * Injects a unique `X-Request-ID` into the request object so downstream
 * handlers and the logger can reference it. If the client already sent one,
 * we reuse it (useful for distributed tracing).
 *
 * Call this as the very first step in your fetch pipeline.
 */
export function injectRequestId(req: Request): string {
  const existing = req.headers.get("X-Request-ID");
  return existing ?? randomUUID();
}

/**
 * Attaches the request ID to an outgoing Response.
 * Always use this before returning from the top-level fetch handler.
 */
export function attachRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
