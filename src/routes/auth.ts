import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { consoleAdmins } from "../db/schema";
import { firstRow } from "../lib/dbQuery";
import { createConsoleSessionToken } from "../lib/consoleSession";
import { verifyPassword } from "../lib/password";
import { getAuthScope } from "../lib/authContext";
import { jsonOk, jsonError, parseJsonBody } from "../lib/http";

type LoginBody = { username?: string; password?: string };

export async function loginConsoleAdmin(req: Request): Promise<Response> {
  const body = await parseJsonBody<LoginBody>(req);
  if (!body) return jsonError("Invalid or missing JSON body", 400);

  const username = body.username?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!username || !password) {
    return jsonError("username and password are required", 422);
  }

  const row = await firstRow(
    getDb()
      .select()
      .from(consoleAdmins)
      .where(eq(consoleAdmins.username, username))
      .limit(1)
  );
  if (!row) return jsonError("Invalid username or password", 401);

  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return jsonError("Invalid username or password", 401);

  const token = createConsoleSessionToken({
    adminId: row.id,
    username: row.username,
    role: row.role,
  });

  return jsonOk({
    token,
    user: { id: row.id, username: row.username, email: row.email, role: row.role },
  });
}

export async function getConsoleSession(req: Request): Promise<Response> {
  const scope = getAuthScope(req);
  if (scope.kind !== "admin" || !scope.console) {
    return jsonError("Not authenticated", 401);
  }
  const row = await firstRow(
    getDb()
      .select({
        id: consoleAdmins.id,
        username: consoleAdmins.username,
        email: consoleAdmins.email,
        role: consoleAdmins.role,
      })
      .from(consoleAdmins)
      .where(eq(consoleAdmins.id, scope.console.adminId))
      .limit(1)
  );
  if (!row) return jsonError("Account not found", 404);

  return jsonOk(row);
}
