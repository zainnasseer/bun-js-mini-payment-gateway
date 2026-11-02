/**
 * Bootstrap SQLite schema without Drizzle Kit (production Docker / CI friendly).
 */
import { initSchema } from "./database";

initSchema();
console.log("✅ Database schema ready");
