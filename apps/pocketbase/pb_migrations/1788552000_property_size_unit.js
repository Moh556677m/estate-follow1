/// <reference path="../pb_data/types.d.ts" />

// Add an optional `property_size_unit` text field to the properties
// collection so the owner can record whether the size is in square meters
// (sqm) or square feet (sqft). Backward-compatible: existing properties keep
// the default "sqm" and are unaffected.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");
    collection.fields.add(
      new TextField({
        name: "property_size_unit",
        max: 10,
        required: false,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");
    const field = collection.fields.getByName("property_size_unit");
    if (field) collection.fields.remove(field);
    app.save(collection);
  },
);
