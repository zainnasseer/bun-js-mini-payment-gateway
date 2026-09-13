import type { ApiResponse } from "../types";

// ─── Response Helpers ─────────────────────────────────────────────────────────

export function jsonOk<T>(data: T, status: number = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonCreated<T>(data: T): Response {
  return jsonOk(data, 201);
}

export function jsonError(message: string, status: number = 400): Response {
  const body: ApiResponse = { success: false, error: message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonNotFound(resource: string = "Resource"): Response {
  return jsonError(`${resource} not found`, 404);
}

export function jsonConflict(message: string): Response {
  return jsonError(message, 409);
}

export function jsonUnprocessable(message: string): Response {
  return jsonError(message, 422);
}

export function jsonInternalError(err?: unknown): Response {
  const message =
    process.env.NODE_ENV === "development" && err instanceof Error
      ? err.message
      : "Internal server error";
  return jsonError(message, 500);
}

// ─── Request Parsing ──────────────────────────────────────────────────────────

/**
 * Safely parses the JSON body of a request.
 * Returns null if the body is missing or malformed.
 */
export async function parseJsonBody<T = Record<string, unknown>>(
  req: Request
): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

export function validateRequiredFields(
  obj: Record<string, unknown>,
  fields: string[]
): string | null {
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === "") {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}
