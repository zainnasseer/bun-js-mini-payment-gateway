import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { consoleAdmins } from "../db/schema";
import { generateId } from "../lib/crypto";
import { hashPassword } from "../lib/password";
import { firstRow } from "../lib/dbQuery";
import { getAuthScope } from "../lib/authContext";
import { isUniqueViolation } from "../lib/dbErrors";
import {
  jsonOk,
  jsonCreated,
  jsonError,
  jsonNotFound,
  jsonInternalError,
  parseJsonBody,
} from "../lib/http";

type CreateAdminBody = { username?: string; email?: string; password?: string; role?: string };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireConsoleUser(req: Request): Response | { adminId: string; role: "owner" | "admin" } {
  const scope = getAuthScope(req);
  if (scope.kind !== "admin" || !scope.console) {
    return jsonError("Console authentication required", 401);
  }
  return scope.console;
}

export async function listConsoleAdmins(req: Request): Promise<Response> {
  const auth = requireConsoleUser(req);
  if (auth instanceof Response) return auth;

  try {
    const rows = await getDb()
      .select({
        id: consoleAdmins.id,
        username: consoleAdmins.username,
        email: consoleAdmins.email,
        role: consoleAdmins.role,
        createdAt: consoleAdmins.createdAt,
      })
      .from(consoleAdmins)
      .orderBy(consoleAdmins.createdAt);
    return jsonOk(rows);
  } catch (err) {
    return jsonInternalError(err);
  }
}

export async function createConsoleAdmin(req: Request): Promise<Response> {
  const auth = requireConsoleUser(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await parseJsonBody<CreateAdminBody>(req);
    if (!body) return jsonError("Invalid or missing JSON body", 400);

    const username = body.username?.trim().toLowerCase() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    if (!username || username.length < 2) {
      return jsonError("username must be at least 2 characters", 422);
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return jsonError("username may only contain letters, numbers, ., _, -", 422);
    }
    if (!email || !isValidEmail(email)) {
      return jsonError("A valid email is required for authorization messages", 422);
    }
    if (password.length < 8) {
      return jsonError("password must be at least 8 characters", 422);
    }

    let role: "owner" | "admin" = "admin";
    if (body.role === "owner") {
      if (auth.role !== "owner") {
        return jsonError("Only the owner can create another owner account", 403);
      }
      role = "owner";
    } else if (body.role !== undefined && body.role !== "admin") {
      return jsonError("role must be admin or owner", 422);
    }

    const passwordHash = await hashPassword(password);
    const [row] = await getDb()
      .insert(consoleAdmins)
      .values({
        id: generateId(),
        username,
        email,
        passwordHash,
        role,
      })
      .returning({
        id: consoleAdmins.id,
        username: consoleAdmins.username,
        email: consoleAdmins.email,
        role: consoleAdmins.role,
        createdAt: consoleAdmins.createdAt,
      });

    if (!row) return jsonInternalError(new Error("Insert returned no row"));
    return jsonCreated(row);
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError("That username or email is already in use", 409);
    return jsonInternalError(err);
  }
}

export async function deleteConsoleAdmin(
  req: Request & { params: { id: string } }
): Promise<Response> {
  const auth = requireConsoleUser(req);
  if (auth instanceof Response) return auth;
  if (auth.role !== "owner") {
    return jsonError("Only the owner can remove admin accounts", 403);
  }

  try {
    const target = await firstRow(
      getDb().select().from(consoleAdmins).where(eq(consoleAdmins.id, req.params.id)).limit(1)
    );
    if (!target) return jsonNotFound("Admin");
    if (target.role === "owner") {
      return jsonError("Cannot delete the owner account", 403);
    }
    if (target.id === auth.adminId) {
      return jsonError("Use another owner session to delete your account", 403);
    }

    await getDb().delete(consoleAdmins).where(eq(consoleAdmins.id, req.params.id));
    return jsonOk({ id: req.params.id, deleted: true });
  } catch (err) {
    return jsonInternalError(err);
  }
}
