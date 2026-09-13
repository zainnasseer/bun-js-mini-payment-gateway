import { jsonError } from "../lib/http";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Enforces `Content-Type: application/json` on all mutating requests
 * (POST, PUT, PATCH, DELETE) that carry a body.
 *
 * Returns a 415 Unsupported Media Type response if the header is missing
 * or wrong. Returns null if the request is acceptable.
 */
export function enforceJsonContentType(req: Request): Response | null {
  if (!MUTATING_METHODS.has(req.method)) return null;

  // DELETE requests typically have no body — skip them unless body is present
  if (req.method === "DELETE" && !req.headers.get("Content-Length")) return null;

  const contentType = req.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      `Content-Type must be application/json for ${req.method} requests. Got: ${contentType || "(none)"}`,
      415
    );
  }

  return null; // request is acceptable
}
