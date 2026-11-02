export function isSqliteUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("unique constraint failed") || msg.includes("sqlite_constraint_unique");
}
