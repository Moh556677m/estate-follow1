/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("brokers");

    if (collection.fields.getByName("markets")) return;

    collection.fields.add(
      new JSONField({
        name: "markets",
        maxSize: 200000,
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("brokers");
      collection.fields.removeByName("markets");
      app.save(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        return;
      }
      throw e;
    }
  },
);
