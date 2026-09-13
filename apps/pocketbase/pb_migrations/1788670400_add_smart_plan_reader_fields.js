/// <reference path="../pb_data/types.d.ts" />

// Smart Payment Plan Reader — add optional AI-import metadata fields to the
// `payments` collection so each installment record can carry:
//   - relative_date: JSON { to: "handover", offset_months: N } for post-handover
//     payments whose date is expressed as "X months after handover" rather than
//     a fixed date. Resolved to a concrete due_date once the handover date is set.
//   - plan_source: where this payment row came from (manual | AI_IMPORT).
//   - confidence: AI extraction confidence (high | medium | low).
// All fields are OPTIONAL so existing installment/rent rows stay valid.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("payments");

    if (!collection.fields.getByName("relative_date")) {
      collection.fields.add(
        new JSONField({
          name: "relative_date",
          required: false,
          maxSize: 20000,
        }),
      );
    }

    if (!collection.fields.getByName("plan_source")) {
      collection.fields.add(
        new SelectField({
          name: "plan_source",
          required: false,
          maxSelect: 1,
          values: ["manual", "AI_IMPORT"],
        }),
      );
    }

    if (!collection.fields.getByName("confidence")) {
      collection.fields.add(
        new SelectField({
          name: "confidence",
          required: false,
          maxSelect: 1,
          values: ["high", "medium", "low"],
        }),
      );
    }

    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("payments");
      collection.fields.removeByName("relative_date");
      collection.fields.removeByName("plan_source");
      collection.fields.removeByName("confidence");
      app.save(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
