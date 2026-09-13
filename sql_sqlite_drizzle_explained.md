# SQL, SQLite & Drizzle ORM — Project Explainer

> A beginner-friendly breakdown for developers coming from TypeORM + PostgreSQL.

---

## 🧠 SQL vs SQLite — What's the Difference?

### SQL (Structured Query Language)
- **SQL is a language**, not a database itself.
- It's the universal language used to interact with relational databases (create tables, insert rows, query data, etc.)
- Every database system (PostgreSQL, MySQL, SQLite, etc.) **uses SQL**, but each has its own dialect/extensions.

### SQLite
- **SQLite is a database engine** (like PostgreSQL), but with a key difference:
- **It's a file-based database** — no separate server process needed. The entire database lives in a single `.db` file on disk.
- Lightweight, zero-configuration, perfect for local dev/embedded apps.
- In this project: `data/payment_gateway.db` is your database file.

| Feature | PostgreSQL (what you know) | SQLite (this project) |
|---|---|---|
| **Type** | Full server-based DB | Embedded, file-based DB |
| **Needs a server** | ✅ Yes (`pg` process) | ❌ No — just a file |
| **Language** | SQL (PostgreSQL dialect) | SQL (SQLite dialect) |
| **Scale** | Production-grade, multi-user | Great for dev/small apps |
| **Native ENUMs** | ✅ Yes | ❌ No → uses `CHECK` constraints |
| **Booleans** | ✅ Native `BOOLEAN` | ❌ Stored as `0/1` integers |

---

## 🗂️ Project File Map

```
/data/payment_gateway.db   ← the actual SQLite database FILE
/src/db/
  schema.ts                ← Drizzle ORM schema (TypeScript)
  schema.sql               ← raw SQL version (reference / manual setup)
  database.ts              ← connection + singleton setup
  migrate.ts               ← one-off migration script
/drizzle.config.ts         ← Drizzle Kit config (CLI tool config)
```

---

## 📄 File-by-File Explanation

### 1. `src/db/schema.ts` — The Drizzle ORM Schema

This is the **TypeScript equivalent of your TypeORM entity files**. Instead of decorators like `@Entity()`, Drizzle uses functions like `sqliteTable()`.

```typescript
// TypeORM way (what you know)
@Entity() class User { @PrimaryColumn() id: string; ... }

// Drizzle way (this project)
export const users = sqliteTable("users", {
  id:    text("id").primaryKey(),
  email: text("email").notNull().unique(),
  ...
});
```

**What it defines:**

| Table | Description |
|---|---|
| `users` | User accounts with email + name |
| `paymentMethods` | Linked card/bank/wallet tokens (no raw card data — PCI-DSS safe) |
| `transactions` | Payment transactions with status state machine |

**Key design decisions:**
- 💰 Money is stored as **integers (cents)** — never floats (avoids rounding bugs)
- 🔒 No `pan`/`cvv` columns — only opaque `tokenId` (PCI-DSS compliance)
- ✅ Booleans are `integer({ mode: "boolean" })` → SQLite stores `0`/`1`, Drizzle converts for you
- ⏰ Timestamps are ISO 8601 text strings, set via `$defaultFn(now)`

The **Relations block** (like TypeORM's `@OneToMany`) tells Drizzle how tables relate for typed joins:
- A `user` has many `paymentMethods` and many `transactions`
- A `paymentMethod` belongs to one `user`

---

### 2. `src/db/schema.sql` — Raw SQL Reference

This is **just a human-readable SQL file** — it's not executed by the app. It's the "what the tables look like in plain SQL" version of `schema.ts`. Good for documentation or manually setting up the DB without Drizzle.

Notice how SQLite lacks native ENUMs, so it uses `CHECK` constraints instead:
```sql
-- No native ENUM in SQLite, so this is used:
type TEXT CHECK (type IN ('CARD', 'BANK_ACCOUNT', 'DIGITAL_WALLET'))

-- vs real PostgreSQL ENUMs:
-- CREATE TYPE payment_type AS ENUM ('CARD', 'BANK_ACCOUNT');
```

---

### 3. `src/db/database.ts` — Connection Setup

This is equivalent to your TypeORM `DataSource` / `createConnection()` setup. It:

1. **Creates a lazy singleton** — the DB connection is only created the first time `getDb()` is called (important for testing)
2. **Reads `DATABASE_URL`** — if set to `:memory:`, runs the DB in RAM (used in tests). Otherwise uses `data/payment_gateway.db`
3. **Sets SQLite PRAGMAs** — these are SQLite-specific settings:
   - `PRAGMA journal_mode = WAL` → better concurrency (Write-Ahead Logging)
   - `PRAGMA foreign_keys = ON` → enforce foreign key constraints (**OFF by default in SQLite!**)
4. **Contains `TEST_DDL`** — raw SQL to create tables for in-memory test databases

---

### 4. `src/db/migrate.ts` — Migration Script

This is a **one-off migration script** that was run manually to alter the `transactions` table schema (add `ON DELETE SET NULL` to `payment_method_id`).

**Why is it so complex?** SQLite doesn't support `ALTER COLUMN` like PostgreSQL does. To change a column constraint, you have to:
1. Create a new temp table with the correct schema
2. Copy all data into it
3. Drop the old table
4. Rename the temp table

This is a quirk of SQLite — in PostgreSQL you'd just do `ALTER TABLE ... ALTER COLUMN` directly.

---

### 5. `drizzle.config.ts` — Drizzle Kit Config

This configures the **Drizzle CLI tool** (`drizzle-kit`), which is separate from the ORM itself. It's like a `typeorm-cli` config. It tells the CLI:
- Use `sqlite` dialect
- Read the schema from `schema.ts`
- Output migration files to `./drizzle/`
- Connect to the DB at `data/payment_gateway.db`

---

## 🔄 Drizzle vs TypeORM — Quick Mental Map

| TypeORM Concept | Drizzle Equivalent |
|---|---|
| `@Entity()` class | `sqliteTable(...)` export |
| `@Column()` | `.text()`, `.integer()`, etc. |
| `@OneToMany()` / `@ManyToOne()` | `relations()` block |
| `DataSource.initialize()` | `getDb()` / `drizzle(sqlite, { schema })` |
| Migration files | `drizzle-kit generate` + `drizzle-kit push` |
| `repository.find(...)` | `db.query.users.findMany(...)` |

The key difference in **philosophy**: TypeORM uses class decorators and hides SQL from you. Drizzle is more **SQL-close** — you define column types explicitly and the SQL it generates is more predictable and transparent.
