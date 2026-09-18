/// <reference path="../pb_data/types.d.ts" />

// NOTE: every callback is self-contained (PB runs each in an isolated VM scope).

// ---------------------------------------------------------------------------
// 1. Security: nobody can self-register as admin — role is forced to "owner".
//    The Super Admin (is_super_admin = true) is the only account allowed to
//    create other admin accounts or set roles on behalf of users.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  // A real PocketBase superuser (_superusers collection — the actual
  // account this platform's own service clients and the PocketBase admin
  // dashboard itself authenticate as) has NO is_super_admin field at all —
  // that field only exists on the `users` collection schema. Checking only
  // auth.getBool("is_super_admin") therefore always evaluated to false for
  // a genuine superuser token, silently stripping role/is_super_admin off
  // every admin account it tried to create — including from PocketBase's
  // own "_/" dashboard. A `users`-collection Super Admin (is_super_admin
  // = true on their own record) is still recognized exactly as before.
  let isSuperuserToken = false;
  try {
    isSuperuserToken = !!auth && auth.collection().name === "_superusers";
  } catch (_) {
    isSuperuserToken = false;
  }
  const isSuperAdmin = isSuperuserToken || (!!auth && auth.getBool("is_super_admin"));
  if (!isSuperAdmin) {
    e.record.set("role", "owner");
  }
  // Only the Super Admin may hold is_super_admin = true.
  if (!isSuperAdmin) {
    e.record.set("is_super_admin", false);
  }
  // Normalize identity email (lowercase + trim) so login never misses the row.
  try {
    let email = "";
    try {
      email = e.record.getString("email") || "";
    } catch (_) {
      email = String(e.record.get("email") || "");
    }
    const normalized = String(email || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    if (normalized) {
      try {
        e.record.setEmail(normalized);
      } catch (_) {
        e.record.set("email", normalized);
      }
    }
  } catch (_) {}
  e.next();
}, "users");

// Protect the permanent Super Admin account: it can never be suspended,
// demoted, or have its is_super_admin flag removed.
onRecordUpdateRequest((e) => {
  try {
    const auth = e.requestInfo().auth;
    // See the matching comment on the onRecordCreateRequest hook above — a
    // real PocketBase superuser (_superusers) token has no is_super_admin
    // field to check at all, so it must be recognized by collection name.
    let isSuperuserToken = false;
    try {
      isSuperuserToken = !!auth && auth.collection().name === "_superusers";
    } catch (_) {
      isSuperuserToken = false;
    }
    const isSuperAdmin = isSuperuserToken || (!!auth && auth.getBool("is_super_admin"));

    // Only the Super Admin may change role, permissions or is_super_admin.
    // Staff cannot escalate themselves or each other.
    if (!isSuperAdmin) {
      const orig = e.record.original();
      if (orig) {
        if (e.record.get("role") !== orig.get("role")) {
          throw new BadRequestError("SUPER_ADMIN_PROTECTED");
        }
        if (e.record.getBool("is_super_admin") !== orig.getBool("is_super_admin")) {
          throw new BadRequestError("SUPER_ADMIN_PROTECTED");
        }
      }
    }

    const orig = e.record.original();
    if (orig && orig.getBool("is_super_admin")) {
      if (e.record.getBool("suspended")) {
        throw new BadRequestError("SUPER_ADMIN_PROTECTED");
      }
      if (!e.record.getBool("is_super_admin")) {
        throw new BadRequestError("SUPER_ADMIN_PROTECTED");
      }
    }
  } catch (err) {
    if (String(err).includes("SUPER_ADMIN_PROTECTED")) throw err;
    $app.logger().error("super-admin guard failed", "err", String(err));
  }

  // Keep email identity normalized on every update.
  try {
    let email = "";
    try {
      email = e.record.getString("email") || "";
    } catch (_) {
      email = String(e.record.get("email") || "");
    }
    const normalized = String(email || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    if (normalized) {
      try {
        e.record.setEmail(normalized);
      } catch (_) {
        e.record.set("email", normalized);
      }
    }
  } catch (_) {}

  e.next();
}, "users");

// The Super Admin account can never be deleted.
onRecordDeleteRequest((e) => {
  if (e.record.getBool("is_super_admin")) {
    throw new BadRequestError("SUPER_ADMIN_PROTECTED");
  }
  e.next();
}, "users");

// ---------------------------------------------------------------------------
// 2. Every new property starts as "Pending Review" unless created by an admin.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  const isStaff =
    !!auth &&
    (auth.getBool("is_super_admin") ||
      auth.get("role") === "admin" ||
      auth.get("role") === "editor" ||
      auth.get("role") === "support" ||
      auth.get("role") === "custom");
  if (!isStaff) {
    e.record.set("status", "pending");
  }
  e.next();
}, "properties");

