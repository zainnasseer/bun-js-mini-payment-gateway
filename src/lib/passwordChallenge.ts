import { randomInt } from "node:crypto";
import { hashPassword, verifyPassword } from "./password";

const CHALLENGE_TTL_MS = 15 * 60 * 1000;

export function generateSixDigitCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export async function hashChallengeCode(code: string): Promise<string> {
  return hashPassword(code);
}

export async function verifyChallengeCode(code: string, codeHash: string): Promise<boolean> {
  return verifyPassword(code, codeHash);
}

export function challengeExpiresAt(): string {
  return new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
}

export function isChallengeExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) < Date.now();
}

export const PASSWORD_CHALLENGE_TTL_MINUTES = CHALLENGE_TTL_MS / 60_000;
