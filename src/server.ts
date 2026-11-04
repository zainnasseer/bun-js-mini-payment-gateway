import {
  listMerchants,
  getMerchant,
  createMerchant,
  updateMerchant,
  deleteMerchant,
} from "./routes/merchants";
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransactionStatus,
  refundTransaction,
} from "./routes/transactions";
import { handleProcessorWebhook } from "./routes/webhooks";
import { listWebhookDeliveries } from "./routes/webhookDeliveries";
import { loginConsoleAdmin, getConsoleSession } from "./routes/auth";
import { requestPasswordChange, confirmPasswordChange } from "./routes/passwordChange";
import { listConsoleAdmins, createConsoleAdmin, deleteConsoleAdmin } from "./routes/admins";
import { getDemoConsoleConfig } from "./routes/publicDemo";
import { runMiddleware } from "./middleware";
import { jsonOk, jsonError } from "./lib/http";
import { startFxRatesRefreshLoop } from "./lib/fxLive";
import index from "../index.html";

const PORT = Number(process.env.PORT ?? 3000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: Request & { params: any }) => Response | Promise<Response>;

type BunServer = { requestIP?: (req: Request) => { address: string } | null };

let serverRef: BunServer | null = null;

function withMiddleware(handler: RouteHandler): RouteHandler {
  return async (req) => {
    return runMiddleware(req, serverRef, () => handler(req));
  };
}

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

    "/health": {
      GET: withMiddleware(() =>
        jsonOk({ status: "ok", version: "2.0.0", timestamp: new Date().toISOString() })
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

    "/api/v1/auth/login": {
      POST: withMiddleware(loginConsoleAdmin),
    },
    "/api/v1/auth/me": {
      GET: withMiddleware(getConsoleSession),
    },
    "/api/v1/auth/password/request-change": {
      POST: withMiddleware(requestPasswordChange),
    },
    "/api/v1/auth/password/confirm": {
      POST: withMiddleware(confirmPasswordChange),
    },

    "/api/v1/admins": {
      GET:  withMiddleware(listConsoleAdmins),
      POST: withMiddleware(createConsoleAdmin),
    },
    "/api/v1/admins/:id": {
      DELETE: withMiddleware(deleteConsoleAdmin),
    },

    "/api/v1/merchants": {
      GET:  withMiddleware(listMerchants),
      POST: withMiddleware(createMerchant),
    },
    "/api/v1/merchants/:id": {
      GET:    withMiddleware(getMerchant),
      PATCH:  withMiddleware(updateMerchant),
      DELETE: withMiddleware(deleteMerchant),
    },

    "/api/v1/transactions": {
      GET:  withMiddleware(listTransactions),
      POST: withMiddleware(createTransaction),
    },
    "/api/v1/transactions/:id": {
      GET: withMiddleware(getTransaction),
    },
    "/api/v1/transactions/:id/status": {
      PATCH: withMiddleware(updateTransactionStatus),
    },
    "/api/v1/transactions/:id/refund": {
      POST: withMiddleware(refundTransaction),
    },

    "/api/v1/webhook-deliveries": {
      GET: withMiddleware(listWebhookDeliveries),
    },

    "/webhooks/processor": {
      POST: withMiddleware(handleProcessorWebhook),
    },
  },

  async fetch(req, server): Promise<Response> {
    serverRef = server;
    return runMiddleware(req, server, () => {
      const url = new URL(req.url);
      return jsonError(`Cannot ${req.method} ${url.pathname}`, 404);
    });
  },
});

serverRef = server;

startFxRatesRefreshLoop();

console.log(`🚀 Payment Gateway  →  http://localhost:${server.port}`);
console.log(`   UI:    http://localhost:${server.port}/`);
console.log(`   Mode:  ${process.env.NODE_ENV ?? "development"}`);
console.log(`   DB:    ${process.env.DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : "(DATABASE_URL not set)"}`);

export default server;
