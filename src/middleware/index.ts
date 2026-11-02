/**
 * Middleware pipeline — composes all middleware in correct order.
 *
 * Execution order:
 *   1. Request ID injection   (always runs)
 *   2. Request logger         (starts timer; completes after handler)
 *   3. Rate limiter           (blocks → 429)
 *   4. Auth check             (blocks → 401)
 *   5. Content-Type guard     (blocks → 415)
 *   6. Route handler          (try/catch → 500)
 *
 * Usage in Bun.serve() fetch fallback:
 *
 *   fetch(req, server) {
 *     return runMiddleware(req, server, () => notFoundHandler(req));
 *   }
 *
 * For route-level middleware, each route handler calls `runMiddleware`
 * before its own logic.
 */

export { injectRequestId, attachRequestId } from "./requestId";
export { logRequest } from "./logger";
export { rateLimitCheck } from "./rateLimiter";
export { enforceJsonContentType } from "./contentType";
export { authCheck } from "./auth";

import { injectRequestId, attachRequestId } from "./requestId";
import { logRequest } from "./logger";
import { rateLimitCheck } from "./rateLimiter";
import { enforceJsonContentType } from "./contentType";
import { authCheck } from "./auth";

/**
 * Runs the full middleware pipeline before calling `next`.
 * Any middleware that returns a Response short-circuits the chain.
 *
 * @param req    - incoming Bun Request
 * @param server - Bun Server instance (used to get client IP)
 * @param next   - the actual route handler to call if middleware passes
 */
export async function runMiddleware(
  req: Request,
  server: { requestIP?: (req: Request) => { address: string } | null } | null,
  next: () => Response | Promise<Response>
): Promise<Response> {
  // 1. Request ID — must come first so all subsequent steps can log it
  const requestId = injectRequestId(req);

  // 2. Logger — captures start time, returns a completion callback
  const logDone = logRequest(req, requestId);

  // 3. Rate limiter
  const ip = server?.requestIP?.(req)?.address;
  const rateLimitRes = rateLimitCheck(req, ip);
  if (rateLimitRes) {
    const res = attachRequestId(rateLimitRes, requestId);
    logDone(res);
    return res;
  }

  // 4. Auth
  const authRes = authCheck(req);
  if (authRes) {
    const res = attachRequestId(authRes, requestId);
    logDone(res);
    return res;
  }

  // 5. Content-Type enforcement
  const ctRes = enforceJsonContentType(req);
  if (ctRes) {
    const res = attachRequestId(ctRes, requestId);
    logDone(res);
    return res;
  }

  // 6. Route handler
  try {
    const handlerRes = await next();
    const res = attachRequestId(handlerRes, requestId);
    logDone(res);
    return res;
  } catch (err) {
    console.error(`[${requestId}] Unhandled error:`, err);
    const { jsonInternalError } = await import("../lib/http");
    const res = attachRequestId(jsonInternalError(err), requestId);
    logDone(res);
    return res;
  }
}
