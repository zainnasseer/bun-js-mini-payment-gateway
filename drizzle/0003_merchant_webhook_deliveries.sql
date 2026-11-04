CREATE TABLE IF NOT EXISTS "merchant_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"transaction_id" text,
	"event" text NOT NULL,
	"target_url" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"http_status" integer,
	"response_excerpt" text,
	"error_message" text,
	"created_at" text NOT NULL,
	"delivered_at" text
);
--> statement-breakpoint
ALTER TABLE "merchant_webhook_deliveries" ADD CONSTRAINT "merchant_webhook_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_webhook_deliveries" ADD CONSTRAINT "merchant_webhook_deliveries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wh_del_merchant" ON "merchant_webhook_deliveries" USING btree ("merchant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wh_del_status" ON "merchant_webhook_deliveries" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wh_del_created" ON "merchant_webhook_deliveries" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wh_del_tx" ON "merchant_webhook_deliveries" USING btree ("transaction_id");
