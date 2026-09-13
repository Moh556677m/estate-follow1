/// <reference path="../pb_data/types.d.ts" />

// ============================================================================
// Resend mailer — primary outbound email for Estate Follow.
//
// Two dedicated sender addresses on the estatefollow.com domain, both
// authenticated with the single RESEND_API_KEY env var:
//
//   • verify@estatefollow.com        → OTP + verification + password-reset +
//                                     email-change + new-device auth alerts
//   • notifications@estatefollow.com → reminders, alerts, marketing, support,
//                                     referral, brokerage & CRM notifications
//
// Resend lets any address on a verified domain send under one API key — BUT
// the domain MUST be verified in Resend (SPF/DKIM/DMARC DNS records). If it
// is not, Resend rejects with HTTP 422 and no email is delivered.
//
// ── CRITICAL: JSVM ISOLATED SCOPE ──────────────────────────────────────────
// PocketBase runs each hook callback in an ISOLATED JSVM scope. A callback
// CANNOT access variables or functions declared at the file's outer scope —
// referencing them throws `ReferenceError: <name> is not defined`, which
// aborts the callback BEFORE `e.next()` runs, so NO email is sent (neither
// via Resend nor via the platform fallback relay). This was the root cause of
// the "OTP never arrives" signup bug.
//
// Therefore EVERY constant and helper below is defined INSIDE each callback.
// The duplication across callbacks is intentional and required — do NOT
// "refactor" it back to the top level. (The platform's own builder-mailer.pb.js
// follows the same self-contained pattern.)
// ───────────────────────────────────────────────────────────────────────────
//
// Routing strategy:
//   - Auth emails are intercepted in their onMailerRecord*Send hooks (which
//     fire before onMailerSend). They are delivered via Resend from verify@
//     and e.next() is NOT called on success, so the core send aborts and the
//     legacy builder-mailer.pb.js onMailerSend never fires for them.
//   - Every other email (reminders, alerts, campaigns, …) flows into the
//     central onMailerSend hook below, which delivers via Resend from
//     notifications@ (or an explicit from.address already set on the message)
//     and likewise skips e.next() on success.
//
// FAILURE HANDLING (critical for OTP delivery):
//   - If RESEND_API_KEY is NOT set in the PocketBase process env, Resend
//     cannot be used. We fall back to the platform builder relay (e.next())
//     so auth emails still go out — the relay sends from a generic platform
//     address, so recipients should check their spam folder. To send from
//     verify@estatefollow.com via Resend, set RESEND_API_KEY in the PocketBase
//     env AND verify estatefollow.com in Resend.
//   - If Resend IS configured but returns a 4xx config error (e.g. domain not
//     verified, bad key), we THROW so the /request-otp (or verification/reset)
//     request returns an error to the client. The frontend then shows "could
//     not send the code" instead of opening the OTP modal — the user is never
//     left waiting for a code that was never sent.
//   - Transient errors (429 rate-limit, 5xx, transport exception) fall back to
//     the platform relay so a momentary Resend hiccup does not lock out auth.
//
// The RESEND_API_KEY is read from the PocketBase process env ($os.getenv) and
// is NEVER logged, NEVER returned to the client, and NEVER sent anywhere except
// the Resend API Authorization header.
// ============================================================================

