import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { join } from "node:path";

function migrationDatabaseUrl(): string {
  // Neon: use direct (unpooled) URL for DDL; app runtime uses pooled DATABASE_URL.
  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required to run migrations");
  }
  return url;
}

export async function runMigrations(): Promise<void> {
  const url = migrationDatabaseUrl();

  const client = new SQL(url);
  const db = drizzle(client);
  const migrationsFolder = join(import.meta.dir, "../../drizzle");

  console.log(`🔄 Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("✅ Migrations applied");
}

if (import.meta.main) {
  runMigrations().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });
}
