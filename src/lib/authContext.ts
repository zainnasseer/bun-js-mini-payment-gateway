import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { merchants } from "../db/schema";
import { firstRow } from "./dbQuery";
import { safeCompare } from "./crypto";
import type { Merchant } from "../types";

export type AuthScope =
  | { kind: "admin" }
  | { kind: "merchant"; merchant: Merchant }
  | { kind: "anonymous" };

const AUTH_SCOPE = Symbol("authScope");

type RequestWithAuth = Request & { [AUTH_SCOPE]?: AuthScope };

export function attachAuthScope(req: Request, scope: AuthScope): void {
  (req as RequestWithAuth)[AUTH_SCOPE] = scope;
}

export function getAuthScope(req: Request): AuthScope {
  return (req as RequestWithAuth)[AUTH_SCOPE] ?? { kind: "anonymous" };
}

/** Uses attached scope from middleware, or resolves X-API-Key (for direct handler tests). */
export async function resolveAuthScope(req: Request): Promise<AuthScope> {
  const attached = getAuthScope(req);
  if (attached.kind !== "anonymous") return attached;

  const supplied = req.headers.get("X-API-Key") ?? "";
  if (!supplied) return { kind: "anonymous" };

  if (isAdminApiKey(supplied)) return { kind: "admin" };

  const merchant = await resolveMerchantByApiKey(supplied);
  if (merchant) return { kind: "merchant", merchant };

  return { kind: "anonymous" };
}

export async function resolveMerchantByApiKey(apiKey: string): Promise<Merchant | null> {
  if (!apiKey) return null;
  const row = await firstRow(
    getDb().select().from(merchants).where(eq(merchants.apiKey, apiKey)).limit(1)
  );
  return row ?? null;
}

export function isAdminApiKey(supplied: string): boolean {
  const adminKey = process.env.API_KEY?.trim() ?? "";
  if (!adminKey || !supplied) return false;
  return safeCompare(supplied, adminKey);
}
