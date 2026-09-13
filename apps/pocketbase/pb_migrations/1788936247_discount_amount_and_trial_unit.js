/// <reference path="../pb_data/types.d.ts" />

// Switch package discounts from percent → fixed currency amount, and add
// trial_unit (days | months) next to trial_days.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("subscription_settings");

    if (!col.fields.getByName("annual_discount_amount")) {
      col.fields.add(new NumberField({ name: "annual_discount_amount", min: 0 }));
    }
    if (!col.fields.getByName("premium_discount_amount")) {
      col.fields.add(new NumberField({ name: "premium_discount_amount", min: 0 }));
    }
    if (!col.fields.getByName("unlimited_discount_amount")) {
      col.fields.add(new NumberField({ name: "unlimited_discount_amount", min: 0 }));
    }
    if (!col.fields.getByName("trial_unit")) {
      col.fields.add(
        new SelectField({
          name: "trial_unit",
          values: ["days", "months"],
          maxSelect: 1,
        }),
      );
    }
    app.save(col);

    // Backfill: convert legacy percent → amount, default trial_unit = days
    let rows = [];
    try {
      rows = app.findAllRecords("subscription_settings");
    } catch (_) {
      rows = [];
    }
    rows.forEach((r) => {
      const pairs = [
        ["annual_price", "annual_discount_percent", "annual_discount_amount"],
        ["premium_price", "premium_discount_percent", "premium_discount_amount"],
        ["unlimited_price", "unlimited_discount_percent", "unlimited_discount_amount"],
      ];
      pairs.forEach(([priceKey, pctKey, amtKey]) => {
        const existingAmt = Number(r.get(amtKey) || 0);
        if (existingAmt > 0) return;
        const price = Number(r.get(priceKey) || 0);
        const pct = Number(r.get(pctKey) || 0);
        if (pct > 0 && price > 0) {
          const amt = Math.round(price * (pct / 100) * 100) / 100;
          r.set(amtKey, Math.min(price, Math.max(0, amt)));
        } else if (r.get(amtKey) == null) {
          r.set(amtKey, 0);
        }
      });
      const unit = String(r.get("trial_unit") || "");
      if (unit !== "days" && unit !== "months") {
        r.set("trial_unit", "days");
      }
      app.save(r);
    });
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("subscription_settings");
      [
        "annual_discount_amount",
        "premium_discount_amount",
        "unlimited_discount_amount",
        "trial_unit",
      ].forEach((n) => {
        try {
          col.fields.removeByName(n);
        } catch (_) {}
      });
      app.save(col);
    } catch (_) {}
  },
);
