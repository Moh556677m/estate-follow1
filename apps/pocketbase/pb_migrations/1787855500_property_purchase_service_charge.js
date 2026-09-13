/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");

    // Purchase date (optional) — applies to cash and installment properties.
    if (!collection.fields.getByName("purchase_date")) {
      collection.fields.add(new DateField({ name: "purchase_date", required: false }));
    }

    // Service charge amount (optional number).
    if (!collection.fields.getByName("service_charge_amount")) {
      collection.fields.add(new NumberField({ name: "service_charge_amount", min: 0, required: false }));
    }

    // Service charge due date (optional date).
    if (!collection.fields.getByName("service_charge_date")) {
      collection.fields.add(new DateField({ name: "service_charge_date", required: false }));
    }

    // Service charge frequency: one time or yearly (recurring).
    if (!collection.fields.getByName("service_charge_frequency")) {
      collection.fields.add(
        new SelectField({
          name: "service_charge_frequency",
          maxSelect: 1,
          required: false,
          values: ["one_time", "yearly"],
        }),
      );
    }

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");
    collection.fields.removeByName("purchase_date");
    collection.fields.removeByName("service_charge_amount");
    collection.fields.removeByName("service_charge_date");
    collection.fields.removeByName("service_charge_frequency");
    app.save(collection);
  },
);
