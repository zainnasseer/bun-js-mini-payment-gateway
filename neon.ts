import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Postgres is the app's primary store (see DATABASE_URL / DATABASE_URL_UNPOOLED from `neon deploy`).
  auth: false,
  dataApi: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
