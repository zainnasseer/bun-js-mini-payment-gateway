ALTER TABLE "console_admins" ADD COLUMN IF NOT EXISTS "email" text;

UPDATE "console_admins"
SET "email" = 'zainnaser18@gmail.com'
WHERE "username" = 'zain' AND ("email" IS NULL OR "email" = '');

UPDATE "console_admins"
SET "email" = "username" || '@console.local'
WHERE "email" IS NULL OR "email" = '';

ALTER TABLE "console_admins" ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_console_admins_email" ON "console_admins" ("email");

CREATE TABLE IF NOT EXISTS "console_password_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "admin_id" text NOT NULL REFERENCES "console_admins"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "new_password_hash" text NOT NULL,
  "expires_at" text NOT NULL,
  "created_at" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_pwd_challenge_admin" ON "console_password_challenges" ("admin_id");
CREATE INDEX IF NOT EXISTS "idx_pwd_challenge_expires" ON "console_password_challenges" ("expires_at");
