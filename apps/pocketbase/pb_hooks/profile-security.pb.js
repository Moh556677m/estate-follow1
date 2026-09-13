/// <reference path="../pb_data/types.d.ts" />

// Owner profile security — change email and change phone with OTP verification.
//
// Design goals (from the product spec):
//  - Never delete the existing profile while editing.
//  - Never create a new user account when email/phone changes.
//  - Keep the same permanent User ID.
//  - Preserve properties, payments, documents, subscriptions and all owner data.
//  - Do NOT log the user out during the process.
//  - Do not update email or phone before verification is complete.
//
// Change email flow (dual OTP):
//   1. request-email-change  -> sends code1 to the CURRENT email, stores newEmail
//   2. verify-old-email      -> verifies code1, then sends code2 to the NEW email
//   3. confirm-email-change  -> verifies code2, updates the email on the same record
//
// Change phone flow (single OTP to the registered email):
//   1. request-phone-change  -> sends code to the owner's registered email
//   2. confirm-phone-change  -> verifies code, updates the phone on the same record
//
// Each callback is self-contained (PB JSVM isolated scope).

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function normalizeEmail(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function readEmail(rec) {
  if (!rec) return '';
  try {
    const s = rec.getString('email');
    if (s) return normalizeEmail(s);
  } catch (_) {}
  try {
    const g = rec.get('email');
    if (g) return normalizeEmail(g);
  } catch (_) {}
  return '';
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sendOtpEmail(to, code, title, introLine) {
  const html =
    "<div style='font-family:sans-serif;max-width:560px;margin:auto'>" +
    "<h2 style='color:#22C55E'>" + title + "</h2>" +
    "<p>" + introLine + "</p>" +
    "<p style='font-size:28px;letter-spacing:6px;font-weight:700'>" + code + "</p>" +
    "<p style='color:#666;font-size:13px'>Expires in 10 minutes / ينتهي خلال 10 دقائق</p>" +
    "<p style='color:#888;font-size:12px'>Estate Follow — إستيت فولو</p></div>";
  $app.newMailClient().send(
    new MailerMessage({
      from: { name: 'Estate Follow' },
      to: [{ address: to }],
      subject: title,
      html: html,
    }),
  );
}

function logActivity(userId, action, details) {
  try {
    const col = $app.findCollectionByNameOrId('activity_logs');
    const rec = new Record(col);
    rec.set('user', userId);
    rec.set('action', action);
    rec.set('entity', 'users');
    rec.set('entity_id', userId);
    rec.set('details', details);
    $app.save(rec);
  } catch (err) {
    $app.logger().error('profile activity log failed', 'err', String(err));
  }
}

// ---------------------------------------------------------------------------
// CHANGE EMAIL — step 1: send OTP to the current email
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/profile/request-email-change',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) {
      throw new UnauthorizedError('Authentication required.');
    }

    let rec = null;
    try {
      rec = $app.findRecordById('users', auth.id);
    } catch (_) {}
    if (!rec) throw new BadRequestError('Account not found.');

    const body = e.requestInfo().body || {};
    const newEmail = normalizeEmail(body.newEmail || '');
    const currentEmail = readEmail(rec);

    if (!newEmail || !newEmail.includes('@') || newEmail.length < 5) {
      throw new BadRequestError('Enter a valid new email.');
    }
    if (newEmail === currentEmail) {
      throw new BadRequestError('That is already your email.');
    }

    // Reject if the new email is already used by another account.
    try {
      const existing = $app.findAuthRecordByEmail('users', newEmail);
      if (existing && String(existing.id) !== String(rec.id)) {
        throw new BadRequestError('That email is already registered to another account.');
      }
    } catch (err) {
      if (String(err).indexOf('already registered') >= 0) throw err;
      // "no rows" => email is free, continue.
    }

    // Invalidate any previous pending email-change challenges for this user.
    try {
      const old = $app.findRecordsByFilter(
        'security_challenges',
        'user = {:uid} && purpose = {:p} && completed = false',
        '-created',
        50,
        0,
        { uid: rec.id, p: 'email_change' },
      );
      old.forEach((r) => {
        try { $app.delete(r); } catch (_) {}
      });
    } catch (_) {}

    const code1 = genCode();
    const col = $app.findCollectionByNameOrId('security_challenges');
    const ch = new Record(col);
    ch.set('user', rec.id);
    ch.set('purpose', 'email_change');
    ch.set('code1', code1);
    ch.set('code2', '');
    ch.set('code1_verified', false);
    ch.set('code2_verified', false);
    ch.set('completed', false);
    const expiresMs = Date.now() + OTP_TTL_MS;
    ch.set('expires_at', new Date(expiresMs).toISOString());
    try { ch.set('expires_ms', expiresMs); } catch (_) {}
    ch.set('payload', { newEmail: newEmail, currentEmail: currentEmail });
    $app.save(ch);

    try {
      sendOtpEmail(
        currentEmail,
        code1,
        'Confirm your current email / تأكيد بريدك الحالي — إستيت فولو',
        'Enter this code to confirm you own your current email address. / أدخل هذا الرمز لتأكيد ملكيتك لبريدك الحالي.',
      );
    } catch (err) {
      $app.logger().error('email-change otp1 failed', 'err', String(err));
      throw new BadRequestError('Could not send verification email.');
    }

    return e.json(200, {
      challengeId: ch.id,
      currentEmailMasked: currentEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
    });
  },
  $apis.requireAuth('users'),
);

