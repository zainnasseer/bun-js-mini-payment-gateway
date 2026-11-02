# Payment Gateway API (Bun + Drizzle ORM + PostgreSQL)

A lightweight, production-style **payment gateway REST API** built with **Bun** (`Bun.serve()`), **Drizzle ORM**, and **PostgreSQL** (`Bun.sql`) — designed as a portfolio backend showcasing fintech patterns recruiters care about.

**Highlights (CV / interview talking points)**

| Area | What this repo demonstrates |
|------|-----------------------------|
| Payments | Idempotent `POST /transactions`, integer money (cents), ISO 4217 currencies |
| Reliability | PostgreSQL transactions for idempotency + refunds; explicit transaction state machine |
| Security | API key auth, timing-safe compares, HMAC webhook verification, PCI-style token-only cards |
| Ops | Docker, health checks, structured middleware (rate limit, request ID, logging) |
| Quality | 78+ automated tests, TypeScript strict mode, OpenAPI spec at `/openapi.yaml` |

**Stack:** Bun 1.x · TypeScript · Drizzle ORM · PostgreSQL · in-memory rate limiter (Redis-ready note in code)

**API contract:** [openapi.yaml](./openapi.yaml) (also served at `GET /openapi.yaml`)

---

## Architecture

```text
Client ──► Middleware (request ID → log → rate limit → API key → JSON guard)
              │
              ▼
         Route handlers (users / payment methods / transactions / webhooks)
              │
              ▼
         Drizzle ORM ──► PostgreSQL (managed or Docker)
              │
              ▼
         Simulated processor (async status updates) + HMAC webhook callbacks
```

---

## 🚀 Quick Start (Local Development)

Copy environment defaults (Bun loads `.env` automatically):

```bash
cp .env.example .env
```

### 1. Install Dependencies
```bash
bun install
```

### 2. Start PostgreSQL

**Docker (recommended locally):**

```bash
docker compose up -d
```

Ensure `.env` has:

```bash
DATABASE_URL=postgres://payment:payment@localhost:5436/payment_gateway
```

### 3. Apply migrations

```bash
bun run db:migrate
```

After schema changes: `bun run db:generate` then commit new files under `drizzle/`, then `bun run db:migrate`.

**Optional:** `bun run db:push` (Drizzle Kit direct sync — dev only).

### 4. Start the Server
```bash
bun run dev      # Hot reload enabled on http://localhost:3000
# or
bun run start    # Standard production mode
```

Open the **Developer Console** in your browser (interactive UI for the full payment flow, error scenarios, and live API envelopes):

**http://localhost:3000/**

---

## 🧪 Automated Testing

PostgreSQL must be running (e.g. `docker compose up -d`). Tests migrate and truncate tables automatically.

```bash
bun test
```

Run TypeScript validation:
```bash
bun run typecheck
```

---

## 🕹️ Manual Testing & Live Payloads

We include a script that runs through the complete customer lifecycle (users, tokenized payment methods, PCI-DSS security checks, idempotency replays, HMAC webhooks, and refunds):

```bash
# 1. Start the server in one terminal:
bun run dev

# 2. In another terminal, run the automated verification script:
./manual_test.sh http://localhost:3000
```

### Manual `curl` Commands

In **production**, set `API_KEY` and pass it on every API route:

```bash
export API_KEY="your_secure_api_key"   # also set in .env for local prod-like testing
```

#### 1. Create a User
```bash
curl -i -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY:-dev-optional}" \
  -d '{"email": "jane@example.com", "name": "Jane Doe"}'
```

#### 2. Add a Payment Method (PCI-DSS Token Only)
```bash
curl -i -X POST http://localhost:3000/api/v1/users/<USER_ID>/payment-methods \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CARD",
    "token_id": "tok_visa_4242_sandbox",
    "last_four": "4242",
    "expiry_month": 12,
    "expiry_year": 2028,
    "is_default": true
  }'
```
*Note: Any request containing `pan` or `cvv` will be rejected with HTTP 400 per PCI-DSS.*

#### 3. Create an Idempotent Payment
```bash
curl -i -X POST http://localhost:3000/api/v1/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(bun -e 'console.log(crypto.randomUUID())')" \
  -d '{
    "user_id": "<USER_ID>",
    "payment_method_id": "<PM_ID>",
    "amount": 4999,
    "currency": "USD",
    "description": "Monthly Plan"
  }'
```
*Amounts are integers in cents (`4999` = $49.99).*  
*Re-sending the request with the identical `Idempotency-Key` returns HTTP 200 with the existing transaction rather than charging again.*

