-- Merchant-centric refactor: drop users/payment_methods, link transactions to merchants

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_user_id_users_id_fk";
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_payment_method_id_payment_methods_id_fk";

DROP INDEX IF EXISTS "idx_tx_user_id";

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "merchant_id" text;

UPDATE "transactions" SET "merchant_id" = (
  SELECT "id" FROM "merchants" ORDER BY "created_at" LIMIT 1
) WHERE "merchant_id" IS NULL AND EXISTS (SELECT 1 FROM "merchants" LIMIT 1);

DELETE FROM "transactions" WHERE "merchant_id" IS NULL;

ALTER TABLE "transactions" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "payment_method_id";

ALTER TABLE "transactions" ALTER COLUMN "merchant_id" SET NOT NULL;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk"
  FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_tx_merchant_id" ON "transactions" USING btree ("merchant_id");

DROP TABLE IF EXISTS "payment_methods" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "webhook_secret" text;

UPDATE "merchants" SET "webhook_secret" = md5(random()::text || "id" || clock_timestamp()::text)
  WHERE "webhook_secret" IS NULL OR "webhook_secret" = '';

ALTER TABLE "merchants" ALTER COLUMN "webhook_secret" SET NOT NULL;