// ---------------------------------------------------------------------------
// CHANGE EMAIL — step 2: verify the old-email code, then send OTP to new email
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/profile/verify-old-email',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) {
      throw new UnauthorizedError('Authentication required.');
    }

    const body = e.requestInfo().body || {};
    const challengeId = String(body.challengeId || '').trim();
    const code1 = String(body.code1 || '').trim();

    if (!challengeId || !code1) {
      throw new BadRequestError('Verification code is required.');
    }

    let ch = null;
    try {
      ch = $app.findRecordById('security_challenges', challengeId);
    } catch (_) {
      throw new BadRequestError('Your request expired. Please start again.');
    }

    if (String(ch.get('user')) !== String(auth.id)) {
      throw new ForbiddenError('Invalid challenge.');
    }
    if (ch.getString('purpose') !== 'email_change') {
      throw new BadRequestError('Invalid challenge.');
    }
    if (ch.getBool('completed')) {
      throw new BadRequestError('Your request expired. Please start again.');
    }

    // Expiry check (prefer numeric ms).
    let expMs = 0;
    try { expMs = Number(ch.get('expires_ms') || 0); } catch (_) {}
    if (!expMs || Number.isNaN(expMs)) {
      try {
        const expVal = ch.get('expires_at');
        if (expVal && typeof expVal.unix === 'function') {
          expMs = expVal.unix() * 1000 + OTP_TTL_MS;
        } else {
          expMs = new Date(String(expVal)).getTime() + OTP_TTL_MS;
        }
      } catch (_) { expMs = 0; }
    }
    if (!expMs || Number.isNaN(expMs) || expMs < Date.now()) {
      try { ch.set('completed', true); $app.save(ch); } catch (_) {}
      throw new BadRequestError('Your request expired. Please start again.');
    }

    if (ch.getBool('code1_verified')) {
      // Already verified — resend code2 if needed by caller; just acknowledge.
      return e.json(200, { ok: true, alreadyVerified: true });
    }

    const stored1 = String(ch.getString('code1') || '').trim();
    if (stored1 !== code1) {
      throw new BadRequestError('The code for your current email is incorrect.');
    }

    // Old email verified — now send code2 to the NEW email.
    let newEmail = '';
    try {
      const raw = ch.get('payload');
      let obj = null;
      if (raw == null || raw === '') obj = null;
      else if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch (_) { obj = null; }
      } else {
        try { obj = JSON.parse(JSON.stringify(raw)); } catch (_) { obj = raw; }
      }
      newEmail = normalizeEmail((obj && (obj.newEmail || obj['newEmail'])) || '');
    } catch (_) {}
    if (!newEmail.includes('@')) {
      throw new BadRequestError('Invalid request. Please start again.');
    }

    const code2 = genCode();
    ch.set('code1_verified', true);
    ch.set('code2', code2);
    $app.save(ch);

    try {
      sendOtpEmail(
        newEmail,
        code2,
        'Confirm your new email / تأكيد بريدك الجديد — إستيت فولو',
        'Enter this code to confirm your new email address. / أدخل هذا الرمز لتأكيد بريدك الجديد.',
      );
    } catch (err) {
      $app.logger().error('email-change otp2 failed', 'err', String(err));
      throw new BadRequestError('Could not send verification email to the new address.');
    }

    return e.json(200, {
      ok: true,
      newEmailMasked: newEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
    });
  },
  $apis.requireAuth('users'),
);

