/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("properties");

    if (!collection.fields.getByName("contract_start_date")) {
      collection.fields.add(new DateField({ name: "contract_start_date" }));
    }
    if (!collection.fields.getByName("contract_end_date")) {
      collection.fields.add(new DateField({ name: "contract_end_date" }));
    }
    if (!collection.fields.getByName("security_deposit")) {
      collection.fields.add(new NumberField({ name: "security_deposit", min: 0 }));
    }

    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("properties");
      collection.fields.removeByName("contract_start_date");
      collection.fields.removeByName("contract_end_date");
      collection.fields.removeByName("security_deposit");
      app.save(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
