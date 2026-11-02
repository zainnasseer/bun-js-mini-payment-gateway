import { listUsers, getUser, createUser } from "./routes/users";
import {
  listPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
} from "./routes/paymentMethods";
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransactionStatus,
  refundTransaction,
} from "./routes/transactions";
import { handleProcessorWebhook } from "./routes/webhooks";
import { getDemoConsoleConfig } from "./routes/publicDemo";
import { runMiddleware } from "./middleware";
import { jsonOk, jsonError } from "./lib/http";
import index from "../index.html";

const PORT = Number(process.env.PORT ?? 3000);

// ─── Middleware-wrapped handler factory ───────────────────────────────────────
//
// Bun.serve() routes don't have access to the `server` instance, so we
// wire middleware at the fetch() level (fallback + route wrappers).
//
// For routes declared in the `routes` table, middleware is applied via
// the fetch fallback — Bun calls fetch() ONLY when no route matches.
// To apply middleware to EVERY request (including matched routes) we wrap
// each handler individually using this helper.

// Bun.serve() resolves params as Record<string, string> at runtime.
// Route handlers declare narrower param shapes for DX, so we use `any`
// here to bridge that — runtime safety is guaranteed by Bun's router.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: Request & { params: any }) => Response | Promise<Response>;

type BunServer = { requestIP?: (req: Request) => { address: string } | null };

let serverRef: BunServer | null = null;

function withMiddleware(handler: RouteHandler): RouteHandler {
  return async (req) => {
    return runMiddleware(req, serverRef, () => handler(req));
  };
}

// ─── Server ───────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== "production";

const server = Bun.serve({
  hostname: "0.0.0.0",
  port: PORT,

  development: isDev
    ? {
        hmr: true,
        console: true,
      }
    : undefined,

  routes: {
    "/": index,

    // ── Health (no auth, no rate limit bypass needed — runMiddleware exempts it) ─
    "/health": {
      GET: withMiddleware(() =>
        jsonOk({ status: "ok", version: "1.0.0", timestamp: new Date().toISOString() })
      ),
    },

    "/openapi.yaml": {
      GET: withMiddleware(async () => {
        const spec = await Bun.file(new URL("../openapi.yaml", import.meta.url)).text();
        return new Response(spec, {
          headers: { "Content-Type": "application/yaml; charset=utf-8" },
        });
      }),
    },

    "/api/public/demo-console": {
      GET: withMiddleware(() => getDemoConsoleConfig()),
    },

    // ── Users ──────────────────────────────────────────────────────────────────
    "/api/v1/users": {
      GET:  withMiddleware(listUsers),
      POST: withMiddleware(createUser),
    },
    "/api/v1/users/:id": {
      GET: withMiddleware(getUser),
    },

    // ── Payment Methods ────────────────────────────────────────────────────────
    "/api/v1/users/:userId/payment-methods": {
      GET:  withMiddleware(listPaymentMethods),
      POST: withMiddleware(createPaymentMethod),
    },
    "/api/v1/users/:userId/payment-methods/:methodId": {
      DELETE: withMiddleware(deletePaymentMethod),
    },

    // ── Transactions ───────────────────────────────────────────────────────────
    "/api/v1/transactions": {
      GET:  withMiddleware(listTransactions),
      POST: withMiddleware(createTransaction),       // requires Idempotency-Key header
    },
    "/api/v1/transactions/:id": {
      GET: withMiddleware(getTransaction),
    },
    "/api/v1/transactions/:id/status": {
      PATCH: withMiddleware(updateTransactionStatus), // simulates manual status override
    },
    "/api/v1/transactions/:id/refund": {
      POST: withMiddleware(refundTransaction),        // dedicated refund endpoint
    },

    // ── Webhooks ───────────────────────────────────────────────────────────────
    // Exempt from API key auth (webhook uses its own HMAC-SHA256 signature).
    "/webhooks/processor": {
      POST: withMiddleware(handleProcessorWebhook),
    },
  },

  // ─── 404 / Method-Not-Allowed fallback ────────────────────────────────────
  // Called for any request that didn't match a route above.
  async fetch(req, server): Promise<Response> {
    serverRef = server;
    return runMiddleware(req, server, () => {
      const url = new URL(req.url);
      return jsonError(`Cannot ${req.method} ${url.pathname}`, 404);
    });
  },
});

serverRef = server;

console.log(`🚀 Payment Gateway  →  http://localhost:${server.port}`);
console.log(`   UI:    http://localhost:${server.port}/`);
console.log(`   Mode:  ${process.env.NODE_ENV ?? "development"}`);
console.log(`   DB:    ${process.env.DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : "(DATABASE_URL not set)"}`);

export default server;
