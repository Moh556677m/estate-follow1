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

echo "== Verifying the Supabase auth bridge fails cleanly without valid config/token (never a raw 500) =="
BRIDGE_STATUS=$(curl -sS -o /tmp/bridge.json -w '%{http_code}' \
  -X POST "$BASE_URL/hcgi/api/auth/bridge" \
  -H 'Authorization: Bearer not-a-real-token')
if [[ "$BRIDGE_STATUS" != "503" && "$BRIDGE_STATUS" != "401" ]]; then
  echo "FAIL: expected the Supabase auth bridge to reject with 503 (not configured) or 401 (bad token), got $BRIDGE_STATUS."
  cat /tmp/bridge.json
  exit 1
fi
echo "OK: the Supabase auth bridge fails cleanly ($BRIDGE_STATUS)."

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
REMAINING_PB=$(pgrep -f "apps/pocketbase/pocketbase serve" | wc -l | tr -d ' ')
if [[ "$REMAINING_PB" != "0" ]]; then
  echo "FAIL: $REMAINING_PB PocketBase process(es) survived server.cjs's SIGTERM shutdown."
  exit 1
fi
SERVER_PID=""
echo "OK: clean shutdown — no orphaned PocketBase process."

echo "== All smoke tests passed =="
