export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      const msg = current.message.toLowerCase();
      if (
        msg.includes("unique constraint failed") ||
        msg.includes("duplicate key value") ||
        msg.includes("sqlite_constraint_unique")
      ) {
        return true;
      }
      const code = (current as { code?: string }).code;
      if (code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE") return true;
      current = "cause" in current ? (current as Error).cause : null;
    } else {
      break;
    }
  }
  return false;
}
