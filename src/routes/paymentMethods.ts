import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/database";
import { users, paymentMethods, PAYMENT_METHOD_TYPES } from "../db/schema";
import { generateId } from "../lib/crypto";
import {
  jsonOk,
  jsonCreated,
  jsonError,
  jsonNotFound,
  jsonInternalError,
  parseJsonBody,
  validateRequiredFields,
} from "../lib/http";
import type { CreatePaymentMethodPayload } from "../types";

// ─── GET /users/:userId/payment-methods ──────────────────────────────────────

export async function listPaymentMethods(
  req: Request & { params: { userId: string } }
): Promise<Response> {
  try {
    const db = getDb();

    const user = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, req.params.userId))
      .get();

    if (!user) return jsonNotFound("User");

    const methods = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, req.params.userId))
      .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));

    return jsonOk(methods);
  } catch (err) {
    return jsonInternalError(err);
  }
}

// ─── POST /users/:userId/payment-methods ─────────────────────────────────────

export async function createPaymentMethod(
  req: Request & { params: { userId: string } }
): Promise<Response> {
  try {
    const body = await parseJsonBody<
      CreatePaymentMethodPayload & Record<string, unknown>
    >(req);
    if (!body) return jsonError("Invalid or missing JSON body");

    // PCI-DSS guard
    if ("pan" in body || "card_number" in body || "cvv" in body || "cvc" in body) {
      return jsonError(
        "Raw cardholder data (PAN, CVV) must never be sent to this API. Use client-side tokenization.",
        400
      );
    }

    const validationError = validateRequiredFields(body as Record<string, unknown>, [
      "type", "token_id", "last_four", "expiry_month", "expiry_year",
    ]);
    if (validationError) return jsonError(validationError, 422);

    const { type, token_id, last_four, expiry_month, expiry_year, is_default = false } = body;

    if (!PAYMENT_METHOD_TYPES.includes(type as (typeof PAYMENT_METHOD_TYPES)[number])) {
      return jsonError(`Invalid type. Must be one of: ${PAYMENT_METHOD_TYPES.join(", ")}`, 422);
    }

    if (!/^\d{4}$/.test(String(last_four))) {
      return jsonError("last_four must be exactly 4 digits", 422);
    }

    const month = Number(expiry_month);
    const year  = Number(expiry_year);
    if (month < 1 || month > 12 || year < new Date().getFullYear()) {
      return jsonError("Invalid expiry month or year", 422);
    }

    // Atomic: default swap + insert
    const method = await getDb().transaction(async (tx) => {
      const user = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, req.params.userId))
        .get();

      if (!user) return null;

      const existingToken = await tx
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(eq(paymentMethods.tokenId, String(token_id)))
        .get();

      if (existingToken) throw new Error("DUPLICATE_TOKEN");

      if (is_default) {
        await tx
          .update(paymentMethods)
          .set({ isDefault: false })
          .where(eq(paymentMethods.userId, req.params.userId));
      }

      const [inserted] = await tx
        .insert(paymentMethods)
        .values({
          id:          generateId(),
          userId:      req.params.userId,
          type:        type as (typeof PAYMENT_METHOD_TYPES)[number],
          tokenId:     String(token_id),
          lastFour:    String(last_four),
          expiryMonth: month,
          expiryYear:  year,
          isDefault:   Boolean(is_default),
        })
        .returning();

      return inserted;
    });

    if (!method) return jsonNotFound("User");

    return jsonCreated(method);
  } catch (err) {
    if (err instanceof Error && err.message === "DUPLICATE_TOKEN") {
      return jsonError("This payment method token is already registered", 409);
    }
    return jsonInternalError(err);
  }
}

// ─── DELETE /users/:userId/payment-methods/:methodId ─────────────────────────

export async function deletePaymentMethod(
  req: Request & { params: { userId: string; methodId: string } }
): Promise<Response> {
  try {
    const db = getDb();

    const method = await db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.id,     req.params.methodId),
          eq(paymentMethods.userId, req.params.userId)
        )
      )
      .get();

    if (!method) return jsonNotFound("Payment method");

    await db.delete(paymentMethods).where(eq(paymentMethods.id, req.params.methodId));

    return jsonOk({ message: "Payment method deleted successfully" });
  } catch (err) {
    return jsonInternalError(err);
  }
}