// ---------------------------------------------------------------------------
// CHANGE EMAIL — step 3: verify the new-email code and update the email
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/profile/confirm-email-change',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) {
      throw new UnauthorizedError('Authentication required.');
    }

    const body = e.requestInfo().body || {};
    const challengeId = String(body.challengeId || '').trim();
    const code2 = String(body.code2 || '').trim();

    if (!challengeId || !code2) {
      throw new BadRequestError('Verification code is required.');
    }

    let ch = null;
    try {
      ch = $app.findRecordById('security_challenges', challengeId);
    } catch (_) {
      throw new BadRequestError('Your request expired. Please start again.');
    }

    if (String(ch.get('user')) !== String(auth.id)) {
      throw new ForbiddenError('Invalid challenge.');
    }
    if (ch.getString('purpose') !== 'email_change') {
      throw new BadRequestError('Invalid challenge.');
    }
    if (ch.getBool('completed')) {
      throw new BadRequestError('Your request expired. Please start again.');
    }

    // Expiry check.
    let expMs = 0;
    try { expMs = Number(ch.get('expires_ms') || 0); } catch (_) {}
    if (!expMs || Number.isNaN(expMs)) {
      try {
        const expVal = ch.get('expires_at');
        if (expVal && typeof expVal.unix === 'function') {
          expMs = expVal.unix() * 1000 + OTP_TTL_MS;
        } else {
          expMs = new Date(String(expVal)).getTime() + OTP_TTL_MS;
        }
      } catch (_) { expMs = 0; }
    }
    if (!expMs || Number.isNaN(expMs) || expMs < Date.now()) {
      try { ch.set('completed', true); $app.save(ch); } catch (_) {}
      throw new BadRequestError('Your request expired. Please start again.');
    }

    if (!ch.getBool('code1_verified')) {
      throw new BadRequestError('Please verify your current email first.');
    }

    const stored2 = String(ch.getString('code2') || '').trim();
    if (stored2 !== code2) {
      throw new BadRequestError('The code for your new email is incorrect.');
    }

    // Read new email from payload.
    let newEmail = '';
    try {
      const raw = ch.get('payload');
      let obj = null;
      if (raw == null || raw === '') obj = null;
      else if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch (_) { obj = null; }
      } else {
        try { obj = JSON.parse(JSON.stringify(raw)); } catch (_) { obj = raw; }
      }
      newEmail = normalizeEmail((obj && (obj.newEmail || obj['newEmail'])) || '');
    } catch (_) {}
    if (!newEmail.includes('@')) {
      throw new BadRequestError('Invalid request. Please start again.');
    }

    // Final uniqueness check (race safety).
    try {
      const existing = $app.findAuthRecordByEmail('users', newEmail);
      if (existing && String(existing.id) !== String(auth.id)) {
        throw new BadRequestError('That email is already registered to another account.');
      }
    } catch (err) {
      if (String(err).indexOf('already registered') >= 0) throw err;
    }

    // Update the email on the SAME record — never delete, never recreate.
    let target = null;
    try { target = $app.findRecordById('users', auth.id); } catch (_) {}
    if (!target) throw new BadRequestError('Account not found.');

    const prevEmail = readEmail(target);
    try { target.setEmail(newEmail); } catch (_) { target.set('email', newEmail); }
    try { target.set('verified', true); } catch (_) {}
    $app.save(target);

    // Invalidate the challenge.
    try {
      ch.set('code2_verified', true);
      ch.set('completed', true);
      ch.set('payload', { done: true });
      $app.save(ch);
    } catch (_) {}

    logActivity(
      target.id,
      'profile_email_changed',
      'Email changed from ' + prevEmail + ' to ' + newEmail,
    );

    return e.json(200, { ok: true, newEmail: newEmail });
  },
  $apis.requireAuth('users'),
);

