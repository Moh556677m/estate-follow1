#!/usr/bin/env bash
set -euo pipefail

# Real smoke test — boots the ACTUAL production entrypoint (server.cjs, the
# exact file Hostinger runs) against a throwaway PocketBase data directory,
# and exercises the real startup/shutdown sequence end to end. This exists
# because this project has repeatedly hit production-only failures in this
# exact sequence (PocketBase double-spawn, EACCES on the binary, the API
# accepting requests before PocketBase is healthy, an orphaned PocketBase
# process after SIGTERM) that a build-only or unit-test-only CI pipeline
# cannot catch. If this script ever starts failing, do NOT raise a timeout
# to make it pass — that hides the real regression instead of fixing it.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PB_ENCRYPTION_KEY="${PB_ENCRYPTION_KEY:-$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")}"
export PB_SUPERUSER_EMAIL="${PB_SUPERUSER_EMAIL:-smoke-admin@example.com}"
export PB_SUPERUSER_PASSWORD="${PB_SUPERUSER_PASSWORD:-Sm0ke-Test-Password!}"
export PORT="${PORT:-4174}"
BASE_URL="http://127.0.0.1:${PORT}"

# Throwaway pb_data — proves PB_DATA_DIR (server.cjs) actually works, and
# never touches whatever pb_data a real deploy might have (gitignored, so
# none should exist in this checkout anyway).
TMP_DATA_DIR="$(mktemp -d)"
export PB_DATA_DIR="$TMP_DATA_DIR"

SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DATA_DIR"
}
trap cleanup EXIT

chmod +x apps/pocketbase/pocketbase || true

echo "== Booting server.cjs against a throwaway PocketBase data dir =="
node server.cjs > smoke-test-server.log 2>&1 &
SERVER_PID=$!

echo "== Waiting for the API to start accepting connections (must be fast — Hostinger expects listen() within ~3s) =="
API_UP=0
for i in $(seq 1 10); do
  if curl -sS -o /dev/null "$BASE_URL/hcgi/api/health"; then
    API_UP=1
    break
  fi
  sleep 1
done
if [[ "$API_UP" != "1" ]]; then
  echo "FAIL: the API never started accepting connections within 10s."
  cat smoke-test-server.log
  exit 1
fi
echo "OK: API is accepting connections."

echo "== Verifying the reverse proxy returns a clean 503 (never a raw ECONNREFUSED) before PocketBase is ready =="
# This is a best-effort race: PocketBase may already be healthy by the time
# this runs on a fast CI runner, in which case a 200 is equally correct —
# only a raw connection-refused failure (curl exit != 0, no HTTP status at
# all) is a real failure of the readiness gate.
if ! curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/hcgi/platform/api/health" > /tmp/early-proxy-status.txt; then
  echo "FAIL: the reverse proxy connection itself failed instead of returning a clean HTTP response."
  cat smoke-test-server.log
  exit 1
fi
echo "OK: the reverse proxy always returns a real HTTP response, never a raw connection failure."

echo "== Waiting for PocketBase itself to become healthy (through the real proxy) =="
PB_UP=0
for i in $(seq 1 40); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/hcgi/platform/api/health" || echo 000)
  if [[ "$code" == "200" ]]; then
    PB_UP=1
    break
  fi
  sleep 1
done
if [[ "$PB_UP" != "1" ]]; then
  echo "FAIL: PocketBase never became healthy through the reverse proxy within 40s."
  cat smoke-test-server.log
  exit 1
fi
echo "OK: PocketBase is healthy through /hcgi/platform."

echo "== Verifying the PocketBase superuser account actually works =="
SUPERUSER_STATUS=$(curl -sS -o /tmp/superuser-auth.json -w '%{http_code}' \
  -X POST "$BASE_URL/hcgi/platform/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}")
if [[ "$SUPERUSER_STATUS" != "200" ]]; then
  echo "FAIL: could not authenticate the PocketBase superuser account (status $SUPERUSER_STATUS)."
  cat /tmp/superuser-auth.json
  exit 1
fi
echo "OK: PocketBase superuser authentication works."

echo "== Verifying only ONE PocketBase process is running (no double-spawn) =="
PB_PROC_COUNT=$(pgrep -f "apps/pocketbase/pocketbase serve" | wc -l | tr -d ' ')
if [[ "$PB_PROC_COUNT" != "1" ]]; then
  echo "FAIL: expected exactly 1 PocketBase process, found $PB_PROC_COUNT."
  ps aux | grep pocketbase || true
  exit 1
fi
echo "OK: exactly one PocketBase process is running."

echo "== Verifying a regular-user OTP endpoint fails cleanly on bad input (never a raw 500) =="
OTP_STATUS=$(curl -sS -o /tmp/otp.json -w '%{http_code}' \
  -X POST "$BASE_URL/hcgi/api/user-otp/signup/verify" \
  -H 'Content-Type: application/json' \
  -d '{"email":"not-a-real-email","code":"000000","password":"short"}')
if [[ "$OTP_STATUS" != "400" ]]; then
  echo "FAIL: expected the OTP verify endpoint to reject malformed input with 400, got $OTP_STATUS."
  cat /tmp/otp.json
  exit 1
fi
echo "OK: the OTP endpoint fails cleanly on bad input ($OTP_STATUS)."

