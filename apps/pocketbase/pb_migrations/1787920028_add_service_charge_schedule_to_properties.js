/// <reference path="../pb_data/types.d.ts" />

// Adds optional service-charge installment scheduling fields to `properties`.
// Non-destructive: only adds new optional fields; existing records keep their
// current service_charge_amount / service_charge_date / service_charge_frequency.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");

    // Whether annual service fees are paid in installments across the year.
    collection.fields.add(new BoolField({ name: "service_charge_paid_in_installments" }));

    // Number of service-fee payments per year (when paid in installments).
    collection.fields.add(new NumberField({ name: "service_charge_installments_count", min: 0 }));

    // Schedule rows: [{ amount: number, due_date: "YYYY-MM-DD", paid: bool }]
    collection.fields.add(new JSONField({ name: "service_charge_schedule" }));

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");
    collection.fields.removeByName("service_charge_paid_in_installments");
    collection.fields.removeByName("service_charge_installments_count");
    collection.fields.removeByName("service_charge_schedule");
    app.save(collection);
  },
);
