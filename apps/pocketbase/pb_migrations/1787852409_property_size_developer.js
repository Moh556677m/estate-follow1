/// <reference path="../pb_data/types.d.ts" />

// Adds optional `property_size` and `developer` text fields to the properties
// collection so AI-extracted document data (title deed / SPA) has somewhere to
// live. Both are optional — existing records and manual entry are unaffected.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");

    if (!collection.fields.getByName("property_size")) {
      collection.fields.add(new TextField({ name: "property_size", max: 60 }));
    }
    if (!collection.fields.getByName("developer")) {
      collection.fields.add(new TextField({ name: "developer", max: 200 }));
    }
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");
    collection.fields.removeByName("property_size");
    collection.fields.removeByName("developer");
    app.save(collection);
  },
);
