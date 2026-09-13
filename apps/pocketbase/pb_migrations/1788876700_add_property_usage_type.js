/// <reference path="../pb_data/types.d.ts" />

// Adds an independent "usage_type" classification to properties, separate from
// the existing payment "type" (cash / installment / rented). Every property
// has BOTH: a usage type (residential / commercial / land) and a payment type.
// Existing records are backfilled to "residential" so dashboards and filters
// have a sane default; owners can edit each property to correct it.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");

    // Idempotent: skip if the field already exists with the right type.
    const existing = collection.fields.getByName("usage_type");
    if (existing) {
      if (existing.type() === "select") return;
      collection.fields.removeByName("usage_type");
    }

    collection.fields.add(
      new SelectField({
        name: "usage_type",
        required: false, // enforced in the form; kept loose so existing rows stay valid
        maxSelect: 1,
        values: ["residential", "commercial", "land"],
      }),
    );
    app.save(collection);

    // Backfill every existing property to "residential" so the new stat cards
    // and filters have a value to group by. Owners can change it per property.
    const props = app.findAllRecords(collection);
    for (const rec of props) {
      const cur = rec.get("usage_type");
      if (cur === "" || cur == null) {
        rec.set("usage_type", "residential");
        app.save(rec);
      }
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("properties");
      collection.fields.removeByName("usage_type");
      app.save(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
