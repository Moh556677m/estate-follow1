// Centralized EmailService (task #7 requirement) for PocketBase pb_hooks.
//
// Every simple, single-recipient transactional email (security alerts,
// support notifications, referral emails, etc.) should build its message
// through this ONE shared helper instead of hand-rolling a `new
// MailerMessage({...})` + `$app.newMailClient().send(...)` call — so the
// sender identity, address handling and error logging only have to be
// correct in one place.
//
// IMPORTANT — this does NOT change delivery/routing behavior. Every message
// still passes through the single `onMailerSend` interceptor registered in
// `0-resend-mailer.pb.js` (Resend primary, legacy relay fallback only on
// failure) — confirmed by the system-wide duplicate-execution audit to be
// the one real send funnel already in place (no message is ever delivered
// twice). This module only centralizes message CONSTRUCTION, not delivery.
//
// PocketBase JSVM local modules ARE plain CommonJS and DO have access to the
// same bound globals ($app, MailerMessage) as any pb_hooks file — verified
// empirically. Usage from any pb_hooks file:
//
//   const { sendMail } = require(`${__hooks}/lib-email.js`);
//   sendMail({ to: user.get("email"), subject: "...", html: "..." });
//
// Marketing CAMPAIGN batch-sending (marketing.pb.js) is intentionally NOT
// migrated to this helper — it has its own per-recipient success/failure
// counters and campaign-status bookkeeping that a mechanical swap would put
// at real risk for zero behavior change, and it is being rebuilt properly
// as part of the Admin Marketing/Resend overhaul (a later, dedicated task)
// rather than touched twice.

/**
 * Send a simple transactional email.
 *
 * @param {object} opts
 * @param {string|string[]} opts.to - recipient address, or a list of them
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.fromName] - defaults to "Estate Follow"
 * @param {string} [opts.replyTo] - optional Reply-To address
 * @param {string} [opts.logContext] - short label used in error logs, e.g. "referral-invite"
 * @returns {boolean} true if the send call completed without throwing
 */
function sendMail(opts) {
  opts = opts || {};
  try {
    const rawTo = Array.isArray(opts.to) ? opts.to : [opts.to];
    const recipients = rawTo
      .filter(Boolean)
      .map((address) => ({ address: String(address) }));
    if (recipients.length === 0) {
      $app.logger().warn("centralized email send skipped: no recipient", "context", opts.logContext || "");
      return false;
    }

    const fields = {
      from: { name: opts.fromName || "Estate Follow" },
      to: recipients,
      subject: opts.subject || "",
      html: opts.html || "",
    };
    if (opts.replyTo) {
      fields.replyTo = { address: String(opts.replyTo) };
    }

    $app.newMailClient().send(new MailerMessage(fields));
    return true;
  } catch (e) {
    $app.logger().error("centralized email send failed", "context", opts.logContext || "", "err", String(e));
    return false;
  }
}

module.exports = { sendMail };
