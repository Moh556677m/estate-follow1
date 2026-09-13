/// <reference path="../pb_data/types.d.ts" />

// Add an optional `actual_handover_date` date field to the properties
// collection. Used by the installment/cash property form to record the real
// handover date once the property becomes ready / is handed over. Backward
// compatible — existing properties are unaffected (field is optional).

migrate(
  (app) => {
    const properties = app.findCollectionByNameOrId("properties");
    if (!properties.fields.getByName("actual_handover_date")) {
      properties.fields.add(new DateField({ name: "actual_handover_date" }));
      app.save(properties);
    }
  },
  (app) => {
    const properties = app.findCollectionByNameOrId("properties");
    if (properties.fields.getByName("actual_handover_date")) {
      properties.fields.removeByName("actual_handover_date");
      app.save(properties);
    }
  },
);
