/// <reference path="../pb_data/types.d.ts" />

// Add "first_payment" (الدفعة الأولى) to payments.phase select values.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("payments");
    const field = collection.fields.getByName("phase");
    if (field) {
      field.values = ["first_payment", "pre_handover", "handover", "post_handover"];
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("payments");
      const field = collection.fields.getByName("phase");
      if (!field) return;
      field.values = ["pre_handover", "handover", "post_handover"];
      app.save(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
