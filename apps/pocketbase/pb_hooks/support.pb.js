/// <reference path="../pb_data/types.d.ts" />

// Support & Help hooks.
// Every callback is self-contained (PB runs each in an isolated VM scope).

const SUPPORT_EMAIL = "support@estatefollow.com";

// ---------------------------------------------------------------------------
// 1. Email the support team when a new support request is submitted.
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  try {
    const email = e.record.get("contact_email") || "";
    const subject = e.record.get("subject") || "(no subject)";
    const message = e.record.get("message") || "";

    // Look up the submitter's name for context.
    let fromName = "";
    try {
      const u = $app.findRecordById("users", e.record.get("user"));
      fromName = u.get("name") || "";
    } catch (err) {
      $app.logger().error("support sender lookup failed", "err", String(err));
    }

    const html =
      "<div style='font-family:sans-serif;max-width:560px;margin:auto'>" +
      "<h2 style='color:#1a2e4f'>New support request / طلب دعم جديد</h2>" +
      "<p><b>From:</b> " + (fromName ? fromName + " — " : "") + email + "</p>" +
      "<p><b>Subject:</b> " + subject + "</p>" +
      "<hr style='border:none;border-top:1px solid #eee'/>" +
      "<p style='white-space:pre-wrap'>" + message + "</p>" +
      "<p style='color:#888;font-size:12px'>Estate Follow — إستيت فولو</p></div>";

    const msg = new MailerMessage({
      from: { name: "Estate Follow Support" },
      to: [{ address: SUPPORT_EMAIL }],
      replyTo: [{ address: email }],
      subject: "[Support] " + subject,
      html: html,
    });

    try {
      $app.newMailClient().send(msg);
    } catch (mailErr) {
      $app.logger().error("support email failed", "err", String(mailErr));
    }
  } catch (err) {
    $app.logger().error("support hook failed", "err", String(err));
  }
  e.next();
}, "support_messages");

// ---------------------------------------------------------------------------
// 2. Welcome email — sent once when a signup is finalised.
//    The signup flow creates a placeholder user with pending_signup = true,
//    then on OTP verify the frontend updates the record setting
//    pending_signup = false. We detect that transition and send the welcome.
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess((e) => {
  try {
    const orig = e.record.original();
    const wasPending = orig ? orig.getBool("pending_signup") : false;
    const isPending = e.record.getBool("pending_signup");
    if (wasPending && !isPending) {
      const email = e.record.get("email") || "";
      const name = e.record.get("name") || "";

      const html =
        "<div style='font-family:sans-serif;max-width:560px;margin:auto'>" +
        "<h2 style='color:#1a2e4f'>Welcome to Estate Follow</h2>" +
        "<p>Your account has been successfully verified. You can now add your " +
        "properties and manage installments, rentals, and payments from one place.</p>" +
        "<p>If you need help, contact:<br/><a href='mailto:support@estatefollow.com'>" +
        "support@estatefollow.com</a></p>" +
        "<hr style='border:none;border-top:1px solid #eee'/>" +
        "<p dir='rtl'>مرحبًا بك في إستيت فولو</p>" +
        "<p dir='rtl'>تم تفعيل حسابك بنجاح. يمكنك الآن إضافة عقاراتك ومتابعة الأقساط " +
        "والإيجارات والمدفوعات من مكان واحد.</p>" +
        "<p dir='rtl'>إذا احتجت إلى أي مساعدة، تواصل معنا عبر:<br/>" +
        "support@estatefollow.com</p>" +
        "<p style='color:#888;font-size:12px'>Estate Follow — إستيت فولو</p></div>";

      const msg = new MailerMessage({
        from: { name: "Estate Follow" },
        to: [{ address: email }],
        subject: "Welcome to Estate Follow / مرحبًا بك في إستيت فولو",
        html: html,
      });

      try {
        $app.newMailClient().send(msg);
      } catch (mailErr) {
        $app.logger().error("welcome email failed", "err", String(mailErr));
      }
    }
  } catch (err) {
    $app.logger().error("welcome hook failed", "err", String(err));
  }
  e.next();
}, "users");
