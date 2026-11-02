import type { ApiResponse } from "../../src/types";

export type CallMeta = {
  method: string;
  path: string;
};

export type ApiCallResult = {
  meta: CallMeta;
  ok: boolean;
  status: number;
  requestId: string | null;
  durationMs: number;
  body: ApiResponse;
};

export type ApiClientOptions = {
  apiKey: string;
};

export async function apiCall(
  meta: CallMeta,
  init: RequestInit,
  options: ApiClientOptions
): Promise<ApiCallResult> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (options.apiKey) {
    headers.set("X-API-Key", options.apiKey);
  }

  const start = performance.now();
  const res = await fetch(meta.path, { ...init, headers });
  const durationMs = Math.round(performance.now() - start);

  let body: ApiResponse;
  try {
    body = (await res.json()) as ApiResponse;
  } catch {
    body = { success: false, error: "Response was not valid JSON" };
  }

  return {
    meta,
    ok: res.ok,
    status: res.status,
    requestId: res.headers.get("X-Request-ID"),
    durationMs,
    body,
  };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
