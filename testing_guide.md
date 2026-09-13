# Payment Gateway — Complete Testing & Deployment Guide

---

## Code Improvements Applied

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | [`auth.ts`](file:///Users/zainnasseer/development/NodeJS/Courses/bun/pg1/src/middleware/auth.ts) | `API_KEY` read at module load time, freezing the value | Now read inside `authCheck()` on every request |
| 2 | [`crypto.ts`](file:///Users/zainnasseer/development/NodeJS/Courses/bun/pg1/src/lib/crypto.ts) | Used `require("node:crypto")` inside `safeCompare` | Replaced with proper ESM named import |
| 3 | [`processor.ts`](file:///Users/zainnasseer/development/NodeJS/Courses/bun/pg1/src/lib/processor.ts) | `PROCESSOR_DELAY_MS` / `SUCCESS_RATE` frozen at import | Read from `process.env` at call time |

**After fixes:** `bun run typecheck` exits clean, `bun test` → **77 pass / 0 fail**.

---

## Payment Lifecycle Flow

```
CLIENT                          PAYMENT GATEWAY                   PROCESSOR (STUB)
  │                                     │                                │
  │──POST /api/v1/users──────────────►  │                                │
  │  { email, name }                    │  INSERT users                  │
  │◄──── 201 Created { id, email } ──── │                                │
  │                                     │                                │
  │──POST /users/:id/payment-methods──► │                                │
  │  { type, token_id, last_four, ... } │  INSERT payment_methods        │
  │◄──── 201 Created { id, tokenId } ── │                                │
  │                                     │                                │
  │──POST /api/v1/transactions ───────► │                                │
  │  Idempotency-Key: <uuid-v4>         │  BEGIN TRANSACTION             │
  │  { user_id, pm_id, amount, ... }    │    check idempotency_key       │
  │                                     │    verify user exists          │
  │                                     │    verify pm belongs to user   │
  │                                     │    INSERT transaction          │
  │                                     │  COMMIT                        │
  │◄──── 201 Created { status:PENDING } │                                │
  │                                     │                                │
  │  (REPLAY same Idempotency-Key)      │                                │
  │──POST /api/v1/transactions ───────► │                                │
  │◄──── 200 OK { same transaction } ── │  (no DB write, idempotent)     │
  │                                     │                                │
  │                                     │──── submitToProcessor() ──────►│
  │                                     │     (async, after 3s delay)    │
  │                                     │◄─── AUTHORIZED / FAILED ───── │
  │                                     │     (85% success rate)         │
  │                                     │                                │
  │  (Processor calls back via webhook) │                                │
  │                              ◄──────│── POST /webhooks/processor ────│
  │                                     │   X-Webhook-Signature: <hmac>  │
  │                                     │   { tx_id, status, ref }       │
  │                                     │  Verify HMAC signature         │
  │                                     │  Validate state transition     │
  │                                     │  UPDATE transaction status     │
  │                                     │──────────────────────────────► │
  │                                     │   200 OK { received: true }    │
  │                                     │                                │
  │──POST /transactions/:id/refund ───► │                                │
  │  { reason: "..." }                  │  BEGIN TRANSACTION             │
  │                                     │    verify status = CAPTURED    │
  │                                     │    UPDATE status = REFUNDED    │
  │                                     │    append audit metadata       │
  │                                     │  COMMIT                        │
  │◄──── 200 OK { status: REFUNDED } ── │                                │

State Machine:
  PENDING ──► AUTHORIZED ──► CAPTURED ──► REFUNDED
  PENDING ──► FAILED            (terminal)
  AUTHORIZED ──► FAILED         (terminal)
```

---

## Step 1: Launch the Server

### 1a. Configure `.env`

Open [`.env`](file:///Users/zainnasseer/development/NodeJS/Courses/bun/pg1/.env). For local Postman testing, leave it as-is — the defaults work:

```env
PORT=3000
NODE_ENV=development    # dev mode: API_KEY auth is bypassed (no X-API-Key needed)
DATABASE_URL=./data/payment_gateway.db
API_KEY=                # leave blank in dev — all requests pass through
WEBHOOK_SECRET=change_me_before_production
PROCESSOR_DELAY_MS=3000      # 3 seconds until processor auto-resolves PENDING
PROCESSOR_SUCCESS_RATE=0.85  # 85% chance of AUTHORIZED, 15% FAILED
```

> **Note:** In dev mode (`NODE_ENV=development`), `API_KEY` auth is bypassed — you don't need to set any auth header in Postman.

### 1b. Push the Schema (first time or after schema changes)

```bash
bun run db:push
```

### 1c. Start the Server

```bash
bun run dev
```

You should see:
```
🚀 Payment Gateway  →  http://localhost:3000
   Mode:  development
   DB:    ./data/payment_gateway.db
```

---

## Step 2: Set Up Postman

### 2a. Create a Collection
- Open Postman → **New Collection** → name it `Payment Gateway`

### 2b. Create a Collection Variable for Base URL
- Click the collection → **Variables** tab
- Add: `Variable = base_url`, `Initial Value = http://localhost:3000`
- Now use `{{base_url}}` in every request URL

### 2c. (Optional) Add a UUID v4 Pre-request Script
For endpoints that need an `Idempotency-Key`, add this to the **collection-level Pre-request Script**:

```js
// Only generate if no Idempotency-Key set yet
if (!pm.collectionVariables.get("idempotency_key")) {
    pm.collectionVariables.set("idempotency_key", crypto.randomUUID());
}
```

---

## Step 3: Postman Requests — Full Walkthrough

### ① Health Check
| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `{{base_url}}/health` |

**Expected Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "timestamp": "2026-09-04T10:00:00.000Z"
  }
}
```

---

### ② Create a User
| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `{{base_url}}/api/v1/users` |
| Header | `Content-Type: application/json` |
| Body (raw JSON) | *(see below)* |

```json
{
  "email": "jane.doe@example.com",
  "name": "Jane Doe"
}
```

**Auto-save the ID** — add this to the **Tests** tab of the request:
```js
const res = pm.response.json();
pm.collectionVariables.set("user_id", res.data.id);
```

**Expected Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "3c17d245-9d21-...",
    "email": "jane.doe@example.com",
    "name": "Jane Doe",
    "createdAt": "2026-09-04T10:00:00.000Z",
    "updatedAt": "2026-09-04T10:00:00.000Z"
  }
}
```

---

### ③ Add a Payment Method (Tokenized — PCI-DSS Compliant)
| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `{{base_url}}/api/v1/users/{{user_id}}/payment-methods` |
| Header | `Content-Type: application/json` |

```json
{
  "type": "CARD",
  "token_id": "tok_visa_4242_sandbox",
  "last_four": "4242",
  "expiry_month": 12,
  "expiry_year": 2028,
  "is_default": true
}
```

> **IMPORTANT:** `type` must be one of `CARD`, `BANK_ACCOUNT`, `DIGITAL_WALLET`.
> Never include `pan` or `cvv` — the API will reject it with 400.

**Auto-save the payment method ID** in **Tests** tab:
```js
const res = pm.response.json();
pm.collectionVariables.set("pm_id", res.data.id);
```

**Expected Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "ca2ea443-...",
    "userId": "3c17d245-...",
    "type": "CARD",
    "tokenId": "tok_visa_4242_sandbox",
    "lastFour": "4242",
    "expiryMonth": 12,
    "expiryYear": 2028,
    "isDefault": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### ④ PCI-DSS Security Guard — Rejected Raw PAN (Try This!)
| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `{{base_url}}/api/v1/users/{{user_id}}/payment-methods` |
| Header | `Content-Type: application/json` |

```json
{
  "type": "CARD",
  "token_id": "tok_violator",
  "last_four": "1111",
  "expiry_month": 12,
  "expiry_year": 2028,
  "pan": "4111111111111111"
}
```

**Expected Response (400):**
```json
{
  "success": false,
  "error": "Raw cardholder data (PAN, CVV) must never be sent to this API. Use client-side tokenization."
}
```

---

### ⑤ Create a Transaction (Idempotent)
| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `{{base_url}}/api/v1/transactions` |
| Header | `Content-Type: application/json` |
| Header | `Idempotency-Key: {{$guid}}` |

> Use Postman's built-in `{{$guid}}` dynamic variable to auto-generate a UUID v4 for each request. Or paste a fixed UUID to test replays.

```json
{
  "user_id": "{{user_id}}",
  "payment_method_id": "{{pm_id}}",
  "amount": 4999,
  "currency": "USD",
  "description": "Annual Pro subscription"
}
```

> **Amount is in cents.** `4999` = $49.99 USD. Must be a positive integer.
> **Currencies:** `USD`, `EUR`, `GBP`, `JPY`, `AED`, `SAR`

**Auto-save the transaction ID** in **Tests** tab:
```js
const res = pm.response.json();
pm.collectionVariables.set("tx_id", res.data.id);
```

**Expected Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "b3385a98-...",
    "userId": "3c17d245-...",
    "paymentMethodId": "ca2ea443-...",
    "idempotencyKey": "81db2a04-...",
    "amount": 4999,
    "currency": "USD",
    "status": "PENDING",
    "description": "Annual Pro subscription",
    "metadata": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### ⑥ Idempotency Test — Replay the Same Request
Re-send the **exact same request** with the **same Idempotency-Key** (paste it manually or save it as a collection variable).

**Expected Response (200 — not 201):**
```json
{
  "success": true,
  "data": {
    "id": "b3385a98-...",  ← SAME transaction ID, no duplicate charge
    "status": "PENDING",
    ...
  }
}
```

---

### ⑦ Get a Single Transaction
| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `{{base_url}}/api/v1/transactions/{{tx_id}}` |

Wait ~3 seconds after creating the transaction — the processor stub auto-transitions it to `AUTHORIZED` or `FAILED`.

---

### ⑧ List Transactions (with Filters)
| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `{{base_url}}/api/v1/transactions` |
| Query params | `user_id={{user_id}}`, `status=PENDING`, `limit=10`, `offset=0` |

---

### ⑨ Manually Advance Transaction State (PATCH)
| Field | Value |
|-------|-------|
| Method | `PATCH` |
| URL | `{{base_url}}/api/v1/transactions/{{tx_id}}/status` |
| Header | `Content-Type: application/json` |

```json
{
  "status": "AUTHORIZED"
}
```

Then again to capture:
```json
{
  "status": "CAPTURED"
}
```

> Valid transitions:
> - `PENDING` → `AUTHORIZED` or `FAILED`  
> - `AUTHORIZED` → `CAPTURED` or `FAILED`  
> - `CAPTURED` → `REFUNDED`

---

### ⑩ Refund a Captured Transaction
| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `{{base_url}}/api/v1/transactions/{{tx_id}}/refund` |
| Header | `Content-Type: application/json` |

```json
{
  "reason": "Customer cancelled within 14-day window"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "b3385a98-...",
    "status": "REFUNDED",
    "metadata": "{\"processor\":{...},\"refund\":{\"reason\":\"Customer cancelled...\",\"refunded_at\":\"2026-09-04T...\"}}"
  }
}
```

---

### ⑪ Simulate a Webhook Callback
The processor auto-fires after 3 seconds, but you can also simulate manually.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `{{base_url}}/webhooks/processor` |
| Header | `Content-Type: application/json` |
| Header | `X-Webhook-Signature: <computed below>` |

**Step 1** — Generate the HMAC signature in your terminal:
```bash
PAYLOAD='{"transaction_id":"<TX_ID>","status":"AUTHORIZED","processor_ref":"proc_12345"}'
SECRET="change_me_before_production"
bun -e "import { signPayload } from './src/lib/crypto'; console.log(signPayload('$SECRET', '$PAYLOAD'))"
```

**Step 2** — Paste the output as the `X-Webhook-Signature` header value.

**Payload:**
```json
{
  "transaction_id": "{{tx_id}}",
  "status": "AUTHORIZED",
  "processor_ref": "proc_ref_sandbox_001"
}
```

**Valid webhook statuses:** `AUTHORIZED`, `CAPTURED`, `FAILED`

---

## Quick Reference: All Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/api/v1/users` | List all users |
| `POST` | `/api/v1/users` | Create user |
| `GET` | `/api/v1/users/:id` | Get user by ID |
| `GET` | `/api/v1/users/:userId/payment-methods` | List payment methods |
| `POST` | `/api/v1/users/:userId/payment-methods` | Add payment method |
| `DELETE` | `/api/v1/users/:userId/payment-methods/:methodId` | Delete payment method |
| `GET` | `/api/v1/transactions` | List transactions (filterable) |
| `POST` | `/api/v1/transactions` | Create transaction (requires `Idempotency-Key` header) |
| `GET` | `/api/v1/transactions/:id` | Get transaction by ID |
| `PATCH` | `/api/v1/transactions/:id/status` | Manually advance state |
| `POST` | `/api/v1/transactions/:id/refund` | Issue refund |
| `POST` | `/webhooks/processor` | Processor callback (HMAC signed) |

---

## Common Error Responses

| HTTP Status | When |
|------------|------|
| `400` | Missing JSON body, missing `Idempotency-Key`, raw PAN submitted |
| `401` | Missing or invalid `X-API-Key` (only in production) |
| `404` | User, payment method, or transaction not found |
| `409` | Duplicate email or duplicate `token_id` |
| `415` | Missing or wrong `Content-Type` header on POST/PATCH |
| `422` | Invalid field value (bad currency, bad amount, invalid state transition) |
| `429` | Rate limit exceeded (100 req / 60s per IP) |
