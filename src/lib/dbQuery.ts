/** Single-row fetch for PostgreSQL (replaces bun-sqlite `.get()`). */
export async function firstRow<T>(rowsPromise: Promise<T[]>): Promise<T | undefined> {
  const rows = await rowsPromise;
  return rows[0];
}
