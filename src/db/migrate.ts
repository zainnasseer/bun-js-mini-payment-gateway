import { Database } from "bun:sqlite";
import { join } from "node:path";

const dbPath = process.env.DATABASE_URL ?? join(import.meta.dir, "../../data/payment_gateway.db");

console.log(`🔄 Migrating SQLite database at: ${dbPath}`);
const db = new Database(dbPath);

db.exec("PRAGMA foreign_keys = OFF;");
db.exec("BEGIN TRANSACTION;");

try {
  // 1. Create temporary new transactions table with ON DELETE SET NULL on payment_method_id
  db.exec(`
    CREATE TABLE IF NOT EXISTS __new_transactions (
      id                 TEXT PRIMARY KEY NOT NULL,
      user_id            TEXT NOT NULL,
      payment_method_id  TEXT,
      idempotency_key    TEXT NOT NULL,
      amount             INTEGER NOT NULL,
      currency           TEXT NOT NULL,
      status             TEXT DEFAULT 'PENDING' NOT NULL,
      description        TEXT,
      metadata           TEXT,
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON UPDATE NO ACTION ON DELETE SET NULL
    );
  `);

  // 2. Transfer existing rows
  db.exec(`
    INSERT INTO __new_transactions (
      id, user_id, payment_method_id, idempotency_key, amount, currency, status, description, metadata, created_at, updated_at
    )
    SELECT id, user_id, payment_method_id, idempotency_key, amount, currency, status, description, metadata, created_at, updated_at
    FROM transactions;
  `);

  // 3. Swap tables
  db.exec("DROP TABLE transactions;");
  db.exec("ALTER TABLE __new_transactions RENAME TO transactions;");

  // 4. Recreate indices
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(idempotency_key);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tx_user_id ON transactions(user_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);");

  db.exec("COMMIT;");
  console.log("✅ Schema migration committed successfully.");
} catch (err) {
  db.exec("ROLLBACK;");
  console.error("❌ Migration failed, rolled back:", err);
  process.exit(1);
} finally {
  db.exec("PRAGMA foreign_keys = ON;");
}

// 5. Verification
const fkErrors = db.query("PRAGMA foreign_key_check;").all();
if (fkErrors.length > 0) {
  console.warn("⚠️ Foreign key check reported issues:", fkErrors);
} else {
  console.log("✅ Foreign key check passed. Database is ready.");
}

const txCount = db.query("SELECT COUNT(*) as count FROM transactions;").get() as { count: number };
console.log(`📊 Verified transaction count: ${txCount.count}`);