// ---------------------------------------------------------------------------
// 3. Activity logging for key actions.
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  try {
    const col = $app.findCollectionByNameOrId("activity_logs");
    const rec = new Record(col);
    const propOwner = e.record.get("owner") || "";
    if (propOwner) rec.set("user", propOwner);
    rec.set("action", "property_created");
    rec.set("entity", "properties");
    rec.set("entity_id", e.record.id);
    rec.set("details", e.record.get("building") + " / " + e.record.get("unit_number"));
    $app.save(rec);
  } catch (err) {
    $app.logger().error("activity log failed", "err", String(err));
  }
  e.next();
}, "properties");

onRecordUpdateRequest((e) => {
  // Owner resubmit: when the owner edits a property that an admin sent back
  // with "changes_requested", automatically reset the status to "pending" so
  // it re-enters the review queue. Admins are never affected.
  try {
    const auth = e.requestInfo().auth;
    const isAdmin = !!auth && auth.get("role") === "admin";
    const orig = e.record.original();
    if (!isAdmin && orig && orig.get("status") === "changes_requested") {
      e.record.set("status", "pending");
    }
  } catch (err) {
    $app.logger().error("resubmit reset failed", "err", String(err));
  }
  e.next();
}, "properties");

onRecordAfterUpdateSuccess((e) => {
  try {
    const col = $app.findCollectionByNameOrId("activity_logs");
    const rec = new Record(col);
    const propOwner = e.record.get("owner") || "";
    if (propOwner) rec.set("user", propOwner);

    const orig = e.record.original();
    const prevStatus = orig ? orig.get("status") : "";
    const nextStatus = e.record.get("status");
    const prevType = orig ? String(orig.get("type") || "") : "";
    const nextType = String(e.record.get("type") || "");

    // requestInfo is unavailable in After*Success hooks. Owners cannot set
    // status (blocked by the collection updateRule), so any status change to
    // a review state is an admin action — infer it from the transition.
    const actionMap = {
      approved: "property_approved",
      rejected: "property_rejected",
      changes_requested: "property_changes_requested",
      suspended: "property_suspended",
    };
    let action = "property_updated";
    let adminAction = "";
    if (prevType && nextType && prevType !== nextType) {
      action = "property_type_converted";
      adminAction = prevType + "_to_" + nextType;
    } else if (prevStatus !== nextStatus && actionMap[nextStatus]) {
      action = actionMap[nextStatus];
      adminAction = nextStatus;
    } else if (prevStatus === "changes_requested" && nextStatus === "pending") {
      action = "property_resubmitted";
      adminAction = "resubmitted";
    }

    rec.set("action", action);
    rec.set("admin_action", adminAction);
    rec.set("entity", "properties");
    rec.set("entity_id", e.record.id);
    let details =
      e.record.get("building") + " / " + e.record.get("unit_number");
    if (action === "property_type_converted") {
      details += " — type: " + prevType + " → " + nextType;
    } else {
      details +=
        " — status: " + nextStatus +
        (e.record.get("review_note") ? " — note: " + e.record.get("review_note") : "");
    }
    rec.set("details", details);
    $app.save(rec);
  } catch (err) {
    $app.logger().error("activity log failed", "err", String(err));
  }
  e.next();
}, "properties");

onRecordAfterDeleteSuccess((e) => {
  try {
    const col = $app.findCollectionByNameOrId("activity_logs");
    const rec = new Record(col);
    const delOwner = e.record.get("owner") || "";
    if (delOwner) rec.set("user", delOwner);
    rec.set("action", "property_deleted");
    rec.set("entity", "properties");
    rec.set("entity_id", e.record.id);
    rec.set("details", "");
    $app.save(rec);
  } catch (err) {
    $app.logger().error("activity log failed", "err", String(err));
  }
  e.next();
}, "properties");

