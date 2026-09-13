/// <reference path="../pb_data/types.d.ts" />

// When an approved broker/company submits a sensitive profile update
// (name, passport, license, permits), notify Super Admin with the old → new
// values so they can review it from the admin brokerage panel.
onRecordAfterCreateSuccess((e) => {
  const status = e.record.getString("status");
  if (status !== "pending") {
    e.next();
    return;
  }

  const targetType = e.record.getString("target_type");
  const targetId = e.record.getString("target_id");

  // Build a human-readable change summary.
  let changes = "";
  try {
    const fc = e.record.get("field_changes");
    const obj = typeof fc === "string" ? JSON.parse(fc) : fc;
    if (obj && typeof obj === "object") {
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = obj[k];
        const oldVal = v && v.old != null ? String(v.old) : "";
        const newVal = v && v.new != null ? String(v.new) : "";
        changes += `${k}: "${oldVal}" -> "${newVal}"\n`;
      }
    }
  } catch (_) {}

  const passportFile = e.record.getString("new_passport_pdf");
  const licenseFile = e.record.getString("new_license_pdf");
  if (passportFile) changes += "New passport/residence document uploaded\n";
  if (licenseFile) changes += "New license document uploaded\n";

  const title =
    targetType === "company"
      ? "Brokerage company update pending review"
      : "Broker profile update pending review";
  const body =
    `A sensitive profile update was submitted and is waiting for review.\n` +
    `Target: ${targetType} (${targetId})\n` +
    `Changes:\n${changes || "(none)"}`;

  try {
    const admins = $app.findRecordsByFilter(
      "users",
      "is_super_admin = true || email = 'admin@estatefollow.com'",
      "",
      20,
      0,
    );
    for (let i = 0; i < admins.length; i++) {
      const admin = admins[i];
      try {
        const col = $app.findCollectionByNameOrId("notifications");
        const n = new Record(col);
        n.set("user", admin.id);
        n.set("title", title);
        n.set("body", body);
        n.set("type", "status");
        n.set("read", false);
        $app.save(n);
      } catch (err) {
        $app.logger().error("pending update notif failed", "err", String(err));
      }
    }
  } catch (err) {
    $app.logger().error("pending update notify failed", "err", String(err));
  }

  e.next();
}, "brokerage_pending_updates");
