/** Parses transaction `metadata` JSON; returns `{}` when empty. */
export function parseTransactionMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("INVALID_METADATA");
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_METADATA") throw err;
    throw new Error("INVALID_METADATA");
  }
}

/** Lenient parse for background jobs — never throws. */
export function parseTransactionMetadataLenient(raw: string | null | undefined): Record<string, unknown> {
  try {
    return parseTransactionMetadata(raw);
  } catch {
    return {};
  }
}
