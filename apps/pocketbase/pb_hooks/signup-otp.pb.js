/// <reference path="../pb_data/types.d.ts" />

// OTP flow for the users collection.
//
// Two modes share PocketBase's single /request-otp endpoint; the frontend
// passes `mode` in the request body to disambiguate:
//
//  - "signup" (default): if no user exists for the email yet, create a
//    placeholder record (random password, role=owner, pending_signup=true)
//    so PocketBase can email the code. If a real, completed account already
//    exists, reject so the email cannot be taken over via OTP. A still-pending
//    signup may re-request a code.
//
//  - "reset": password reset. Only real, completed accounts may receive a
//    code. Placeholder/pending accounts and unknown emails are rejected so the
//    user is told the email is not registered.
onRecordRequestOTPRequest((e) => {
  // ---------------------------------------------------------------------
  // Preflight: verify SOME mail channel is actually usable before we let
  // PocketBase touch the database or attempt to send anything.
  //
  // WHY THIS IS NEEDED (found by live-testing this exact endpoint):
  // PocketBase's own built-in OTP-request handler swallows mailer errors —
  // if every delivery attempt (Resend, then the platform relay in
  // builder-mailer.pb.js) fails, PocketBase logs "Failed to send OTP email",
  // silently deletes the _otps record it had just created, and STILL
  // returns HTTP 200 with an otpId to the caller. The frontend then shows
  // the "enter your code" screen for a code that was never sent and whose
  // otpId no longer even exists — this is the exact "OTP never arrives,
  // no error anywhere" bug. Throwing from inside onMailerRecordOTPSend
  // does not help either, because that exception is caught by the same
  // core swallow-and-200 logic.
  //
  // The only hook that runs BEFORE that core logic — and whose thrown
  // errors reliably reach the HTTP client — is this one
  // (onRecordRequestOTPRequest). So we check upfront whether either mail
  // path is configured and fail loudly here instead of letting the
  // request silently succeed with no email ever sent.
  try {
    var resendKey = $os.getenv("RESEND_API_KEY");
    var hasResend = !!(resendKey && String(resendKey).trim() !== "");
    var relayUrl = $os.getenv("BUILDER_MAILER_API_URL");
    var relayKey = $os.getenv("BUILDER_MAILER_API_KEY");
    var smtpOn = false;
    try { smtpOn = !!($app.settings().smtp && $app.settings().smtp.enabled); } catch (_) { smtpOn = false; }
    var hasRelay = smtpOn || !!((relayUrl && String(relayUrl).trim() !== "") && (relayKey && String(relayKey).trim() !== ""));
    if (!hasResend && !hasRelay) {
      $app.logger().error(
        "request-otp blocked: no mail channel configured (RESEND_API_KEY and BUILDER_MAILER_API_URL/KEY are both unset, SMTP disabled)",
      );
      throw new BadRequestError(
        "Verification email service is not configured. Please contact support.",
      );
    }
  } catch (preflightErr) {
    // Re-throw ApiError/BadRequestError as-is; anything unexpected from the
    // env checks themselves must never block a properly configured signup.
    if (preflightErr && preflightErr.status) throw preflightErr;
  }

  const body = e.requestInfo().body || {};
  const mode = body["mode"] || "signup";
  const email = body["email"] || "";

  // --- Password reset mode ---
  if (mode === "reset") {
    if (!e.record) {
      throw new BadRequestError("No account found with this email.");
    }
    if (e.record.getBool("pending_signup")) {
      // Placeholder from an incomplete signup — never a usable account.
      throw new BadRequestError("No account found with this email.");
    }
    return e.next();
  }

  // --- Signup mode (default) ---
  if (!e.record) {
    const record = new Record(e.collection);
    record.setEmail(email);
    record.setPassword($security.randomString(30));
    record.set("role", "owner");
    record.set("pending_signup", true);
    // Mark verified so the link-based verification email hook (which fires on
    // every record create) skips this placeholder — the OTP code is the proof
    // of email ownership for the signup flow.
    record.set("verified", true);
    e.app.save(record);
    e.record = record;
    return e.next();
  }

  if (e.record.getBool("pending_signup")) {
    return e.next();
  }

  throw new BadRequestError("This email is already registered.");
}, "users");