#### 4. Trigger Webhook Callback (HMAC-SHA256 Signed)
```bash
PAYLOAD='{"transaction_id":"<TX_ID>","status":"CAPTURED","processor_ref":"proc_12345"}'
SECRET="change_me_before_production"
SIG=$(bun -e "import { signPayload } from './src/lib/crypto'; console.log(signPayload('$SECRET', '$PAYLOAD'))")

curl -i -X POST http://localhost:3000/webhooks/processor \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$PAYLOAD"
```

#### 5. Issue an Atomic Refund
```bash
curl -i -X POST http://localhost:3000/api/v1/transactions/<TX_ID>/refund \
  -H "Content-Type: application/json" \
  -d '{"reason": "Customer cancellation"}'
```

---

## ☁️ Neon (managed Postgres)

This repo includes `neon.ts` and a linked Neon project (`.neon`, gitignored). Runtime uses **`Bun.sql` + Drizzle** with the **pooled** `DATABASE_URL`; migrations prefer **`DATABASE_URL_UNPOOLED`**.

```bash
npx neon@latest login          # if needed
npx neon@latest deploy         # sync policy + pull env into .env
bun run db:migrate
bun run dev
```

View data in the [Neon console](https://console.neon.tech) or `bun run db:studio`.

**Agent tooling:** Official Neon skills live in [`.cursor/skills/neon`](./.cursor/skills/neon/SKILL.md) and [`neon-postgres`](./.cursor/skills/neon-postgres/SKILL.md). User-level **Neon MCP** is configured via `neon mcp --agent cursor` (see `~/.cursor/mcp.json`). To refresh skills via CLI (requires Node ≥ 22.20): `npx neon skills -s neon -s neon-postgres --agent cursor -y`.

---

## 🐳 Production Deployment

### Option A: Docker Deployment

1. **Build Docker Image**:
   ```bash
   docker build -t payment-gateway:latest .
   ```

2. **Run the app** (point at managed Postgres — Neon, Supabase, Railway, RDS, etc.):
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e DATABASE_URL="postgres://user:pass@host:5432/dbname?sslmode=require" \
     -e WEBHOOK_SECRET="your_production_secret" \
     -e API_KEY="your_secure_api_key" \
     --name payment-gateway \
     payment-gateway:latest
   ```
   The container runs migrations on startup (`db:init`), then starts the server.

### Option B: Fly.io + Neon (recommended)

Database stays on **Neon**; Fly runs the Docker image (`migrations` on boot, then `bun start`). Config: [`fly.toml`](./fly.toml).

1. **Install Fly CLI** (macOS):
   ```bash
   brew install flyctl
   fly auth login
   ```

2. **Create the app** (name must be globally unique — edit `app` in `fly.toml` or let the CLI rename):
   ```bash
   cd /path/to/pg1
   fly launch --no-deploy --copy-config
   ```
   When prompted: **do not** add a Fly Postgres database (you already use Neon).

3. **Set secrets** (values from your local `.env` / Neon console — never commit these):
   ```bash
   fly secrets set \
     DATABASE_URL='postgresql://...-pooler.../neondb?sslmode=require' \
     DATABASE_URL_UNPOOLED='postgresql://.../neondb?sslmode=require' \
     API_KEY="$(openssl rand -hex 32)" \
     WEBHOOK_SECRET="$(openssl rand -hex 32)"
   ```
   Production **requires** `API_KEY` (see auth middleware). Use Neon **pooled** URL for `DATABASE_URL` and **direct** for `DATABASE_URL_UNPOOLED`.

4. **Deploy**:
   ```bash
   fly deploy
   fly status
   fly logs
   curl -s "https://$(fly info -j | jq -r .Hostname)/health"
   ```

5. **Use the app**: open `https://<your-app>.fly.dev/` for the UI.

   **Portfolio / public demo:** set `PUBLIC_DEMO_MODE=true` (already in `fly.toml`). The Developer Console calls `GET /api/public/demo-console` and auto-fills the shared `API_KEY` for visitors. Treat this as a sandbox — rate limits apply, but the key is not secret.

   **Private production:** leave `PUBLIC_DEMO_MODE` unset; only people you share `API_KEY` with can call `/api/v1/*`.

Free tier notes: machines may **auto-stop** when idle (`min_machines_running = 0`); the first request after sleep can be slow. Region `ord` is a reasonable default near Neon `us-east-2`.

### Option C: Other hosts (Railway / Render)

Same env vars as Fly; use the repo `Dockerfile` or `bun run db:init && bun start` as the start command.

No local disk volume is required for data — the database lives in Postgres.
