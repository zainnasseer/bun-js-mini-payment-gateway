import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sql } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import * as schema from "./schema";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// ─── Lazy singleton ───────────────────────────────────────────────────────────
//
// The db instance is created on first call to getDb(), NOT at import time.
// This is critical for test isolation: each test file sets DATABASE_URL=":memory:"
// BEFORE importing route handlers. Since route handlers call getDb() lazily,
// they pick up the correct env var.

let _sqlite: Database | null = null;
let _db: DrizzleDb | null = null;

export function getDb(): DrizzleDb {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_URL ?? join(import.meta.dir, "../../data/payment_gateway.db");

  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
    console.log(`✅ Drizzle client initialised (${dbPath})`);
  }

  _sqlite = new Database(dbPath, { create: true });
  _sqlite.exec("PRAGMA journal_mode = WAL;");
  _sqlite.exec("PRAGMA foreign_keys = ON;");

  _db = drizzle(_sqlite, { schema, logger: false });
  return _db;
}

export type DB = DrizzleDb;

// ─── Test helper ─────────────────────────────────────────────────────────────
//
// Called in beforeAll() of each integration test file.
// Resets the singleton so it re-reads DATABASE_URL = ":memory:",
// then creates all tables via raw DDL.

export const TEST_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT    NOT NULL PRIMARY KEY,
  email       TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS payment_methods (
  id            TEXT    NOT NULL PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT    NOT NULL CHECK (type IN ('CARD','BANK_ACCOUNT','DIGITAL_WALLET')),
  token_id      TEXT    NOT NULL UNIQUE,
  last_four     TEXT    NOT NULL,
  expiry_month  INTEGER NOT NULL,
  expiry_year   INTEGER NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pm_user_id ON payment_methods(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_token_id ON payment_methods(token_id);

CREATE TABLE IF NOT EXISTS transactions (
  id                 TEXT    NOT NULL PRIMARY KEY,
  user_id            TEXT    NOT NULL REFERENCES users(id),
  payment_method_id  TEXT    REFERENCES payment_methods(id) ON DELETE SET NULL,
  idempotency_key    TEXT    NOT NULL UNIQUE,
  amount             INTEGER NOT NULL,
  currency           TEXT    NOT NULL CHECK (currency IN ('USD','EUR','GBP','JPY','AED','SAR')),
  status             TEXT    NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING','AUTHORIZED','CAPTURED','FAILED','REFUNDED')),
  description        TEXT,
  metadata           TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user_id ON transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
`;

export function applyTestSchema(): void {
  _db = null;               // force re-creation from current DATABASE_URL env var
  _sqlite = null;
  getDb();
  _sqlite!.exec(TEST_DDL);
}
