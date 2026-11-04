#!/usr/bin/env bash
set -e
BASE_URL="${1:-http://localhost:3000}"

echo "Testing merchant gateway at $BASE_URL"

MERCHANT=$(curl -s -X POST "$BASE_URL/api/v1/merchants" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CLI Test Store",
    "email": "cli-'$(date +%s)'@example.com",
    "webhook_url": "https://example.com/hook",
    "phone_number": "+1-555-0100",
    "origin_header": "https://example.com",
    "ip_whitelist": ["203.0.113.1"]
  }')

API_KEY=$(echo "$MERCHANT" | bun -e 'const d=JSON.parse(await new Response(process.stdin).text()); console.log(d.data?.apiKey||"")')
WH_SECRET=$(echo "$MERCHANT" | bun -e 'const d=JSON.parse(await new Response(process.stdin).text()); console.log(d.data?.webhookSecret||"")')
[ -n "$API_KEY" ] || { echo "Merchant registration failed"; exit 1; }

IDEM=$(bun -e 'console.log(crypto.randomUUID())')
TX=$(curl -s -X POST "$BASE_URL/api/v1/transactions" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "Idempotency-Key: $IDEM" \
  -d '{"amount": 2500, "currency": "USD", "description": "CLI charge"}')
TX_ID=$(echo "$TX" | bun -e 'const d=JSON.parse(await new Response(process.stdin).text()); console.log(d.data?.id||"")')

PAYLOAD=$(printf '{"transaction_id":"%s","status":"AUTHORIZED","processor_ref":"cli"}' "$TX_ID")
SIG=$(bun -e "const {createHmac}=require('node:crypto'); const s=process.argv[1]; const p=process.argv[2]; console.log(createHmac('sha256',s).update(p).digest('hex'));" "$WH_SECRET" "$PAYLOAD")

curl -s -X POST "$BASE_URL/webhooks/processor" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$PAYLOAD" | head -c 200
echo ""
echo "Done — merchant registered, charge created, webhook sent."