onRecordAfterUpdateSuccess((e) => {
  try {
    if (e.record.get("status") === "paid") {
      const col = $app.findCollectionByNameOrId("activity_logs");
      const rec = new Record(col);
      const payOwner = e.record.get("owner") || "";
      if (payOwner) rec.set("user", payOwner);
      rec.set("action", "payment_marked_paid");
      rec.set("entity", "payments");
      rec.set("entity_id", e.record.id);
      rec.set("details", (e.record.get("label") || "") + " — " + e.record.get("amount"));
      $app.save(rec);
    }
  } catch (err) {
    $app.logger().error("activity log failed", "err", String(err));
  }
  e.next();
}, "payments");

// ---------------------------------------------------------------------------
// 4. When a payment is marked paid, increment the property's total_paid.
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess((e) => {
  try {
    const orig = e.record.original();
    if (orig && orig.get("status") !== "paid" && e.record.get("status") === "paid") {
      const prop = $app.findRecordById("properties", e.record.get("property"));
      prop.set("total_paid", (prop.get("total_paid") || 0) + e.record.get("amount"));
      $app.save(prop);
    }
  } catch (err) {
    $app.logger().error("total_paid sync failed", "err", String(err));
  }
  e.next();
}, "payments");

// ---------------------------------------------------------------------------
// 5. Notify the owner (in-app + email) when an admin changes property status.
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess((e) => {
  try {
    const orig = e.record.original();
    const next = e.record.get("status");
    if (orig && orig.get("status") !== next) {
      const ownerId = e.record.get("owner");
      const unit =
        e.record.get("building") + " / " + e.record.get("unit_number") + " — " + e.record.get("area");
      const note = e.record.get("review_note") || "";

      const titles = {
        approved: "Property approved / تمت الموافقة على العقار",
        rejected: "Property rejected / تم رفض العقار",
        changes_requested: "Changes requested / تعديلات مطلوبة على العقار",
        suspended: "Property suspended / تم تعليق العقار",
        pending: "Property under review / العقار قيد المراجعة",
      };
      const title = titles[next] || "Property status updated / تحديث حالة العقار";

      const col = $app.findCollectionByNameOrId("notifications");
      const n = new Record(col);
      n.set("user", ownerId);
      n.set("title", title);
      n.set("body", unit + (note ? "\n" + note : ""));
      n.set("type", "status");
      n.set("read", false);
      $app.save(n);

      const owner = $app.findRecordById("users", ownerId);
      const email = owner.get("email");
      if (email) {
        // Centralized EmailService (Task #14) — was a direct
        // MailerMessage/newMailClient() call before, bypassing lib-email.js
        // (the codebase's single intended email-sending path, already used
        // by alerts.pb.js/lib-monthly-reports.js).
        const { sendMail } = require(`${__hooks}/lib-email.js`);
        sendMail({
          to: email,
          subject: title,
          html:
            "<div style='font-family:sans-serif;max-width:560px;margin:auto'>" +
            "<h2 style='color:#1a2e4f'>" + title + "</h2>" +
            "<p>" + unit + "</p>" +
            (note ? "<p><b>Note:</b> " + note + "</p>" : "") +
            "<p style='color:#888;font-size:12px'>Estate Follow — إستيت فولو</p></div>",
          logContext: "property-status-change",
        });
      }
    }
  } catch (err) {
    $app.logger().error("status notification failed", "err", String(err));
  }
  e.next();
}, "properties");