echo "== Verifying a freshly-created signup placeholder (pending_signup=true) can immediately log in =="
# Regression guard for a real production deadlock: routes/user-otp.js's
# /signup/verify creates the user record with pending_signup=true by design
# (see its own comment), then AuthContext.jsx's verifySignupOtp()
# immediately authenticates as that same record so it can call
# finalize-signup.pb.js — the ONLY thing that ever clears pending_signup.
# A PocketBase auth hook that rejects auth-with-password purely because
# pending_signup is still true makes that impossible: the account can
# never reach finalize-signup, so it can never stop being "pending", so it
# can never log in again either — a permanent deadlock on every single
# signup. This exact bug shipped once already (platform.pb.js's account
# hook used to throw ACCOUNT_PENDING here) and is invisible to the unit
# tests (they mock PocketBase entirely), so it is asserted here against a
# real PocketBase instance instead.
SUPERUSER_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/superuser-auth.json','utf8')).token)")
PENDING_EMAIL="smoke-pending-$(date +%s)@example.com"
PENDING_PASSWORD="Sm0ke-Pending-Password!"
CREATE_STATUS=$(curl -sS -o /tmp/pending-create.json -w '%{http_code}' \
  -X POST "$BASE_URL/hcgi/platform/api/collections/users/records" \
  -H "Authorization: $SUPERUSER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PENDING_EMAIL\",\"password\":\"$PENDING_PASSWORD\",\"passwordConfirm\":\"$PENDING_PASSWORD\",\"role\":\"owner\",\"pending_signup\":true,\"nationality\":\"PENDING\",\"gender\":\"male\",\"verified\":true,\"name\":\"\"}")
if [[ "$CREATE_STATUS" != "200" ]]; then
  echo "FAIL: could not create the pending-signup placeholder record (status $CREATE_STATUS)."
  cat /tmp/pending-create.json
  exit 1
fi
PENDING_LOGIN_STATUS=$(curl -sS -o /tmp/pending-login.json -w '%{http_code}' \
  -X POST "$BASE_URL/hcgi/platform/api/collections/users/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$PENDING_EMAIL\",\"password\":\"$PENDING_PASSWORD\"}")
if [[ "$PENDING_LOGIN_STATUS" != "200" ]]; then
  echo "FAIL: a freshly-created pending_signup=true account could not authenticate (status $PENDING_LOGIN_STATUS) — this is the signup deadlock bug."
  cat /tmp/pending-login.json
  exit 1
fi
echo "OK: a freshly-created signup placeholder can authenticate immediately (no deadlock)."

echo "== Verifying an owner identity-document upload larger than the OLD 10MB cap now succeeds =="
# Regression guard for a real production bug: passport_file/residence_file/
# document_file/user_additional_documents.file were all created with
# maxSize: 10485760 (10MB) — a real scanned passport/residence PDF
# routinely exceeds that, and PocketBase rejected the request before it
# ever reached the frontend's own generic "تعذر رفع الملف" message. Proves
# an ~15MB file (bigger than the old cap, well under the new 100MB one)
# uploads successfully to a real PocketBase instance with the real
# migration applied — not just that the migration file has valid syntax.
OWNER_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/pending-login.json','utf8')).token)")
OWNER_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/pending-login.json','utf8')).record.id)")
LARGE_PDF="$TMP_DATA_DIR/large-test.pdf"
node -e "
const fs = require('fs');
const header = Buffer.from('%PDF-1.4\n');
const filler = Buffer.alloc(15 * 1024 * 1024, 0x41);
fs.writeFileSync('$LARGE_PDF', Buffer.concat([header, filler]));
"
LARGE_UPLOAD_STATUS=$(curl -sS -o /tmp/large-upload.json -w '%{http_code}' \
  -X PATCH "$BASE_URL/hcgi/platform/api/collections/users/records/$OWNER_ID" \
  -H "Authorization: $OWNER_TOKEN" \
  -F "passport_file=@$LARGE_PDF;type=application/pdf" \
  -F "passport_number=A1234567")
if [[ "$LARGE_UPLOAD_STATUS" != "200" ]]; then
  echo "FAIL: a ~15MB identity-document upload was rejected (status $LARGE_UPLOAD_STATUS) — the 10MB cap regression is back."
  cat /tmp/large-upload.json
  exit 1
fi
echo "OK: a ~15MB passport upload succeeds against the real PocketBase instance."

echo "== Verifying SIGTERM shuts down gracefully with no orphaned PocketBase process =="
kill -TERM "$SERVER_PID"
for i in $(seq 1 10); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 1
done
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "FAIL: server.cjs did not exit within the grace period after SIGTERM."
  kill -9 "$SERVER_PID" 2>/dev/null || true
  exit 1
fi
sleep 1
# pgrep exits 1 (not an error — just "no match") when zero processes are
# found, which is the GOOD outcome here. Under `set -o pipefail` that
# would otherwise abort the whole script right on this line before the
# actual check below ever runs, permanently short-circuiting this test to
# a silent non-result instead of a real pass/fail every time shutdown is
# genuinely clean.
REMAINING_PB=$(pgrep -f "apps/pocketbase/pocketbase serve" | wc -l | tr -d ' ' || true)
REMAINING_PB="${REMAINING_PB:-0}"
if [[ "$REMAINING_PB" != "0" ]]; then
  echo "FAIL: $REMAINING_PB PocketBase process(es) survived server.cjs's SIGTERM shutdown."
  exit 1
fi
SERVER_PID=""
echo "OK: clean shutdown — no orphaned PocketBase process."

echo "== All smoke tests passed =="
