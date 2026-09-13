import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { users } from "../db/schema";
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
import type { CreateUserPayload } from "../types";

// ─── GET /users ───────────────────────────────────────────────────────────────

export async function listUsers(_req: Request): Promise<Response> {
  try {
    const allUsers = await getDb().select().from(users).orderBy(users.createdAt);
    return jsonOk(allUsers);
  } catch (err) {
    return jsonInternalError(err);
  }
}

// ─── GET /users/:id ───────────────────────────────────────────────────────────

export async function getUser(
  req: Request & { params: { id: string } }
): Promise<Response> {
  try {
    const user = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, req.params.id))
      .get();

    if (!user) return jsonNotFound("User");
    return jsonOk(user);
  } catch (err) {
    return jsonInternalError(err);
  }
}

// ─── POST /users ──────────────────────────────────────────────────────────────

export async function createUser(req: Request): Promise<Response> {
  try {
    const body = await parseJsonBody<CreateUserPayload>(req);
    if (!body) return jsonError("Invalid or missing JSON body");

    const validationError = validateRequiredFields(
      body as unknown as Record<string, unknown>,
      ["email", "name"]
    );
    if (validationError) return jsonError(validationError, 422);

    const { email, name } = body;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError("Invalid email address format", 422);
    }

    const db = getDb();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (existing) return jsonError("A user with this email already exists", 409);

    const id = generateId();
    const [user] = await db.insert(users).values({ id, email, name }).returning();

    return jsonCreated(user);
  } catch (err) {
    return jsonInternalError(err);
  }
}
