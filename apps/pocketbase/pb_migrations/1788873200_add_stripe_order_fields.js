/// <reference path="../pb_data/types.d.ts" />

// Stripe checkout flow — add `paid` and `failed` order statuses and Stripe
// tracking fields to subscription_orders.
//
// The Stripe webhook marks confirmed payments as `paid` and activates the
// package on the user record automatically (no manual admin approval).
// Expired/failed checkout sessions become `failed`; user-cancelled sessions
// stay `cancelled`. Historical orders keep their original status.

migrate(
  (app) => {
    const orders = app.findCollectionByNameOrId("subscription_orders");

    // Extend the status select with paid/failed (preserve existing values).
    const statusField = orders.fields.getByName("status");
    const vals = (statusField.values || []).slice();
    ["paid", "failed"].forEach((v) => {
      if (vals.indexOf(v) === -1) vals.push(v);
    });
    statusField.values = vals;

    // Stripe tracking fields for reconciliation / idempotency.
    if (!orders.fields.getByName("stripe_session_id")) {
      orders.fields.add(new TextField({ name: "stripe_session_id", max: 200 }));
    }
    if (!orders.fields.getByName("stripe_payment_id")) {
      orders.fields.add(new TextField({ name: "stripe_payment_id", max: 200 }));
    }
    app.save(orders);
  },
  (app) => {
    try {
      const orders = app.findCollectionByNameOrId("subscription_orders");
      const statusField = orders.fields.getByName("status");
      if (statusField) {
        const vals = (statusField.values || [])
          .slice()
          .filter((v) => v !== "paid" && v !== "failed");
        statusField.values = vals;
      }
      try {
        orders.fields.removeByName("stripe_session_id");
      } catch (_) {}
      try {
        orders.fields.removeByName("stripe_payment_id");
      } catch (_) {}
      app.save(orders);
    } catch (_) {}
  },
);
