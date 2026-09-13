/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const properties = app.findCollectionByNameOrId("properties");

    // 1. Add "cash" to the property type select.
    const typeField = properties.fields.getByName("type");
    typeField.values = ["cash", "installment", "rented"];

    // 2. Required country field.
    if (!properties.fields.getByName("country")) {
      properties.fields.add(new TextField({ name: "country", required: true, max: 120 }));
    }

    // 3. Handover status (installment properties).
    if (!properties.fields.getByName("handover_status")) {
      properties.fields.add(
        new SelectField({
          name: "handover_status",
          maxSelect: 1,
          values: ["under_construction", "handover_completed"],
        }),
      );
    }

    // 4. Expected handover date.
    if (!properties.fields.getByName("expected_handover_date")) {
      properties.fields.add(new DateField({ name: "expected_handover_date" }));
    }

    // 5. Number of installments (informational counter, driven by the rows).
    if (!properties.fields.getByName("installments_count")) {
      properties.fields.add(new NumberField({ name: "installments_count", min: 0 }));
    }

    app.save(properties);
  },
  (app) => {
    const properties = app.findCollectionByNameOrId("properties");
    const typeField = properties.fields.getByName("type");
    typeField.values = ["installment", "rented"];
    properties.fields.removeByName("country");
    properties.fields.removeByName("handover_status");
    properties.fields.removeByName("expected_handover_date");
    properties.fields.removeByName("installments_count");
    app.save(properties);
  },
);
