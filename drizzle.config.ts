import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema:  "./src/db/schema.ts",
  out:     "./drizzle",              // migration artefacts (push mode ignores this, but keep for reference)
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/payment_gateway.db",
  },
  verbose: true,
  strict:  true,
});
