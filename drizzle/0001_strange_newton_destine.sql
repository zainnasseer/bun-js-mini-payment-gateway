CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"webhook_url" text NOT NULL,
	"api_key" text NOT NULL,
	"ip_whitelist" text DEFAULT '[]' NOT NULL,
	"email" text NOT NULL,
	"phone_number" text NOT NULL,
	"origin_header" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "merchants_api_key_unique" UNIQUE("api_key"),
	CONSTRAINT "merchants_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "idx_merchants_email" ON "merchants" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_merchants_api_key" ON "merchants" USING btree ("api_key");