// ---------------------------------------------------------------------------
// 6. Login hook — account-state checks + login audit only. The ad-hoc
//    payment-reminder sweep that used to also live here (and, before that
//    fix, raced with the payments-list hook below) has been fully retired —
//    see the header note further down and Task #14's real, cron-scheduled
//    Reminder Engine (reminder-scheduler.pb.js + lib-alerts-engine.js),
//    which now owns ALL installment/rent reminder sending. Keeping a second,
//    independent ad-hoc sweep running here (or below) alongside that real
//    engine would just reintroduce the double-send risk this file's own
//    comments already warned about — so there is deliberately only ONE
//    reminder sender left in the whole codebase now.
// ---------------------------------------------------------------------------
onRecordAuthWithPasswordRequest((e) => {
  // 1) Password / identity first — wrong credentials must never look like suspension.
  e.next();

  // 2) Distinct account-status checks only after credentials succeed.
  if (e.record) {
    let pending = false;
    try {
      pending = e.record.getBool("pending_signup");
    } catch (_) {
      pending = false;
    }

    let suspended = false;
    try {
      suspended = e.record.getBool("suspended");
    } catch (_) {
      suspended = false;
    }
    let state = "";
    try {
      state = String(e.record.getString("account_state") || e.record.get("account_state") || "")
        .trim()
        .toLowerCase();
    } catch (_) {
      state = "";
    }

    // Super Admin can never be locked out by stale flags.
    let isSuper = false;
    try {
      isSuper = e.record.getBool("is_super_admin");
    } catch (_) {
      isSuper = false;
    }
    let emailNorm = "";
    try {
      emailNorm = String(e.record.getString("email") || e.record.get("email") || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
    } catch (_) {
      emailNorm = "";
    }
    if (emailNorm === "admin@estatefollow.com") {
      isSuper = true;
    }

    if (!isSuper) {
      if (pending) {
        throw new BadRequestError("ACCOUNT_PENDING");
      }
      if (suspended || state === "suspended") {
        throw new BadRequestError("ACCOUNT_SUSPENDED");
      }
      if (state === "inactive") {
        throw new BadRequestError("ACCOUNT_INACTIVE");
      }
    }
  }

  // 3) Best-effort login audit — never fail the auth response.
  try {
    if (e.record && e.record.id) {
      const rec = new Record($app.findCollectionByNameOrId("activity_logs"));
      rec.set("user", e.record.id);
      rec.set("action", "login");
      rec.set("entity", "users");
      rec.set("entity_id", e.record.id);
      const email = e.record.get("email") || "";
      rec.set("details", email || "");
      if (e.record.getBool("is_super_admin")) {
        rec.set("admin", email || "admin@estatefollow.com");
        rec.set("admin_action", "login");
      }
      try {
        const info = e.requestInfo();
        const ua =
          (info &&
            info.headers &&
            (info.headers["user-agent"] || info.headers["User-Agent"])) ||
          "";
        if (ua) rec.set("device", String(ua).slice(0, 200));
      } catch (_) {
        /* ignore */
      }
      $app.save(rec);
    }
  } catch (err) {
    $app.logger().error("login log failed", "err", String(err));
  }
  // NOTE (duplicate-execution fix): the payment-reminder sweep used to run
  // from THIS hook too (in addition to the "payments" list hook below), with
  // no lock between them — a login immediately followed by the dashboard's
  // payments list fetch (the normal page-load sequence) could run both
  // sweeps concurrently before either had committed reminder_sent=true,
  // producing two reminder emails + two notification rows for the same
  // payment. There is now exactly ONE primary sweep — see the
  // onRecordsListRequest("payments") hook below, which fires on every
  // payments list (dashboard load, admin views, polling) and additionally
  // claims each payment atomically before sending, so it stays correct even
  // if PocketBase ever runs it from two concurrent requests at once.
}, "users");

// ---------------------------------------------------------------------------
// 7. Payments list hook — data-integrity only: flips a payment from
//    "upcoming" to "overdue" once its due_date has passed, so the status
//    shown to the owner is never stale. This is NOT a notification path
//    (it never sends anything) — that responsibility now belongs entirely
//    to the Task #14 Reminder Engine (reminder-scheduler.pb.js's real
//    cronAdd() sweep + lib-alerts-engine.js), which is the only place in
//    this codebase that creates reminder notifications/emails for
//    installments and rent. The `reminder_sent` flag and the atomic-claim
//    email-sending block that used to live here have been removed entirely
//    — keeping them would have meant TWO independent systems (this one and
//    the Reminder Engine) both emailing the owner about the same due
//    payment, which is exactly the double-send failure mode this file's own
//    prior comments were written to avoid.
// ---------------------------------------------------------------------------
onRecordsListRequest((e) => {
  e.next();
  try {
    const pad = (n) => (n < 10 ? "0" + n : "" + n);
    const fmt = (d) =>
      d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
      " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
    const now = new Date();

    const overdue = $app.findRecordsByFilter(
      "payments", "status = 'upcoming' && due_date < {:now}", "due_date", 200, 0, { now: fmt(now) },
    );
    overdue.forEach((p) => {
      p.set("status", "overdue");
      $app.save(p);
    });
  } catch (err) {
    $app.logger().error("overdue status sweep failed", "err", String(err));
  }
}, "payments");

// ---------------------------------------------------------------------------
// 7. OTP email branding now handled by 0-resend-mailer.pb.js (Resend, verify@).
// ---------------------------------------------------------------------------
// 8. Activity: user create / delete / role & permission changes
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  // BUGFIX: e.next() must never run inside a try/catch — see the identical
  // fix + explanation in trial-auto-assign.pb.js. Reading pending_signup is
  // done outside the try below now, so the single e.next() call at the end
  // always runs exactly once, unguarded.
  var isPendingSignup = false;
  try {
    isPendingSignup = !!e.record.getBool("pending_signup");
  } catch (_) {
    isPendingSignup = false;
  }
  if (!isPendingSignup) {
    try {
      // requestInfo is unavailable in After*Success hooks; log without admin identity.
      const col = $app.findCollectionByNameOrId("activity_logs");
      const rec = new Record(col);
      rec.set("user", e.record.id);
      rec.set("action", "user_created");
      rec.set("entity", "users");
      rec.set("entity_id", e.record.id);
      rec.set(
        "details",
        (e.record.get("email") || "") + " · role: " + (e.record.get("role") || ""),
      );
      $app.save(rec);
    } catch (err) {
      $app.logger().error("user create log failed", "err", String(err));
    }
  }
  e.next();
}, "users");

