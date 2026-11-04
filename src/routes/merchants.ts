import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { merchants } from "../db/schema";
import { generateId, generateSecureToken } from "../lib/crypto";
import { firstRow } from "../lib/dbQuery";
import { isUniqueViolation } from "../lib/dbErrors";
import { assertPlatformAdmin, resolveAuthScope } from "../lib/authContext";
import {
  jsonOk,
  jsonCreated,
  jsonError,
  jsonNotFound,
  jsonInternalError,
  parseJsonBody,
  validateRequiredFields,
} from "../lib/http";
import type {
  CreateMerchantPayload,
  Merchant,
  MerchantResponse,
  UpdateMerchantPayload,
} from "../types";

function parseIpWhitelist(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((ip): ip is string => typeof ip === "string" && ip.length > 0);
  } catch {
    return [];
  }
}

function serializeIpWhitelist(ips: string[] | undefined): string {
  return JSON.stringify((ips ?? []).map((ip) => ip.trim()).filter(Boolean));
}

function toMerchantResponse(row: Merchant): MerchantResponse {
  const { ipWhitelist, ...rest } = row;
  return { ...rest, ipWhitelist: parseIpWhitelist(ipWhitelist) };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateIpList(ips: string[] | undefined): string | null {
  if (ips === undefined) return null;
  if (!Array.isArray(ips)) return "ip_whitelist must be an array of IP strings";
  for (const ip of ips) {
    if (typeof ip !== "string" || !ip.trim()) {
      return "Each ip_whitelist entry must be a non-empty string";
    }
  }
  return null;
}

async function assertMerchantSelfOrAdmin(
  req: Request,
  merchantId: string
): Promise<Response | null> {
  const scope = await resolveAuthScope(req);
  if (scope.kind === "admin") return null;
  if (scope.kind === "merchant" && scope.merchant.id === merchantId) return null;
  return jsonError("Forbidden", 403);
}

export async function listMerchants(req: Request): Promise<Response> {
  const denied = await assertPlatformAdmin(req);
  if (denied) return denied;
  try {
    const rows = await getDb().select().from(merchants).orderBy(merchants.createdAt);
    return jsonOk(rows.map(toMerchantResponse));
  } catch (err) {
    return jsonInternalError(err);
  }
}

export async function getMerchant(
  req: Request & { params: { id: string } }
): Promise<Response> {
  const denied = await assertMerchantSelfOrAdmin(req, req.params.id);
  if (denied) return denied;
  try {
    const row = await firstRow(
      getDb().select().from(merchants).where(eq(merchants.id, req.params.id)).limit(1)
    );
    if (!row) return jsonNotFound("Merchant");
    return jsonOk(toMerchantResponse(row));
  } catch (err) {
    return jsonInternalError(err);
  }
}

export async function createMerchant(req: Request): Promise<Response> {
  try {
    const body = await parseJsonBody<CreateMerchantPayload>(req);
    if (!body) return jsonError("Invalid or missing JSON body");

    const validationError = validateRequiredFields(
      body as unknown as Record<string, unknown>,
      ["name", "email", "webhook_url", "phone_number", "origin_header"]
    );
    if (validationError) return jsonError(validationError, 422);

    const ipError = validateIpList(body.ip_whitelist);
    if (ipError) return jsonError(ipError, 422);

    if (!isValidEmail(body.email)) return jsonError("Invalid email address format", 422);
    if (!isValidUrl(body.webhook_url)) {
      return jsonError("webhook_url must be a valid http(s) URL", 422);
    }
    if (!body.origin_header.trim()) return jsonError("origin_header is required", 422);

    const apiKey = body.api_key?.trim() || generateSecureToken(32);
    const webhookSecret = body.webhook_secret?.trim() || generateSecureToken(32);

    const db = getDb();
    const id = generateId();
    const [row] = await db
      .insert(merchants)
      .values({
        id,
        name: body.name.trim(),
        email: body.email.trim(),
        webhookUrl: body.webhook_url.trim(),
        phoneNumber: body.phone_number.trim(),
        originHeader: body.origin_header.trim(),
        ipWhitelist: serializeIpWhitelist(body.ip_whitelist),
        apiKey,
        webhookSecret,
      })
      .returning();

    if (!row) return jsonInternalError(new Error("Insert returned no row"));
    return jsonCreated(toMerchantResponse(row));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonError("A merchant with this email or api_key already exists", 409);
    }
    return jsonInternalError(err);
  }
}

export async function updateMerchant(
  req: Request & { params: { id: string } }
): Promise<Response> {
  const denied = await assertMerchantSelfOrAdmin(req, req.params.id);
  if (denied) return denied;
  try {
    const body = await parseJsonBody<UpdateMerchantPayload>(req);
    if (!body) return jsonError("Invalid or missing JSON body");

    const ipError = validateIpList(body.ip_whitelist);
    if (ipError) return jsonError(ipError, 422);

    if (body.email !== undefined && !isValidEmail(body.email)) {
      return jsonError("Invalid email address format", 422);
    }
    if (body.webhook_url !== undefined && !isValidUrl(body.webhook_url)) {
      return jsonError("webhook_url must be a valid http(s) URL", 422);
    }
    if (body.origin_header !== undefined && !body.origin_header.trim()) {
      return jsonError("origin_header cannot be empty", 422);
    }

    const db = getDb();
    const existing = await firstRow(
      db.select().from(merchants).where(eq(merchants.id, req.params.id)).limit(1)
    );
    if (!existing) return jsonNotFound("Merchant");

    const patch: Partial<typeof merchants.$inferInsert> = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.email !== undefined) patch.email = body.email.trim();
    if (body.webhook_url !== undefined) patch.webhookUrl = body.webhook_url.trim();
    if (body.phone_number !== undefined) patch.phoneNumber = body.phone_number.trim();
    if (body.origin_header !== undefined) patch.originHeader = body.origin_header.trim();
    if (body.ip_whitelist !== undefined) patch.ipWhitelist = serializeIpWhitelist(body.ip_whitelist);
    if (body.api_key !== undefined) patch.apiKey = body.api_key.trim();
    if (body.webhook_secret !== undefined) patch.webhookSecret = body.webhook_secret.trim();

    if (Object.keys(patch).length === 0) {
      return jsonError("No updatable fields provided", 422);
    }

    const [row] = await db
      .update(merchants)
      .set(patch)
      .where(eq(merchants.id, req.params.id))
      .returning();

    if (!row) return jsonNotFound("Merchant");
    return jsonOk(toMerchantResponse(row));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonError("A merchant with this email or api_key already exists", 409);
    }
    return jsonInternalError(err);
  }
}

export async function deleteMerchant(
  req: Request & { params: { id: string } }
): Promise<Response> {
  const denied = await assertPlatformAdmin(req);
  if (denied) return denied;
  try {
    const db = getDb();
    const existing = await firstRow(
      db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, req.params.id)).limit(1)
    );
    if (!existing) return jsonNotFound("Merchant");

    await db.delete(merchants).where(eq(merchants.id, req.params.id));
    return jsonOk({ id: req.params.id, deleted: true });
  } catch (err) {
    return jsonInternalError(err);
  }
}