// ---------------------------------------------------------------------------
// Central fallback for every non-auth email (reminders, alerts, campaigns,
// support, referrals, brokerage, CRM, …). Auth emails never reach here
// because the onMailerRecord*Send hooks below intercept them and skip
// e.next() on success.
// ---------------------------------------------------------------------------
onMailerSend((e) => {
  const RESEND_ENDPOINT = "https://api.resend.com/emails";
  const NOTIFICATIONS_FROM = "notifications@estatefollow.com";
  const BRAND_NAME = "Estate Follow";

  const buildRecipients = (toField) => {
    const list = [];
    const push = (addr, name) => {
      if (!addr) return;
      list.push(name ? (name + " <" + addr + ">") : addr);
    };
    if (Array.isArray(toField)) {
      toField.forEach((r) => {
        if (!r) return;
        if (typeof r === "string") push(r, "");
        else push(r.address, r.name);
      });
    } else if (toField && typeof toField === "object") {
      push(toField.address, toField.name);
    } else if (typeof toField === "string") {
      push(toField, "");
    }
    return list;
  };

  const send = (fromAddress, fromName, toField, subject, html, text) => {
    const apiKey = $os.getenv("RESEND_API_KEY");
    if (!apiKey || String(apiKey).trim() === "") {
      return { ok: false, reason: "no-key", status: 0 };
    }
    const toList = buildRecipients(toField);
    if (!toList.length) {
      $app.logger().error("Resend send skipped: no recipients");
      return { ok: false, reason: "no-recipients", status: 0 };
    }
    const fromStr = fromName ? (fromName + " <" + fromAddress + ">") : fromAddress;
    const payload = { from: fromStr, to: toList, subject: subject || "" };
    if (html) payload.html = html;
    if (text) payload.text = text;
    try {
      const res = $http.send({
        url: RESEND_ENDPOINT,
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return { ok: true, status: res.statusCode };
      }
      $app.logger().error(
        "Resend API rejected the email",
        "status", res.statusCode,
        "body", String(res.body || "").slice(0, 500),
      );
      return { ok: false, reason: "http-" + res.statusCode, status: res.statusCode };
    } catch (err) {
      $app.logger().error("Resend send threw", "err", String(err));
      return { ok: false, reason: "exception", status: 0 };
    }
  };

  // Notification-email outcome. Always best-effort: log + fall back to the
  // platform relay on any failure so a notification glitch never breaks the
  // triggering action.
  const finishNotify = (result, label) => {
    if (result.ok) return; // delivered via Resend
    $app.logger().error(
      "Resend notification delivery failed — falling back to platform relay",
      "label", label, "reason", result.reason, "status", result.status || 0,
    );
    e.next();
  };

  const msg = e.message;
  const fromName = (msg.from && msg.from.name) ? msg.from.name : BRAND_NAME;
  const explicit = (msg.from && msg.from.address) ? msg.from.address : "";
  const fromAddress = explicit || NOTIFICATIONS_FROM;

  const result = send(fromAddress, fromName, msg.to, msg.subject, msg.html, msg.text);
  finishNotify(result, "onMailerSend");
});

// ---------------------------------------------------------------------------
// Auth emails → verify@estatefollow.com
// Each callback below is fully self-contained (constants + helpers inside).
// ---------------------------------------------------------------------------

onMailerRecordOTPSend((e) => {
  const RESEND_ENDPOINT = "https://api.resend.com/emails";
  const VERIFY_FROM = "verify@estatefollow.com";
  const BRAND_NAME = "Estate Follow";

  const buildRecipients = (toField) => {
    const list = [];
    const push = (addr, name) => {
      if (!addr) return;
      list.push(name ? (name + " <" + addr + ">") : addr);
    };
    if (Array.isArray(toField)) {
      toField.forEach((r) => {
        if (!r) return;
        if (typeof r === "string") push(r, "");
        else push(r.address, r.name);
      });
    } else if (toField && typeof toField === "object") {
      push(toField.address, toField.name);
    } else if (typeof toField === "string") {
      push(toField, "");
    }
    return list;
  };

  const send = (fromAddress, fromName, toField, subject, html, text) => {
    // RESEND_API_KEY is read from the PocketBase process env. The platform
    // injects it into the Express process (apps/api/.env) but not always into
    // the PocketBase process env — when it is absent here, this returns no-key
    // and the email falls back to the platform builder relay (generic sender,
    // recipients should check spam). To send from verify@estatefollow.com via
    // Resend, set RESEND_API_KEY in the PocketBase process env AND verify
    // estatefollow.com in Resend. (A $os.readFile fallback to apps/api/.env was
    // attempted but destabilised the PocketBase process, so it was removed.)
    const apiKey = $os.getenv("RESEND_API_KEY");
    if (!apiKey || String(apiKey).trim() === "") {
      $app.logger().warn("OTP email: RESEND_API_KEY not set in PocketBase env — falling back to platform relay");
      return { ok: false, reason: "no-key", status: 0 };
    }
    const toList = buildRecipients(toField);
    if (!toList.length) {
      $app.logger().error("OTP email: no recipients");
      return { ok: false, reason: "no-recipients", status: 0 };
    }
    const fromStr = fromName ? (fromName + " <" + fromAddress + ">") : fromAddress;
    const payload = { from: fromStr, to: toList, subject: subject || "" };
    if (html) payload.html = html;
    if (text) payload.text = text;
    try {
      const res = $http.send({
        url: RESEND_ENDPOINT,
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        $app.logger().info("OTP email sent via Resend", "to", toList.join(","), "status", res.statusCode);
        return { ok: true, status: res.statusCode };
      }
      $app.logger().error(
        "Resend API rejected the OTP email",
        "status", res.statusCode,
        "body", String(res.body || "").slice(0, 500),
      );
      return { ok: false, reason: "http-" + res.statusCode, status: res.statusCode };
    } catch (err) {
      $app.logger().error("Resend OTP send threw", "err", String(err));
      return { ok: false, reason: "exception", status: 0 };
    }
  };

  // Auth-email outcome. The user is waiting for a code.
  //   - Resend success      → done (do NOT call e.next()).
  //   - Resend not configured (no-key) → fall back to the platform relay.
  //   - Transient (429/5xx/exception/no-recipients) → fall back to the relay.
  //   - 4xx config error (domain not verified, bad key) → THROW so the request
  //     fails visibly and the frontend can tell the user the code was not sent.
  const finishAuth = (result, label) => {
    if (result.ok) return; // delivered via Resend
    const reason = result.reason;
    const status = result.status || 0;
    $app.logger().error(
      "Resend auth-email delivery failed",
      "label", label, "reason", reason, "status", status,
    );

    if (reason === "no-key") {
      // Resend not configured — use the platform builder relay so mail still
      // goes out (from a generic address; recipients should check spam).
      e.next();
      return;
    }
    if (reason === "no-recipients" || reason === "exception") {
      e.next();
      return;
    }
    // reason === "http-NNN"
    if (status === 429 || status >= 500) {
      // Transient — fall back to the platform relay.
      e.next();
      return;
    }
    // 4xx config error (domain not verified, bad key, invalid payload).
    // Surface it; do NOT silently fall back — that masks a broken Resend setup
    // and leaves users waiting for a code that was never sent.
    throw new ApiError(500, "Could not send the verification email. Please try again or contact support.");
  };

  const code = e.meta.password || "";
  const subject = "رمز التحقق — Estate Follow / Verification code";
  const html =
    '<div dir="rtl" style="font-family:IBM Plex Sans Arabic,Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">' +
    '<h2 style="margin:0 0 12px">إستيت فولو</h2>' +
    '<p style="font-size:16px;line-height:1.7">رمز التحقق الخاص بك هو:</p>' +
    '<p style="font-size:30px;font-weight:700;letter-spacing:6px;direction:ltr;text-align:center;margin:16px 0">' + code + '</p>' +
    '<p style="font-size:13px;color:#64748b">ينتهي خلال وقت قصير. لا تشاركه مع أحد.</p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
    '<p dir="ltr" style="font-size:15px;line-height:1.6">Your Estate Follow verification code is: <b style="font-size:20px;letter-spacing:3px">' + code + '</b></p>' +
    '<p dir="ltr" style="font-size:13px;color:#64748b">It expires shortly. Never share it with anyone.</p>' +
    '</div>';
  const text = "Your Estate Follow verification code: " + code;

  const result = send(VERIFY_FROM, BRAND_NAME, e.message.to, subject, html, text);
  finishAuth(result, "otp");
}, "users");

onMailerRecordVerificationSend((e) => {
  const RESEND_ENDPOINT = "https://api.resend.com/emails";
  const VERIFY_FROM = "verify@estatefollow.com";
  const BRAND_NAME = "Estate Follow";

  const buildRecipients = (toField) => {
    const list = [];
    const push = (addr, name) => {
      if (!addr) return;
      list.push(name ? (name + " <" + addr + ">") : addr);
    };
    if (Array.isArray(toField)) {
      toField.forEach((r) => {
        if (!r) return;
        if (typeof r === "string") push(r, "");
        else push(r.address, r.name);
      });
    } else if (toField && typeof toField === "object") {
      push(toField.address, toField.name);
    } else if (typeof toField === "string") {
      push(toField, "");
    }
    return list;
  };

  const send = (fromAddress, fromName, toField, subject, html, text) => {
    const apiKey = $os.getenv("RESEND_API_KEY");
    if (!apiKey || String(apiKey).trim() === "") {
      return { ok: false, reason: "no-key", status: 0 };
    }
    const toList = buildRecipients(toField);
    if (!toList.length) {
      $app.logger().error("Verification email: no recipients");
      return { ok: false, reason: "no-recipients", status: 0 };
    }
    const fromStr = fromName ? (fromName + " <" + fromAddress + ">") : fromAddress;
    const payload = { from: fromStr, to: toList, subject: subject || "" };
    if (html) payload.html = html;
    if (text) payload.text = text;
    try {
      const res = $http.send({
        url: RESEND_ENDPOINT,
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return { ok: true, status: res.statusCode };
      }
      $app.logger().error(
        "Resend API rejected the verification email",
        "status", res.statusCode,
        "body", String(res.body || "").slice(0, 500),
      );
      return { ok: false, reason: "http-" + res.statusCode, status: res.statusCode };
    } catch (err) {
      $app.logger().error("Resend verification send threw", "err", String(err));
      return { ok: false, reason: "exception", status: 0 };
    }
  };

  const finishAuth = (result, label) => {
    if (result.ok) return;
    const reason = result.reason;
    const status = result.status || 0;
    $app.logger().error("Resend auth-email delivery failed", "label", label, "reason", reason, "status", status);
    if (reason === "no-key" || reason === "no-recipients" || reason === "exception") {
      e.next();
      return;
    }
    if (status === 429 || status >= 500) {
      e.next();
      return;
    }
    throw new ApiError(500, "Could not send the verification email. Please try again or contact support.");
  };

  const appUrl = () => {
    try {
      return $app.settings().meta.appURL || "";
    } catch {
      return "";
    }
  };

  const base = appUrl();
  const link = base + "/_/#/auth/confirm-verification/" + e.meta.token;
  const subject = "تأكيد البريد الإلكتروني — Estate Follow / Confirm your email";
  const html =
    '<div dir="rtl" style="font-family:IBM Plex Sans Arabic,Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">' +
    '<h2 style="margin:0 0 12px">تأكيد البريد الإلكتروني</h2>' +
    '<p style="font-size:16px;line-height:1.7">اضغط على الرابط التالي لتأكيد بريدك الإلكتروني:</p>' +
    '<p><a href="' + link + '" style="color:#16a34a;word-break:break-all">' + link + '</a></p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
    '<p dir="ltr" style="font-size:15px;line-height:1.6">Confirm your email by clicking the link below:</p>' +
    '<p dir="ltr"><a href="' + link + '" style="color:#16a34a;word-break:break-all">' + link + '</a></p>' +
    '</div>';
  const text = "Confirm your Estate Follow email: " + link;

  const result = send(VERIFY_FROM, BRAND_NAME, e.message.to, subject, html, text);
  finishAuth(result, "verification");
}, "users");

onMailerRecordPasswordResetSend((e) => {
  const RESEND_ENDPOINT = "https://api.resend.com/emails";
  const VERIFY_FROM = "verify@estatefollow.com";
  const BRAND_NAME = "Estate Follow";

  const buildRecipients = (toField) => {
    const list = [];
    const push = (addr, name) => {
      if (!addr) return;
      list.push(name ? (name + " <" + addr + ">") : addr);
    };
    if (Array.isArray(toField)) {
      toField.forEach((r) => {
        if (!r) return;
        if (typeof r === "string") push(r, "");
        else push(r.address, r.name);
      });
    } else if (toField && typeof toField === "object") {
      push(toField.address, toField.name);
    } else if (typeof toField === "string") {
      push(toField, "");
    }
    return list;
  };

  const send = (fromAddress, fromName, toField, subject, html, text) => {
    const apiKey = $os.getenv("RESEND_API_KEY");
    if (!apiKey || String(apiKey).trim() === "") {
      return { ok: false, reason: "no-key", status: 0 };
    }
    const toList = buildRecipients(toField);
    if (!toList.length) {
      $app.logger().error("Password-reset email: no recipients");
      return { ok: false, reason: "no-recipients", status: 0 };
    }
    const fromStr = fromName ? (fromName + " <" + fromAddress + ">") : fromAddress;
    const payload = { from: fromStr, to: toList, subject: subject || "" };
    if (html) payload.html = html;
    if (text) payload.text = text;
    try {
      const res = $http.send({
        url: RESEND_ENDPOINT,
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return { ok: true, status: res.statusCode };
      }
      $app.logger().error(
        "Resend API rejected the password-reset email",
        "status", res.statusCode,
        "body", String(res.body || "").slice(0, 500),
      );
      return { ok: false, reason: "http-" + res.statusCode, status: res.statusCode };
    } catch (err) {
      $app.logger().error("Resend password-reset send threw", "err", String(err));
      return { ok: false, reason: "exception", status: 0 };
    }
  };

  const finishAuth = (result, label) => {
    if (result.ok) return;
    const reason = result.reason;
    const status = result.status || 0;
    $app.logger().error("Resend auth-email delivery failed", "label", label, "reason", reason, "status", status);
    if (reason === "no-key" || reason === "no-recipients" || reason === "exception") {
      e.next();
      return;
    }
    if (status === 429 || status >= 500) {
      e.next();
      return;
    }
    throw new ApiError(500, "Could not send the verification email. Please try again or contact support.");
  };

  const appUrl = () => {
    try {
      return $app.settings().meta.appURL || "";
    } catch {
      return "";
    }
  };

  const base = appUrl();
  const link = base + "/_/#/auth/confirm-password-reset/" + e.meta.token;
  const subject = "إعادة تعيين كلمة المرور — Estate Follow / Reset your password";
  const html =
    '<div dir="rtl" style="font-family:IBM Plex Sans Arabic,Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">' +
    '<h2 style="margin:0 0 12px">إعادة تعيين كلمة المرور</h2>' +
    '<p style="font-size:16px;line-height:1.7">اضغط على الرابط التالي لضبط كلمة مرور جديدة (صالح لمدة 30 دقيقة):</p>' +
    '<p><a href="' + link + '" style="color:#16a34a;word-break:break-all">' + link + '</a></p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
    '<p dir="ltr" style="font-size:15px;line-height:1.6">Click the link below to set a new password (valid for 30 minutes):</p>' +
    '<p dir="ltr"><a href="' + link + '" style="color:#16a34a;word-break:break-all">' + link + '</a></p>' +
    '</div>';
  const text = "Reset your Estate Follow password: " + link;

  const result = send(VERIFY_FROM, BRAND_NAME, e.message.to, subject, html, text);
  finishAuth(result, "password-reset");
}, "users");

onMailerRecordEmailChangeSend((e) => {
  const RESEND_ENDPOINT = "https://api.resend.com/emails";
  const VERIFY_FROM = "verify@estatefollow.com";
  const BRAND_NAME = "Estate Follow";

  const buildRecipients = (toField) => {
    const list = [];
    const push = (addr, name) => {
      if (!addr) return;
      list.push(name ? (name + " <" + addr + ">") : addr);
    };
    if (Array.isArray(toField)) {
      toField.forEach((r) => {
        if (!r) return;
        if (typeof r === "string") push(r, "");
        else push(r.address, r.name);
      });
    } else if (toField && typeof toField === "object") {
      push(toField.address, toField.name);
    } else if (typeof toField === "string") {
      push(toField, "");
    }
    return list;
  };

  const send = (fromAddress, fromName, toField, subject, html, text) => {
    const apiKey = $os.getenv("RESEND_API_KEY");
    if (!apiKey || String(apiKey).trim() === "") {
      return { ok: false, reason: "no-key", status: 0 };
    }
    const toList = buildRecipients(toField);
    if (!toList.length) {
      $app.logger().error("Email-change email: no recipients");
      return { ok: false, reason: "no-recipients", status: 0 };
    }
    const fromStr = fromName ? (fromName + " <" + fromAddress + ">") : fromAddress;
    const payload = { from: fromStr, to: toList, subject: subject || "" };
    if (html) payload.html = html;
    if (text) payload.text = text;
    try {
      const res = $http.send({
        url: RESEND_ENDPOINT,
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return { ok: true, status: res.statusCode };
      }
      $app.logger().error(
        "Resend API rejected the email-change email",
        "status", res.statusCode,
        "body", String(res.body || "").slice(0, 500),
      );
      return { ok: false, reason: "http-" + res.statusCode, status: res.statusCode };
    } catch (err) {
      $app.logger().error("Resend email-change send threw", "err", String(err));
      return { ok: false, reason: "exception", status: 0 };
    }
  };

  const finishAuth = (result, label) => {
    if (result.ok) return;
    const reason = result.reason;
    const status = result.status || 0;
    $app.logger().error("Resend auth-email delivery failed", "label", label, "reason", reason, "status", status);
    if (reason === "no-key" || reason === "no-recipients" || reason === "exception") {
      e.next();
      return;
    }
    if (status === 429 || status >= 500) {
      e.next();
      return;
    }
    throw new ApiError(500, "Could not send the verification email. Please try again or contact support.");
  };

  const appUrl = () => {
    try {
      return $app.settings().meta.appURL || "";
    } catch {
      return "";
    }
  };

  const base = appUrl();
  const link = base + "/_/#/auth/confirm-email-change/" + e.meta.token;
  const newEmail = e.meta.newEmail || "";
  const subject = "تأكيد البريد الجديد — Estate Follow / Confirm new email";
  const html =
    '<div dir="rtl" style="font-family:IBM Plex Sans Arabic,Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">' +
    '<h2 style="margin:0 0 12px">تأكيد البريد الإلكتروني الجديد</h2>' +
    '<p style="font-size:16px;line-height:1.7">تم طلب تغيير بريدك إلى <b>' + newEmail + '</b>. اضغط على الرابط للتأكيد:</p>' +
    '<p><a href="' + link + '" style="color:#16a34a;word-break:break-all">' + link + '</a></p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
    '<p dir="ltr" style="font-size:15px;line-height:1.6">A change to <b>' + newEmail + '</b> was requested. Click to confirm:</p>' +
    '<p dir="ltr"><a href="' + link + '" style="color:#16a34a;word-break:break-all">' + link + '</a></p>' +
    '</div>';
  const text = "Confirm your new Estate Follow email (" + newEmail + "): " + link;

  const result = send(VERIFY_FROM, BRAND_NAME, e.message.to, subject, html, text);
  finishAuth(result, "email-change");
}, "users");

onMailerRecordAuthAlertSend((e) => {
  const RESEND_ENDPOINT = "https://api.resend.com/emails";
  const VERIFY_FROM = "verify@estatefollow.com";
  const BRAND_NAME = "Estate Follow";

  const buildRecipients = (toField) => {
    const list = [];
    const push = (addr, name) => {
      if (!addr) return;
      list.push(name ? (name + " <" + addr + ">") : addr);
    };
    if (Array.isArray(toField)) {
      toField.forEach((r) => {
        if (!r) return;
        if (typeof r === "string") push(r, "");
        else push(r.address, r.name);
      });
    } else if (toField && typeof toField === "object") {
      push(toField.address, toField.name);
    } else if (typeof toField === "string") {
      push(toField, "");
    }
    return list;
  };

  const send = (fromAddress, fromName, toField, subject, html, text) => {
    const apiKey = $os.getenv("RESEND_API_KEY");
    if (!apiKey || String(apiKey).trim() === "") {
      return { ok: false, reason: "no-key", status: 0 };
    }
    const toList = buildRecipients(toField);
    if (!toList.length) {
      $app.logger().error("Auth-alert email: no recipients");
      return { ok: false, reason: "no-recipients", status: 0 };
    }
    const fromStr = fromName ? (fromName + " <" + fromAddress + ">") : fromAddress;
    const payload = { from: fromStr, to: toList, subject: subject || "" };
    if (html) payload.html = html;
    if (text) payload.text = text;
    try {
      const res = $http.send({
        url: RESEND_ENDPOINT,
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return { ok: true, status: res.statusCode };
      }
      $app.logger().error(
        "Resend API rejected the auth-alert email",
        "status", res.statusCode,
        "body", String(res.body || "").slice(0, 500),
      );
      return { ok: false, reason: "http-" + res.statusCode, status: res.statusCode };
    } catch (err) {
      $app.logger().error("Resend auth-alert send threw", "err", String(err));
      return { ok: false, reason: "exception", status: 0 };
    }
  };

  const finishAuth = (result, label) => {
    if (result.ok) return;
    const reason = result.reason;
    const status = result.status || 0;
    $app.logger().error("Resend auth-email delivery failed", "label", label, "reason", reason, "status", status);
    if (reason === "no-key" || reason === "no-recipients" || reason === "exception") {
      e.next();
      return;
    }
    if (status === 429 || status >= 500) {
      e.next();
      return;
    }
    throw new ApiError(500, "Could not send the verification email. Please try again or contact support.");
  };

  const info = e.meta.info || "";
  const subject = "تنبيه تسجيل دخول جديد — Estate Follow / New sign-in alert";
  const html =
    '<div dir="rtl" style="font-family:IBM Plex Sans Arabic,Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">' +
    '<h2 style="margin:0 0 12px">تنبيه تسجيل دخول جديد</h2>' +
    '<p style="font-size:16px;line-height:1.7">تم تسجيل الدخول إلى حسابك من جهاز جديد:</p>' +
    '<p style="font-size:14px;color:#475569;direction:ltr;text-align:left">' + info + '</p>' +
    '<p style="font-size:13px;color:#64748b">إذا كان هذا أنت، تجاهل هذه الرسالة. وإلا، غيّر كلمة المرور فورًا.</p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
    '<p dir="ltr" style="font-size:15px;line-height:1.6">A new sign-in to your account was detected:</p>' +
    '<p dir="ltr" style="font-size:14px;color:#475569">' + info + '</p>' +
    '<p dir="ltr" style="font-size:13px;color:#64748b">If this was you, ignore this message. Otherwise, change your password immediately.</p>' +
    '</div>';
  const text = "New Estate Follow sign-in alert: " + info;

  const result = send(VERIFY_FROM, BRAND_NAME, e.message.to, subject, html, text);
  finishAuth(result, "auth-alert");
}, "users");
