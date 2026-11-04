import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _sql: SQL | null = null;
let _db: DrizzleDb | null = null;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required (PostgreSQL — local Docker, Neon pooled URL, etc.)"
    );
  }
  return url;
}

export function resetDbSingleton(): void {
  _db = null;
  _sql = null;
}

export function getDb(): DrizzleDb {
  if (_db) return _db;

  const url = getDatabaseUrl();
  _sql = new SQL(url);
  _db = drizzle(_sql, { schema, logger: false });
  console.log(`✅ Drizzle client initialised (PostgreSQL)`);
  return _db;
}

export type DB = DrizzleDb;

/** Runs Drizzle migrations, then truncates all tables (integration tests). */
export async function prepareTestDatabase(): Promise<void> {
  resetDbSingleton();
  await runMigrations();
  const db = getDb();
  await db.execute(
    sql`TRUNCATE TABLE merchant_webhook_deliveries, transactions, merchants RESTART IDENTITY CASCADE`
  );
}

/** Applies SQL migrations — use on deploy and locally after schema changes. */
export async function initSchema(): Promise<void> {
  resetDbSingleton();
  await runMigrations();
}
