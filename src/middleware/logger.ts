/**
 * Structured request/response logger.
 *
 * Logs one line per request in the format:
 *   → METHOD /path [req-id]
 *   ← STATUS METHOD /path  latencyMs  [req-id]
 *
 * In production (NODE_ENV=production) we emit JSON for easy ingestion
 * by log aggregators. In development we use a human-readable format.
 */

const IS_PROD = process.env.NODE_ENV === "production";

export interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  timestamp: string;
}

/**
 * Call BEFORE dispatching the request to a handler.
 * Returns a `done` function — call it with the Response once you have one.
 */
export function logRequest(
  req: Request,
  requestId: string
): (res: Response) => void {
  const start = performance.now();
  const url = new URL(req.url);

  if (!IS_PROD) {
    console.log(`→ ${req.method} ${url.pathname} [${requestId}]`);
  }

  return function logResponse(res: Response): void {
    const latencyMs = Math.round(performance.now() - start);
    const log: RequestLog = {
      requestId,
      method: req.method,
      path: url.pathname,
      status: res.status,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    if (IS_PROD) {
      console.log(JSON.stringify(log));
    } else {
      const statusIcon = res.status < 400 ? "✓" : "✗";
      const color = res.status < 400 ? "\x1b[32m" : "\x1b[31m"; // green / red
      const reset = "\x1b[0m";
      console.log(
        `${color}${statusIcon}${reset} ${res.status} ${req.method} ${url.pathname}  ${latencyMs}ms  [${requestId}]`
      );
    }
  };
}
