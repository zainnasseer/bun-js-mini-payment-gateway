import { jsonOk, jsonError } from "../lib/http";

/**
 * Public sandbox hints for the Developer Console (portfolio / demo deploys).
 * Not under /api/v1 — no API key required to read.
 *
 * Enable with PUBLIC_DEMO_MODE=true. Exposes the same API_KEY / WEBHOOK_SECRET
 * the server expects so visitors can try the UI without a private invite.
 */
export function getDemoConsoleConfig(): Response {
  const enabled = process.env.PUBLIC_DEMO_MODE === "true";
  if (!enabled) {
    return jsonError("Demo credentials are not published for this deployment", 404);
  }

  const apiKey = process.env.API_KEY?.trim() ?? "";
  const webhookSecret = process.env.WEBHOOK_SECRET?.trim() ?? "";

  if (!apiKey) {
    return jsonError("Demo mode is on but API_KEY is not configured", 503);
  }

  return jsonOk({
    demoMode: true,
    message:
      "Shared sandbox credentials — anyone can use this API. Do not store real payment data.",
    apiKey,
    webhookSecret: webhookSecret || undefined,
  });
}
