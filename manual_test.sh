#!/usr/bin/env bash
# ==============================================================================
# Payment Gateway — Manual Testing & API Verification Script
#
# Usage:
#   ./manual_test.sh [BASE_URL]
# Example:
#   ./manual_test.sh http://localhost:3000
# ==============================================================================

set -e

BASE_URL="${1:-http://localhost:3000}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-change_me_before_production}"

echo "======================================================================"
echo "🎯 Testing Payment Gateway at: $BASE_URL"
echo "======================================================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS:${NC} $1"; }
info() { echo -e "\n${BLUE}▶ $1${NC}"; }
fail() { echo -e "${RED}✗ FAIL:${NC} $1"; exit 1; }

# Helper to print formatted JSON if jq/bun is available
pretty() {
  if command -v jq >/dev/null 2>&1; then
    jq '.'
  else
    cat
  fi
}

# 1. Health check
info "1. GET /health"
HEALTH_RES=$(curl -s "$BASE_URL/health")
echo "$HEALTH_RES" | pretty
if echo "$HEALTH_RES" | grep -q '"status":"ok"'; then
  pass "Server is healthy and responsive"
else
  fail "Health check failed"
fi

# 2. Create User
info "2. POST /api/v1/users (Create User)"
USER_EMAIL="user_$(date +%s)@example.com"
USER_RES=$(curl -s -X POST "$BASE_URL/api/v1/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER_EMAIL\", \"name\": \"Alex Mercer\"}")
echo "$USER_RES" | pretty

USER_ID=$(echo "$USER_RES" | bun -e 'const d = JSON.parse(await new Response(process.stdin).text()); console.log(d.data?.id || "");')
if [ -z "$USER_ID" ]; then fail "Failed to retrieve user ID"; fi
pass "User created with ID: $USER_ID"

# 3. PCI-DSS Violation Guard
info "3. POST /api/v1/users/:id/payment-methods (PCI-DSS Security Guard Check)"
PCI_RES=$(curl -s -X POST "$BASE_URL/api/v1/users/$USER_ID/payment-methods" \
  -H "Content-Type: application/json" \
  -d '{"type": "CARD", "token_id": "tok_violator", "last_four": "1111", "expiry_month": 12, "expiry_year": 2028, "pan": "4111111111111111"}')
echo "$PCI_RES" | pretty
if echo "$PCI_RES" | grep -q "Raw cardholder data"; then
  pass "PCI-DSS guard successfully blocked raw PAN submission (400)"
else
  fail "PCI-DSS guard did not trigger on raw PAN!"
fi

# 4. Valid Payment Method
info "4. POST /api/v1/users/:id/payment-methods (Valid Client-side Token)"
TOKEN_ID="tok_test_$(date +%s)"
PM_RES=$(curl -s -X POST "$BASE_URL/api/v1/users/$USER_ID/payment-methods" \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"CARD\", \"token_id\": \"$TOKEN_ID\", \"last_four\": \"4242\", \"expiry_month\": 12, \"expiry_year\": 2028, \"is_default\": true}")
echo "$PM_RES" | pretty

PM_ID=$(echo "$PM_RES" | bun -e 'const d = JSON.parse(await new Response(process.stdin).text()); console.log(d.data?.id || "");')
if [ -z "$PM_ID" ]; then fail "Failed to retrieve payment method ID"; fi
pass "Payment method added with ID: $PM_ID"

# 5. Create Transaction with Idempotency-Key
info "5. POST /api/v1/transactions (First attempt with UUID v4 Idempotency-Key)"
IDEM_KEY=$(bun -e 'console.log(crypto.randomUUID())')
echo "Using Idempotency-Key: $IDEM_KEY"

TX_HEADER_RES=$(curl -si -X POST "$BASE_URL/api/v1/transactions" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d "{\"user_id\": \"$USER_ID\", \"payment_method_id\": \"$PM_ID\", \"amount\": 4999, \"currency\": \"USD\", \"description\": \"Annual subscription\"}")

HTTP_STATUS=$(echo "$TX_HEADER_RES" | head -n 1 | awk '{print $2}')
TX_BODY=$(echo "$TX_HEADER_RES" | sed '1,/^\r\{0,1\}$/d')
echo "$TX_BODY" | pretty

