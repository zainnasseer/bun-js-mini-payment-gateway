import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { consoleAdmins, consolePasswordChallenges } from "../db/schema";
import { generateId } from "../lib/crypto";
import { firstRow } from "../lib/dbQuery";
import { getAuthScope } from "../lib/authContext";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  challengeExpiresAt,
  generateSixDigitCode,
  hashChallengeCode,
  isChallengeExpired,
  PASSWORD_CHALLENGE_TTL_MINUTES,
  verifyChallengeCode,
} from "../lib/passwordChallenge";
import { sendAuthorizationEmail } from "../lib/mail";
import { jsonOk, jsonError, parseJsonBody, jsonInternalError } from "../lib/http";

type RequestChangeBody = {
  current_password?: string;
  new_password?: string;
};

type ConfirmChangeBody = {
  code?: string;
};

function requireConsoleSession(req: Request): Response | { adminId: string; username: string } {
  const scope = getAuthScope(req);
  if (scope.kind !== "admin" || !scope.console) {
    return jsonError("Console authentication required", 401);
  }
  return { adminId: scope.console.adminId, username: scope.console.username };
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length <= 2 ? local.charAt(0) || "*" : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export async function requestPasswordChange(req: Request): Promise<Response> {
  const auth = requireConsoleSession(req);
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody<RequestChangeBody>(req);
  if (!body) return jsonError("Invalid or missing JSON body", 400);

  const currentPassword = body.current_password ?? "";
  const newPassword = body.new_password ?? "";
  if (!currentPassword || !newPassword) {
    return jsonError("current_password and new_password are required", 422);
  }
  if (newPassword.length < 8) {
    return jsonError("new_password must be at least 8 characters", 422);
  }

  try {
    const admin = await firstRow(
      getDb().select().from(consoleAdmins).where(eq(consoleAdmins.id, auth.adminId)).limit(1)
    );
    if (!admin) return jsonError("Account not found", 404);

    const currentOk = await verifyPassword(currentPassword, admin.passwordHash);
    if (!currentOk) return jsonError("Current password is incorrect", 401);

    const sameAsNew = await verifyPassword(newPassword, admin.passwordHash);
    if (sameAsNew) return jsonError("Choose a password different from your current one", 422);

    const code = generateSixDigitCode();
    const codeHash = await hashChallengeCode(code);
    const newPasswordHash = await hashPassword(newPassword);
    const expiresAt = challengeExpiresAt();

    const db = getDb();
    await db.delete(consolePasswordChallenges).where(eq(consolePasswordChallenges.adminId, admin.id));

    await db.insert(consolePasswordChallenges).values({
      id: generateId(),
      adminId: admin.id,
      codeHash,
      newPasswordHash,
      expiresAt,
    });

    const emailText = [
      `Hello ${admin.username},`,
      "",
      "You requested to change your Payment Gateway console password.",
      "",
      `Authorization code: ${code}`,
      "",
      `This code expires in ${PASSWORD_CHALLENGE_TTL_MINUTES} minutes.`,
      "If you did not request this, ignore this email and your password will stay the same.",
    ].join("\n");

    const mail = await sendAuthorizationEmail(
      admin.email,
      "Payment Gateway — password change authorization",
      emailText
    );

    const payload: Record<string, unknown> = {
      message: mail.sent
        ? `Authorization code sent to ${maskEmail(admin.email)}`
        : `Authorization code generated (email not sent — configure SMTP). Check server logs.`,
      emailMasked: maskEmail(admin.email),
      expiresInMinutes: PASSWORD_CHALLENGE_TTL_MINUTES,
      emailSent: mail.sent,
    };

    if (process.env.NODE_ENV !== "production" && !mail.sent) {
      payload.devAuthorizationCode = code;
    }

    return jsonOk(payload);
  } catch (err) {
    return jsonInternalError(err);
  }
}

export async function confirmPasswordChange(req: Request): Promise<Response> {
  const auth = requireConsoleSession(req);
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody<ConfirmChangeBody>(req);
  if (!body) return jsonError("Invalid or missing JSON body", 400);

  const rawCode = body.code?.trim() ?? "";
  if (!/^\d{6}$/.test(rawCode)) {
    return jsonError("code must be a 6-digit number from your email", 422);
  }

  try {
    const challenge = await firstRow(
      getDb()
        .select()
        .from(consolePasswordChallenges)
        .where(eq(consolePasswordChallenges.adminId, auth.adminId))
        .orderBy(desc(consolePasswordChallenges.createdAt))
        .limit(1)
    );

    if (!challenge) {
      return jsonError("No pending password change — request a new authorization code first", 404);
    }
    if (isChallengeExpired(challenge.expiresAt)) {
      await getDb()
        .delete(consolePasswordChallenges)
        .where(eq(consolePasswordChallenges.id, challenge.id));
      return jsonError("Authorization code expired — request a new one", 410);
    }

    const codeOk = await verifyChallengeCode(rawCode, challenge.codeHash);
    if (!codeOk) return jsonError("Invalid authorization code", 401);

    await getDb()
      .update(consoleAdmins)
      .set({ passwordHash: challenge.newPasswordHash })
      .where(eq(consoleAdmins.id, auth.adminId));

    await getDb()
      .delete(consolePasswordChallenges)
      .where(eq(consolePasswordChallenges.adminId, auth.adminId));

    const admin = await firstRow(
      getDb().select({ email: consoleAdmins.email }).from(consoleAdmins).where(eq(consoleAdmins.id, auth.adminId)).limit(1)
    );
    if (admin) {
      await sendAuthorizationEmail(
        admin.email,
        "Payment Gateway — password changed",
        [
          `Hello ${auth.username},`,
          "",
          "Your console password was changed successfully.",
          "If this was not you, contact the platform owner immediately.",
        ].join("\n")
      );
    }

    return jsonOk({ message: "Password updated successfully" });
  } catch (err) {
    return jsonInternalError(err);
  }
}
