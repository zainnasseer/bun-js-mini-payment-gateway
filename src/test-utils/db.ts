import { prepareTestDatabase } from "../db/database";

const DEFAULT_TEST_URL = "postgres://payment:payment@127.0.0.1:5436/payment_gateway";

export async function setupIntegrationTests(): Promise<void> {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_URL;
  process.env.NODE_ENV = "test";
  await prepareTestDatabase();
}
