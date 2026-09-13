/// <reference path="../pb_data/types.d.ts" />

// Add payment-plan phase fields to the `payments` collection so each
// installment record can store its phase (pre-handover / handover /
// post-handover), its percentage of the total price, and an optional note.
// All fields are OPTIONAL so existing installment/rent rows stay valid.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("payments");

    if (!collection.fields.getByName("phase")) {
      collection.fields.add(
        new SelectField({
          name: "phase",
          required: false,
          maxSelect: 1,
          values: ["pre_handover", "handover", "post_handover"],
        }),
      );
    }

    if (!collection.fields.getByName("percentage")) {
      collection.fields.add(
        new NumberField({
          name: "percentage",
          required: false,
          min: 0,
        }),
      );
    }

    if (!collection.fields.getByName("note")) {
      collection.fields.add(
        new TextField({
          name: "note",
          required: false,
          max: 500,
        }),
      );
    }

    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("payments");
      collection.fields.removeByName("phase");
      collection.fields.removeByName("percentage");
      collection.fields.removeByName("note");
      app.save(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
