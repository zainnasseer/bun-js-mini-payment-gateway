CREATE TABLE IF NOT EXISTS "console_admins" (
  "id" text PRIMARY KEY NOT NULL,
  "username" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('owner', 'admin')),
  "created_at" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_console_admins_username" ON "console_admins" ("username");
