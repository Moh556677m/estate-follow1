/// <reference path="../pb_data/types.d.ts" />

// Duplicate-execution fix (system-wide audit): activateOrder() in
// apps/api/src/utils/stripeActivation.js is called from THREE independent
// HTTP entry points that can legitimately race each other on the SAME order
// — the Stripe webhook, the owner-facing `/stripe/verify-order` fallback
// (polled from the success-redirect page), and the admin `/stripe/reconcile`
// action. All three used to guard activation with a plain
// "if (order.status === 'paid' || 'approved') skip" check performed in
// Node/JS AFTER a separate read — a classic read-then-write race: two
// requests can both read status:'pending' before either commits, and both
// then proceed to extend the subscription / grant an extra property slot.
//
// Express has no direct DB access to PocketBase's SQLite file, so the fix
// lives here as one atomic, single-statement "claim" the Node side calls
// BEFORE doing any activation work: a single conditional UPDATE
// (status='pending' -> 'paid') that can only ever succeed for exactly one
// caller. Whichever request's UPDATE affects a row is the exclusive
// activator for that order; every other concurrent caller sees
// rowsAffected() === 0 and skips immediately, no matter how close together
// the requests arrive.
//
// Restricted to a real PocketBase _superusers token (the only kind
// apps/api's service client authenticates as) — never callable by an
// ordinary `users`-collection session.
routerAdd('POST', '/ef/orders/{id}/claim-activation', (e) => {
  const auth = e.requestInfo().auth;
  let isServiceCaller = false;
  try {
    isServiceCaller = !!auth && auth.collection().name === '_superusers';
  } catch (_) {
    isServiceCaller = false;
  }
  if (!isServiceCaller) return e.json(403, { error: 'forbidden' });

  const orderId = e.request.pathValue('id');
  if (!orderId) return e.json(400, { error: 'missing_order_id' });

  try {
    const nowIso = new Date().toISOString();
    const res = $app
      .db()
      .newQuery(
        "UPDATE subscription_orders SET status = 'paid', processed_at = {:now} " +
          "WHERE id = {:id} AND status NOT IN ('paid', 'approved')",
      )
      .bind({ id: orderId, now: nowIso })
      .execute();
    const claimed = res ? res.rowsAffected() > 0 : false;
    return e.json(200, { claimed, processed_at: claimed ? nowIso : null });
  } catch (err) {
    $app.logger().error('order activation claim failed', 'order', orderId, 'err', String(err));
    return e.json(500, { error: 'claim_failed', message: String(err) });
  }
});
