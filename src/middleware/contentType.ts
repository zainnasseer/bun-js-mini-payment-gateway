import { jsonError } from "../lib/http";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestLikelyHasBody(req: Request): boolean {
  const contentLength = req.headers.get("Content-Length");
  if (contentLength !== null && contentLength !== "" && Number(contentLength) > 0) {
    return true;
  }
  const transferEncoding = req.headers.get("Transfer-Encoding")?.toLowerCase() ?? "";
  return transferEncoding.includes("chunked");
}

/**
 * Enforces `Content-Type: application/json` on all mutating requests
 * (POST, PUT, PATCH, DELETE) that carry a body.
 *
 * Returns a 415 Unsupported Media Type response if the header is missing
 * or wrong. Returns null if the request is acceptable.
 */
export function enforceJsonContentType(req: Request): Response | null {
  if (!MUTATING_METHODS.has(req.method)) return null;

  // DELETE requests typically have no body — skip unless a body is likely present
  if (req.method === "DELETE" && !requestLikelyHasBody(req)) return null;

  const contentType = req.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      `Content-Type must be application/json for ${req.method} requests. Got: ${contentType || "(none)"}`,
      415
    );
  }

  return null; // request is acceptable
}
