-- ============================================================
--  Payment Gateway — SQLite Schema
--  Monetary amounts: stored as INTEGER (smallest currency unit, e.g. cents).
--  Currency codes:   ISO 4217 (e.g. 'USD', 'EUR').
--  Enums:            enforced via CHECK constraints (SQLite has no native ENUM).
--  PCI-DSS:          raw PANs / CVVs are NEVER stored — only opaque token_ids.
-- ============================================================

PRAGMA journal_mode = WAL;      -- write-ahead log for better concurrency
PRAGMA foreign_keys = ON;       -- enforce FK constraints

-- ─── transaction_status enum ────────────────────────────────────────────────

-- Allowed transaction states (enforced by CHECK on transactions table):
--   PENDING   → payment initiated, awaiting processor response
--   SUCCESS   → processor confirmed charge
--   FAILED    → processor declined or error occurred
--   REFUNDED  → previously successful charge reversed

-- ─── Users ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id          TEXT        NOT NULL PRIMARY KEY,   -- UUID v4, crypto-generated
    email       TEXT        NOT NULL UNIQUE,
    name        TEXT        NOT NULL,
    created_at  TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── Payment Methods ─────────────────────────────────────────────────────────
--
--  PCI-DSS note:
--    • token_id  — opaque reference from tokenization provider (never raw PAN)
--    • last_four — last 4 digits of PAN (display hint only, safe per PCI-DSS)
--    • NO cvv / NO full_pan columns exist — by design

CREATE TABLE IF NOT EXISTS payment_methods (
    id              TEXT        NOT NULL PRIMARY KEY,
    user_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT        NOT NULL CHECK (type IN ('CARD', 'BANK_ACCOUNT', 'DIGITAL_WALLET')),
    token_id        TEXT        NOT NULL UNIQUE,    -- tokenization provider opaque token
    last_four       TEXT        NOT NULL CHECK (length(last_four) = 4),
    expiry_month    INTEGER     NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year     INTEGER     NOT NULL CHECK (expiry_year >= 2024),
    is_default      INTEGER     NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at      TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);

-- ─── Transactions ────────────────────────────────────────────────────────────
--
--  Idempotency:
--    • idempotency_key is UNIQUE — duplicate POSTs return the existing row.
--    • Callers supply the key; the server never auto-generates it for them.
--
--  Amount:
--    • Stored as INTEGER (smallest currency unit — cents for USD/EUR, etc.)
--    • CHECK ensures no negative charges.
--
--  Currency:
--    • ISO 4217 three-letter codes, upper-case.

CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT        NOT NULL PRIMARY KEY,
    user_id             TEXT        NOT NULL REFERENCES users(id),
    payment_method_id   TEXT        REFERENCES payment_methods(id) ON DELETE SET NULL,
    idempotency_key     TEXT        NOT NULL UNIQUE,
    amount              INTEGER     NOT NULL CHECK (amount > 0),    -- cents, always positive
    currency            TEXT        NOT NULL CHECK (length(currency) = 3),  -- ISO 4217
    status              TEXT        NOT NULL DEFAULT 'PENDING'
                                    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
    description         TEXT,
    metadata            TEXT,       -- stored as JSON string
    created_at          TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id        ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency    ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_transactions_status         ON transactions(status);
