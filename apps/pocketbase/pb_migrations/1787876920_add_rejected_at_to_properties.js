/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");
    if (collection.fields.getByName("rejected_at")) return;
    collection.fields.add(new DateField({ name: "rejected_at", required: false }));
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("properties");
      collection.fields.removeByName("rejected_at");
      app.save(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
