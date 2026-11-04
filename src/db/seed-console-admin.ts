import { eq } from "drizzle-orm";
import { getDb } from "./database";
import { consoleAdmins } from "./schema";
import { generateId } from "../lib/crypto";
import { hashPassword } from "../lib/password";
import { firstRow } from "../lib/dbQuery";

const DEFAULT_OWNER_USERNAME = "zain";
const DEFAULT_OWNER_PASSWORD = "11223344";
const DEFAULT_OWNER_EMAIL =
  process.env.CONSOLE_OWNER_EMAIL?.trim().toLowerCase() || "zainnaser18@gmail.com";

/** Ensures the portfolio owner account exists (idempotent). */
export async function ensureDefaultConsoleOwner(): Promise<void> {
  const db = getDb();
  const existing = await firstRow(
    db.select().from(consoleAdmins).where(eq(consoleAdmins.username, DEFAULT_OWNER_USERNAME)).limit(1)
  );
  if (existing) {
    if (!existing.email || existing.email.endsWith("@console.local")) {
      await db
        .update(consoleAdmins)
        .set({ email: DEFAULT_OWNER_EMAIL })
        .where(eq(consoleAdmins.id, existing.id));
      console.log(`✅ Console owner email set to ${DEFAULT_OWNER_EMAIL}`);
    }
    return;
  }

  const passwordHash = await hashPassword(DEFAULT_OWNER_PASSWORD);
  await db.insert(consoleAdmins).values({
    id: generateId(),
    username: DEFAULT_OWNER_USERNAME,
    email: DEFAULT_OWNER_EMAIL,
    passwordHash,
    role: "owner",
  });
  console.log(`✅ Console owner "${DEFAULT_OWNER_USERNAME}" created`);
}

if (import.meta.main) {
  ensureDefaultConsoleOwner()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
