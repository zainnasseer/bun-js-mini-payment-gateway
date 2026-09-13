# Payment Gateway API (Bun + Drizzle ORM + SQLite)

A lightweight, high-performance payment gateway built with **Bun.js** native `Bun.serve()` and **Drizzle ORM** (`bun:sqlite`), strictly following REST, PCI-DSS compliance, idempotency, and atomic transaction guarantees.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
bun install
```

### 2. Push Schema to Database
Synchronize the TypeScript schema directly to SQLite using Drizzle Kit:
```bash
bun run db:push
```

### 3. Start the Server
```bash
bun run dev      # Hot reload enabled on http://localhost:3000
# or
bun run start    # Standard production mode
```

---

## 🧪 Automated Testing

Run the full test suite:
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

#### 1. Create a User
```bash
curl -i -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
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

## 🐳 Production Deployment

### Option A: Docker Deployment

1. **Build Docker Image**:
   ```bash
   docker build -t payment-gateway:latest .
   ```

2. **Run Container with Persistent SQLite Volume**:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     -e NODE_ENV=production \
     -e WEBHOOK_SECRET="your_production_secret" \
     -e API_KEY="your_secure_api_key" \
     --name payment-gateway \
     payment-gateway:latest
   ```

### Option B: Cloud Hosting (Fly.io / Railway / VPS)

Because SQLite is an embedded database, mount a persistent volume at `/app/data` (or wherever your `DATABASE_URL` points) so transactions persist across restarts.

Set environment variables:
- `PORT=3000`
- `NODE_ENV=production`
- `DATABASE_URL=/app/data/payment_gateway.db`
- `API_KEY=<random_32_byte_hex>`
- `WEBHOOK_SECRET=<random_32_byte_hex>`
