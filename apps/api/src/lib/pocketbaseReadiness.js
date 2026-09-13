// Shared PocketBase-readiness flag.
//
// server.cjs owns the real startup sequence: deciding whether to spawn
// PocketBase, and polling its /api/health endpoint to know when it's
// actually up. This API's own PocketBase reverse proxy (main.js,
// createPocketbaseProxy) needs that same fact BEFORE it forwards a request
// to 127.0.0.1:8090 — otherwise, during the startup window where the API's
// HTTP server is already accepting connections but PocketBase hasn't
// finished booting yet, every proxied request hits a closed port and fails
// with a raw "connect ECONNREFUSED 127.0.0.1:8090" instead of a clean,
// temporary response.
//
// Node's ES module cache makes this a real shared singleton: server.cjs
// (CommonJS) reaches this via a dynamic import() of this exact path, and
// main.js (ESM) imports it normally — both resolve to the SAME module
// instance, so the flag set by one is immediately visible to the other,
// with no IPC, polling, or extra network round-trip needed.
//
// Starts false — the proxy must never forward to PocketBase before
// server.cjs has actually confirmed it healthy at least once.
let ready = false;

export function setPocketbaseReady(value) {
  ready = !!value;
}

export function isPocketbaseReady() {
  return ready;
}