// ---------------------------------------------------------------------------
// CHANGE PHONE — step 1: send OTP to the owner's registered email
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/profile/request-phone-change',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) {
      throw new UnauthorizedError('Authentication required.');
    }

    let rec = null;
    try { rec = $app.findRecordById('users', auth.id); } catch (_) {}
    if (!rec) throw new BadRequestError('Account not found.');

    const body = e.requestInfo().body || {};
    const newPhone = String(body.newPhone || '').trim();
    const currentPhone = String(rec.getString('phone') || rec.get('phone') || '').trim();

    if (!newPhone) {
      throw new BadRequestError('Enter a new phone number.');
    }
    if (newPhone === currentPhone) {
      throw new BadRequestError('That is already your phone number.');
    }

    const email = readEmail(rec);
    if (!email.includes('@')) {
      throw new BadRequestError('Your account has no verified email to send the code to.');
    }

    // Invalidate previous pending phone-change challenges.
    try {
      const old = $app.findRecordsByFilter(
        'security_challenges',
        'user = {:uid} && purpose = {:p} && completed = false',
        '-created',
        50,
        0,
        { uid: rec.id, p: 'phone_change' },
      );
      old.forEach((r) => { try { $app.delete(r); } catch (_) {} });
    } catch (_) {}

    const code1 = genCode();
    const col = $app.findCollectionByNameOrId('security_challenges');
    const ch = new Record(col);
    ch.set('user', rec.id);
    ch.set('purpose', 'phone_change');
    ch.set('code1', code1);
    ch.set('code2', '');
    ch.set('code1_verified', false);
    ch.set('code2_verified', false);
    ch.set('completed', false);
    const expiresMs = Date.now() + OTP_TTL_MS;
    ch.set('expires_at', new Date(expiresMs).toISOString());
    try { ch.set('expires_ms', expiresMs); } catch (_) {}
    ch.set('payload', { newPhone: newPhone });
    $app.save(ch);

    try {
      sendOtpEmail(
        email,
        code1,
        'Confirm your new phone number / تأكيد رقم هاتفك الجديد — إستيت فولو',
        'Enter this code to confirm your new phone number. / أدخل هذا الرمز لتأكيد رقم هاتفك الجديد.',
      );
    } catch (err) {
      $app.logger().error('phone-change otp failed', 'err', String(err));
      throw new BadRequestError('Could not send verification email.');
    }

    return e.json(200, {
      challengeId: ch.id,
      emailMasked: email.replace(/(.{2}).+(@.+)/, '$1***$2'),
    });
  },
  $apis.requireAuth('users'),
);

// ---------------------------------------------------------------------------
// CHANGE PHONE — step 2: verify the code and update the phone
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/profile/confirm-phone-change',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) {
      throw new UnauthorizedError('Authentication required.');
    }

    const body = e.requestInfo().body || {};
    const challengeId = String(body.challengeId || '').trim();
    const code1 = String(body.code1 || '').trim();

    if (!challengeId || !code1) {
      throw new BadRequestError('Verification code is required.');
    }

    let ch = null;
    try { ch = $app.findRecordById('security_challenges', challengeId); } catch (_) {
      throw new BadRequestError('Your request expired. Please start again.');
    }

    if (String(ch.get('user')) !== String(auth.id)) {
      throw new ForbiddenError('Invalid challenge.');
    }
    if (ch.getString('purpose') !== 'phone_change') {
      throw new BadRequestError('Invalid challenge.');
    }
    if (ch.getBool('completed')) {
      throw new BadRequestError('Your request expired. Please start again.');
    }

    // Expiry check.
    let expMs = 0;
    try { expMs = Number(ch.get('expires_ms') || 0); } catch (_) {}
    if (!expMs || Number.isNaN(expMs)) {
      try {
        const expVal = ch.get('expires_at');
        if (expVal && typeof expVal.unix === 'function') {
          expMs = expVal.unix() * 1000 + OTP_TTL_MS;
        } else {
          expMs = new Date(String(expVal)).getTime() + OTP_TTL_MS;
        }
      } catch (_) { expMs = 0; }
    }
    if (!expMs || Number.isNaN(expMs) || expMs < Date.now()) {
      try { ch.set('completed', true); $app.save(ch); } catch (_) {}
      throw new BadRequestError('Your request expired. Please start again.');
    }

    const stored1 = String(ch.getString('code1') || '').trim();
    if (stored1 !== code1) {
      throw new BadRequestError('The verification code is incorrect.');
    }

    // Read new phone from payload.
    let newPhone = '';
    try {
      const raw = ch.get('payload');
      let obj = null;
      if (raw == null || raw === '') obj = null;
      else if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch (_) { obj = null; }
      } else {
        try { obj = JSON.parse(JSON.stringify(raw)); } catch (_) { obj = raw; }
      }
      newPhone = String((obj && (obj.newPhone || obj['newPhone'])) || '').trim();
    } catch (_) {}
    if (!newPhone) {
      throw new BadRequestError('Invalid request. Please start again.');
    }

    // Update the phone on the SAME record.
    let target = null;
    try { target = $app.findRecordById('users', auth.id); } catch (_) {}
    if (!target) throw new BadRequestError('Account not found.');

    const prevPhone = String(target.getString('phone') || target.get('phone') || '');
    target.set('phone', newPhone);
    $app.save(target);

    try {
      ch.set('code1_verified', true);
      ch.set('completed', true);
      ch.set('payload', { done: true });
      $app.save(ch);
    } catch (_) {}

    logActivity(
      target.id,
      'profile_phone_changed',
      'Phone changed from ' + prevPhone + ' to ' + newPhone,
    );

    return e.json(200, { ok: true, newPhone: newPhone });
  },
  $apis.requireAuth('users'),
);
