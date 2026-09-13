/// <reference path="../pb_data/types.d.ts" />

// Smart Payment Plan Reader — persistent plan records.
//
// Creates a dedicated `payment_plans` collection (one plan per property,
// owner-scoped) so an AI-extracted or manually-built plan is stored as a
// first-class record linked to the property, and every installment in the
// `payments` collection points back to it via `payment_plan_id`.
//
// Also adds per-installment metadata fields to `payments` so the full
// extraction schema is persisted, not just amount/date/phase:
//   - payment_type   : first_payment | recurring_installment | bullet_payment
//                      | handover_payment | post_handover_installment | custom_payment
//   - raw_label      : the original label text as printed on the document
//   - source_page    : which page/file the row was read from (1-based)
//   - payment_plan_id: relation to payment_plans (the plan this row belongs to)
//
// All new fields are OPTIONAL so existing installment/rent rows and the
// existing `payment_plan_stages` JSON on properties keep working unchanged.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const properties = app.findCollectionByNameOrId("properties");

    // ---- 1. Create the payment_plans collection (if it does not exist) ----
    let plans;
    try {
      plans = app.findCollectionByNameOrId("payment_plans");
    } catch (_) {
      plans = new Collection({
        type: "base",
        name: "payment_plans",
        // Owner-scoped (hard rule #1). Staff/admin can also read.
        listRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.is_super_admin = true)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.is_super_admin = true)",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.is_super_admin = true)",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.is_super_admin = true)",
        fields: [
          {
            name: "property",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: properties.id,
            cascadeDelete: true,
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            // Predefined plan type (1-4) or "custom". Mirrors the property
            // payment_plan_type field so the plan record is self-describing.
            name: "plan_type",
            type: "select",
            maxSelect: 1,
            values: ["1", "2", "3", "4", "custom"],
          },
          { name: "currency", type: "text", max: 20 },
          { name: "total_price", type: "number", min: 0 },
          { name: "total_percentage", type: "number", min: 0 },
          { name: "total_amount", type: "number", min: 0 },
          {
            name: "source",
            type: "select",
            maxSelect: 1,
            values: ["manual", "AI_IMPORT"],
          },
          // JSON: [{ name, hash }] — the files the plan was read from.
          { name: "source_files", type: "json", maxSize: 200000 },
          // JSON: the canonical ordered stage array (same shape as the
          // property payment_plan_stages field).
          { name: "stages", type: "json", maxSize: 500000 },
          {
            name: "status",
            type: "select",
            maxSelect: 1,
            values: ["draft", "active", "archived"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_payment_plans_property ON payment_plans (property)",
          "CREATE INDEX idx_payment_plans_owner ON payment_plans (owner)",
        ],
      });
      app.save(plans);
    }

    // ---- 2. Add per-installment metadata + plan link to `payments` ----
    const payments = app.findCollectionByNameOrId("payments");

    if (!payments.fields.getByName("payment_type")) {
      payments.fields.add(
        new SelectField({
          name: "payment_type",
          required: false,
          maxSelect: 1,
          values: [
            "first_payment",
            "recurring_installment",
            "bullet_payment",
            "handover_payment",
            "post_handover_installment",
            "custom_payment",
          ],
        }),
      );
    }

    if (!payments.fields.getByName("raw_label")) {
      payments.fields.add(new TextField({ name: "raw_label", required: false, max: 300 }));
    }

    if (!payments.fields.getByName("source_page")) {
      payments.fields.add(new NumberField({ name: "source_page", required: false, min: 0 }));
    }

    if (!payments.fields.getByName("payment_plan_id")) {
      payments.fields.add(
        new RelationField({
          name: "payment_plan_id",
          required: false,
          maxSelect: 1,
          collectionId: plans.id,
          cascadeDelete: false,
        }),
      );
    }

    app.save(payments);
  },
  (app) => {
    // Down: remove the added payments fields, then drop payment_plans.
    try {
      const payments = app.findCollectionByNameOrId("payments");
      ["payment_type", "raw_label", "source_page", "payment_plan_id"].forEach((n) => {
        try {
          payments.fields.removeByName(n);
        } catch (_) {
          /* field may not exist */
        }
      });
      app.save(payments);
    } catch (_) {
      /* payments may not exist */
    }

    try {
      const plans = app.findCollectionByNameOrId("payment_plans");
      app.delete(plans);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      if (e.message && /no rows/i.test(e.message)) return;
      throw e;
    }
  },
);
