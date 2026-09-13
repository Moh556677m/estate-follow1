/// <reference path="../pb_data/types.d.ts" />

// Admin review workflow: add a "changes_requested" property status so an admin
// can ask the owner to correct and resubmit, and record which admin performed
// each review action in the activity log.
migrate(
  (app) => {
    // 1. Add "changes_requested" to the properties status select.
    const properties = app.findCollectionByNameOrId("properties");
    const statusField = properties.fields.getByName("status");
    const values = (statusField.values || []).slice();
    if (values.indexOf("changes_requested") === -1) {
      values.push("changes_requested");
      statusField.values = values;
    }
    app.save(properties);

    // 2. Add an `admin` text field to activity_logs (name/email of the admin
    //    who performed the action). Owner stays in the existing `user` field.
    const logs = app.findCollectionByNameOrId("activity_logs");
    if (!logs.fields.getByName("admin")) {
      logs.fields.add(new TextField({ name: "admin", max: 200 }));
    }
    if (!logs.fields.getByName("admin_action")) {
      logs.fields.add(new TextField({ name: "admin_action", max: 60 }));
    }
    app.save(logs);
  },
  (app) => {
    const properties = app.findCollectionByNameOrId("properties");
    const statusField = properties.fields.getByName("status");
    statusField.values = ["pending", "approved", "rejected", "suspended"];
    app.save(properties);

    const logs = app.findCollectionByNameOrId("activity_logs");
    if (logs.fields.getByName("admin")) {
      logs.fields.removeByName("admin");
    }
    if (logs.fields.getByName("admin_action")) {
      logs.fields.removeByName("admin_action");
    }
    app.save(logs);
  },
);