onRecordAfterDeleteSuccess((e) => {
  try {
    // requestInfo is unavailable in After*Success hooks; the user relation is
    // gone after delete, so leave it unset (empty string fails relation lookup).
    const col = $app.findCollectionByNameOrId("activity_logs");
    const rec = new Record(col);
    rec.set("action", "user_deleted");
    rec.set("entity", "users");
    rec.set("entity_id", e.record.id);
    rec.set(
      "details",
      (e.record.get("email") || "") + " · role: " + (e.record.get("role") || ""),
    );
    $app.save(rec);
  } catch (err) {
    $app.logger().error("user delete log failed", "err", String(err));
  }
  e.next();
}, "users");

onRecordAfterUpdateSuccess((e) => {
  // BUGFIX: e.next() must never run inside a try/catch — see the identical
  // fix + explanation in trial-auto-assign.pb.js. All the "did anything
  // relevant change" reads happen outside the try below now, so the single
  // e.next() call at the end always runs exactly once, unguarded.
  const orig = (() => {
    try {
      return e.record.original();
    } catch (_) {
      return null;
    }
  })();
  if (orig) {
    try {
      const roleChanged = orig.get("role") !== e.record.get("role");
      const permsChanged =
        JSON.stringify(orig.get("permissions") || {}) !==
        JSON.stringify(e.record.get("permissions") || {});
      const revChanged = orig.getBool("can_view_revenue") !== e.record.getBool("can_view_revenue");
      if (roleChanged || permsChanged || revChanged) {
        // requestInfo is unavailable in After*Success hooks; role/permission
        // changes are only permitted by the Super Admin, so log without identity.
        const col = $app.findCollectionByNameOrId("activity_logs");
        const rec = new Record(col);
        rec.set("user", e.record.id);
        rec.set("action", "role_permissions_changed");
        rec.set("entity", "users");
        rec.set("entity_id", e.record.id);
        rec.set(
          "details",
          (e.record.get("email") || "") +
            " · role: " +
            orig.get("role") +
            " → " +
            e.record.get("role") +
            (revChanged ? " · revenue access changed" : ""),
        );
        $app.save(rec);
      }
    } catch (err) {
      $app.logger().error("role change log failed", "err", String(err));
    }
  }
  e.next();
}, "users");