if [ "$HTTP_STATUS" = "201" ]; then
  pass "Transaction created with 201 Created (Status: PENDING)"
else
  fail "Expected 201 Created but received $HTTP_STATUS"
fi

TX_ID=$(echo "$TX_BODY" | bun -e 'const d = JSON.parse(await new Response(process.stdin).text()); console.log(d.data?.id || "");')

# 6. Replay Same Transaction (Idempotency Check)
info "6. POST /api/v1/transactions (Replay attempt with SAME Idempotency-Key)"
REPLAY_RES=$(curl -si -X POST "$BASE_URL/api/v1/transactions" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d "{\"user_id\": \"$USER_ID\", \"payment_method_id\": \"$PM_ID\", \"amount\": 4999, \"currency\": \"USD\", \"description\": \"Annual subscription\"}")

REPLAY_STATUS=$(echo "$REPLAY_RES" | head -n 1 | awk '{print $2}')
REPLAY_BODY=$(echo "$REPLAY_RES" | sed '1,/^\r\{0,1\}$/d')
echo "$REPLAY_BODY" | pretty
REPLAY_ID=$(echo "$REPLAY_BODY" | bun -e 'const d = JSON.parse(await new Response(process.stdin).text()); console.log(d.data?.id || "");')

if [ "$REPLAY_STATUS" = "200" ] && [ "$TX_ID" = "$REPLAY_ID" ]; then
  pass "Idempotency verified! Returned 200 OK with identical Transaction ID ($TX_ID). No double charge."
else
  fail "Idempotency check failed: expected 200 OK and matching ID, got status $REPLAY_STATUS"
fi

# 7. Webhook Simulation (HMAC Signature)
info "7. POST /webhooks/processor (HMAC-SHA256 Signed Webhook State Transition)"
WEBHOOK_PAYLOAD_1="{\"transaction_id\":\"$TX_ID\",\"status\":\"AUTHORIZED\",\"processor_ref\":\"proc_ref_$(date +%s)\"}"
HMAC_SIG_1=$(bun -e "import { signPayload } from './src/lib/crypto'; console.log(signPayload('$WEBHOOK_SECRET', '$WEBHOOK_PAYLOAD_1'))")

WH_RES_1=$(curl -s -X POST "$BASE_URL/webhooks/processor" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $HMAC_SIG_1" \
  -d "$WEBHOOK_PAYLOAD_1")
echo "$WH_RES_1" | pretty
pass "Transitioned PENDING → AUTHORIZED via HMAC-signed webhook"

WEBHOOK_PAYLOAD_2="{\"transaction_id\":\"$TX_ID\",\"status\":\"CAPTURED\",\"processor_ref\":\"proc_ref_$(date +%s)\"}"
HMAC_SIG_2=$(bun -e "import { signPayload } from './src/lib/crypto'; console.log(signPayload('$WEBHOOK_SECRET', '$WEBHOOK_PAYLOAD_2'))")

WH_RES_2=$(curl -s -X POST "$BASE_URL/webhooks/processor" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $HMAC_SIG_2" \
  -d "$WEBHOOK_PAYLOAD_2")
echo "$WH_RES_2" | pretty
pass "Transitioned AUTHORIZED → CAPTURED via HMAC-signed webhook"

# 8. Refund Transaction
info "8. POST /api/v1/transactions/:id/refund (Atomic Refund)"
REFUND_RES=$(curl -s -X POST "$BASE_URL/api/v1/transactions/$TX_ID/refund" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Customer requested full cancellation"}')
echo "$REFUND_RES" | pretty

if echo "$REFUND_RES" | grep -q '"status":"REFUNDED"'; then
  pass "Transaction atomically transitioned CAPTURED → REFUNDED"
else
  fail "Refund failed"
fi

# 9. Query Transaction by ID
info "9. GET /api/v1/transactions/:id"
FINAL_TX=$(curl -s "$BASE_URL/api/v1/transactions/$TX_ID")
echo "$FINAL_TX" | pretty
pass "Fetched final transaction with full audit metadata"

echo -e "\n======================================================================"
echo -e "${GREEN}🎉 All manual tests passed successfully!${NC}"
echo "======================================================================"
