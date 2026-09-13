/// <reference path="../pb_data/types.d.ts" />

// Dual-OTP Super Admin security. Each handler is self-contained (PB JSVM scope).

routerAdd(
  'POST',
  '/ef/security/request-password-change',
  (e) => {
    const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';
    const DEFAULT_RECOVERY = 'ceo@madproperties.ae';

    const normalizeEmail = (value) =>
      String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');

    const readEmail = (rec) => {
      if (!rec) return '';
      try {
        const s = rec.getString('email');
        if (s) return normalizeEmail(s);
      } catch (_) {}
      try {
        const g = rec.get('email');
        if (g) return normalizeEmail(g);
      } catch (_) {}
      try {
        if (typeof rec.email === 'function') return normalizeEmail(rec.email());
        if (typeof rec.email === 'string') return normalizeEmail(rec.email);
      } catch (_) {}
      return '';
    };

    // Resolve the permanent Super Admin by auth id + DB email (never trust
    // a raw auth.email property which may be a method in the JSVM).
    const resolveMainSuperAdmin = (authRecord) => {
      if (!authRecord || !authRecord.id) {
        throw new ForbiddenError('Only the Super Admin can perform this action.');
      }
      let fresh = null;
      try {
        fresh = $app.findRecordById('users', authRecord.id);
      } catch (_) {
        fresh = authRecord;
      }

      let main = null;
      try {
        main = $app.findAuthRecordByEmail('users', SUPER_ADMIN_EMAIL);
      } catch (_) {
        main = null;
      }

      const email = readEmail(fresh) || readEmail(authRecord);
      const idMatch = main && String(main.id) === String(authRecord.id);
      const emailMatch = email === SUPER_ADMIN_EMAIL;
      let flag = false;
      try {
        flag = !!(fresh && fresh.getBool('is_super_admin'));
      } catch (_) {
        try {
          flag = !!authRecord.getBool('is_super_admin');
        } catch (__) {
          flag = false;
        }
      }

      if (idMatch || emailMatch || (flag && (!main || idMatch))) {
        const rec = idMatch ? main : fresh || authRecord;
        // Heal permanent flags if missing.
        try {
          if (!rec.getBool('is_super_admin')) {
            rec.set('is_super_admin', true);
            rec.set('role', 'admin');
            rec.set('suspended', false);
            $app.save(rec);
          }
        } catch (_) {}
        return rec;
      }

      throw new ForbiddenError('Only admin@estatefollow.com can perform this action.');
    };

    const auth = resolveMainSuperAdmin(e.auth);

    const info = e.requestInfo();
    const body = info.body || {};
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    const device = String(body.device || '').slice(0, 200);

    if (newPassword.length < 10) {
      throw new BadRequestError('Password must be at least 10 characters.');
    }
    if (!currentPassword) {
      throw new BadRequestError('Current password is required.');
    }
    if (!auth.validatePassword(currentPassword)) {
      throw new BadRequestError('Current password is incorrect.');
    }

    let recovery = DEFAULT_RECOVERY;
    try {
      const rows = $app.findAllRecords('platform_settings');
      if (rows.length && rows[0].getString('security_recovery_email')) {
        recovery = normalizeEmail(rows[0].getString('security_recovery_email'));
      }
    } catch (_) {}

    try {
      const old = $app.findRecordsByFilter(
        'security_challenges',
        'user = {:uid} && purpose = {:p} && completed = false',
        '-created',
        50,
        0,
        { uid: auth.id, p: 'password_change' },
      );
      old.forEach((r) => {
        try {
          $app.delete(r);
        } catch (_) {}
      });
    } catch (_) {}

    const code1 = String(Math.floor(100000 + Math.random() * 900000));
    const code2 = String(Math.floor(100000 + Math.random() * 900000));
    const col = $app.findCollectionByNameOrId('security_challenges');
    const rec = new Record(col);
    rec.set('user', auth.id);
    rec.set('purpose', 'password_change');
    rec.set('code1', code1);
    rec.set('code2', code2);
    rec.set('code1_verified', false);
    rec.set('code2_verified', false);
    rec.set('completed', false);
    // 10-minute window via numeric ms (date fields lose time-of-day).
    const expiresMs = Date.now() + 10 * 60 * 1000;
    rec.set('expires_at', new Date(expiresMs).toISOString());
    try {
      rec.set('expires_ms', expiresMs);
    } catch (_) {}
    // Primary store: dedicated text field (reliable). JSON payload as backup.
    const b64encode = (text) => {
      const bytes = [];
      const str = String(text || '');
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 128) bytes.push(c);
        else if (c < 2048) {
          bytes.push(192 | (c >> 6), 128 | (c & 63));
        } else {
          bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
        }
      }
      const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let out = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        out += table[a >> 2];
        out += table[((a & 3) << 4) | (b >> 4)];
        out += i + 1 < bytes.length ? table[((b & 15) << 2) | (c >> 6)] : '=';
        out += i + 2 < bytes.length ? table[c & 63] : '=';
      }
      return out;
    };
    const blob = 'v1.' + b64encode(newPassword);
    try {
      rec.set('secret_blob', blob);
    } catch (_) {}
    rec.set('payload', {
      np: newPassword,
      np_b64: b64encode(newPassword),
      created_at: Date.now(),
    });
    if (device) rec.set('device', device);
    $app.save(rec);

    // Verify secret survived the write.
    try {
      const check = $app.findRecordById('security_challenges', rec.id);
      let ok = false;
      try {
        const sb = String(check.getString('secret_blob') || '');
        ok = sb.indexOf('v1.') === 0 && sb.length > 20;
      } catch (_) {}
      if (!ok) {
        const raw = check.get('payload');
        if (raw && typeof raw === 'object') {
          ok = String(raw.np || raw['np'] || '').length >= 10;
        }
      }
      if (!ok) {
        $app.logger().error('password challenge secret missing after save', 'id', rec.id);
        throw new BadRequestError('Could not create password change challenge. Please try again.');
      }
    } catch (err) {
      if (String(err).indexOf('Could not create') >= 0) throw err;
      $app.logger().error('password challenge verify failed', 'err', String(err));
    }

    const send = (to, code, which) => {
      const title =
        which === 1
          ? 'Estate Follow security code #1 / رمز الأمان #1 — إستيت فولو'
          : 'Estate Follow security code #2 / رمز الأمان #2 — إستيت فولو';
      const html =
        "<div style='font-family:sans-serif;max-width:560px;margin:auto'>" +
        "<h2 style='color:#22C55E'>" +
        title +
        '</h2>' +
        '<p>Super Admin password change / تغيير كلمة مرور المدير الأعلى</p>' +
        "<p style='font-size:28px;letter-spacing:6px;font-weight:700'>" +
        code +
        '</p>' +
        "<p style='color:#666;font-size:13px'>Expires in 10 minutes / ينتهي خلال 10 دقائق</p>" +
        "<p style='color:#888;font-size:12px'>Estate Follow — إستيت فولو</p></div>";
      $app.newMailClient().send(
        new MailerMessage({
          from: { name: 'Estate Follow Security' },
          to: [{ address: to }],
          subject: title,
          html: html,
        }),
      );
    };
    try {
      send(SUPER_ADMIN_EMAIL, code1, 1);
      send(recovery, code2, 2);
    } catch (err) {
      $app.logger().error('security otp email failed', 'err', String(err));
      throw new BadRequestError('Could not send verification email.');
    }

    try {
      const logCol = $app.findCollectionByNameOrId('activity_logs');
      const log = new Record(logCol);
      log.set('user', auth.id);
      log.set('action', 'security_password_otp_sent');
      log.set('entity', 'security');
      log.set('entity_id', auth.id);
      log.set('details', 'Dual OTP sent for password change');
      log.set('admin', SUPER_ADMIN_EMAIL);
      log.set('admin_action', 'security_password_otp_sent');
      if (device) log.set('device', device);
      $app.save(log);
    } catch (_) {}

    return e.json(200, {
      challengeId: rec.id,
      recoveryMasked: recovery.replace(/(.{2}).+(@.+)/, '$1***$2'),
      adminEmail: SUPER_ADMIN_EMAIL,
    });
  },
  $apis.requireAuth('users'),
);

routerAdd(
  'POST',
  '/ef/security/confirm-password-change',
  (e) => {
    const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';

    const normalizeEmail = (value) =>
      String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');

    const readEmail = (rec) => {
      if (!rec) return '';
      try {
        const s = rec.getString('email');
        if (s) return normalizeEmail(s);
      } catch (_) {}
      try {
        const g = rec.get('email');
        if (g) return normalizeEmail(g);
      } catch (_) {}
      try {
        if (typeof rec.email === 'function') return normalizeEmail(rec.email());
        if (typeof rec.email === 'string') return normalizeEmail(rec.email);
      } catch (_) {}
      return '';
    };

    const resolveMainSuperAdmin = (authRecord) => {
      if (!authRecord || !authRecord.id) {
        throw new ForbiddenError('Only the Super Admin can perform this action.');
      }
      let fresh = null;
      try {
        fresh = $app.findRecordById('users', authRecord.id);
      } catch (_) {
        fresh = authRecord;
      }
      let main = null;
      try {
        main = $app.findAuthRecordByEmail('users', SUPER_ADMIN_EMAIL);
      } catch (_) {
        main = null;
      }
      const email = readEmail(fresh) || readEmail(authRecord);
      const idMatch = main && String(main.id) === String(authRecord.id);
      const emailMatch = email === SUPER_ADMIN_EMAIL;
      let flag = false;
      try {
        flag = !!(fresh && fresh.getBool('is_super_admin'));
      } catch (_) {
        flag = false;
      }
      if (idMatch || emailMatch || (flag && main && idMatch)) {
        return idMatch ? main : fresh || authRecord;
      }
      throw new ForbiddenError('Only admin@estatefollow.com can perform this action.');
    };

    const auth = resolveMainSuperAdmin(e.auth);

    const body = e.requestInfo().body || {};
    const challengeId = String(body.challengeId || '').trim();
    const code1 = String(body.code1 || '').trim();
    const code2 = String(body.code2 || '').trim();
    const device = String(body.device || '').slice(0, 200);

    if (!challengeId || !code1 || !code2) {
      throw new BadRequestError('Both verification codes are required.');
    }

    let rec = null;
    try {
      rec = $app.findRecordById('security_challenges', challengeId);
    } catch (_) {
      throw new BadRequestError(
        'Your password change request expired. Please request new verification codes.',
      );
    }

    if (String(rec.get('user')) !== String(auth.id)) {
      throw new ForbiddenError('Invalid challenge.');
    }
    if (rec.getString('purpose') !== 'password_change') {
      throw new BadRequestError('Invalid challenge purpose.');
    }
    if (rec.getBool('completed')) {
      throw new BadRequestError(
        'Your password change request expired. Please request new verification codes.',
      );
    }

    // Expiry: prefer numeric expires_ms (date fields drop time-of-day).
    let expMs = 0;
    try {
      expMs = Number(rec.get('expires_ms') || 0);
    } catch (_) {
      expMs = 0;
    }
    if (!expMs || Number.isNaN(expMs)) {
      try {
        const expVal = rec.get('expires_at');
        if (expVal && typeof expVal.unix === 'function') {
          expMs = expVal.unix() * 1000 + 10 * 60 * 1000;
        } else {
          expMs = new Date(String(expVal)).getTime() + 10 * 60 * 1000;
        }
      } catch (_) {
        expMs = 0;
      }
    }
    if (!expMs || Number.isNaN(expMs) || expMs < Date.now()) {
      try {
        rec.set('completed', true);
        rec.set('secret_blob', '');
        $app.save(rec);
      } catch (_) {}
      throw new BadRequestError(
        'Your password change request expired. Please request new verification codes.',
      );
    }

    const b64decode = (b64) => {
      const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const clean = String(b64 || '').replace(/=+$/, '');
      if (!clean) return '';
      const bytes = [];
      for (let i = 0; i < clean.length; i += 4) {
        const e1 = table.indexOf(clean[i]);
        const e2 = table.indexOf(clean[i + 1] || 'A');
        const e3 = table.indexOf(clean[i + 2] || 'A');
        const e4 = table.indexOf(clean[i + 3] || 'A');
        if (e1 < 0 || e2 < 0) return '';
        bytes.push((e1 << 2) | (e2 >> 4));
        if (clean[i + 2]) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
        if (clean[i + 3]) bytes.push(((e3 & 3) << 6) | e4);
      }
      let decoded = '';
      for (let i = 0; i < bytes.length; ) {
        const b = bytes[i];
        if (b < 128) {
          decoded += String.fromCharCode(b);
          i++;
        } else if (b >= 192 && b < 224 && i + 1 < bytes.length) {
          decoded += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63));
          i += 2;
        } else if (i + 2 < bytes.length) {
          decoded += String.fromCharCode(
            ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63),
          );
          i += 3;
        } else break;
      }
      return decoded;
    };

    // Read password BEFORE any writes. Prefer secret_blob text field.
    const readNewPassword = (record) => {
      try {
        const blob = String(record.getString('secret_blob') || record.get('secret_blob') || '');
        if (blob.indexOf('v1.') === 0) {
          const decoded = b64decode(blob.slice(3));
          if (decoded.length >= 10) return decoded;
        }
      } catch (_) {}

      let raw = null;
      try {
        raw = record.get('payload');
      } catch (_) {
        raw = null;
      }
      let obj = null;
      if (raw == null || raw === '') {
        obj = null;
      } else if (typeof raw === 'string') {
        try {
          obj = JSON.parse(raw);
        } catch (_) {
          obj = null;
        }
      } else {
        try {
          obj = JSON.parse(JSON.stringify(raw));
        } catch (_) {
          obj = raw;
        }
      }
      if (!obj || typeof obj !== 'object') return '';
      let np = '';
      try {
        np = String(obj.np || obj['np'] || obj.newPassword || obj['newPassword'] || '');
      } catch (_) {
        np = '';
      }
      if (np.length >= 10) return np;
      try {
        const b64 = String(obj.np_b64 || obj['np_b64'] || '');
        const decoded = b64decode(b64);
        if (decoded.length >= 10) return decoded;
      } catch (_) {}
      return '';
    };

    const newPassword = readNewPassword(rec);
    if (!newPassword || newPassword.length < 10) {
      $app.logger().error('password change secret empty', 'challengeId', challengeId);
      throw new BadRequestError(
        'Your password change request expired. Please request new verification codes.',
      );
    }

    const stored1 = String(rec.getString('code1') || '').trim();
    const stored2 = String(rec.getString('code2') || '').trim();
    const c1ok = stored1 === code1;
    const c2ok = stored2 === code2;

    if (!c1ok || !c2ok) {
      // Do NOT complete/invalidate the challenge — user may retry within window.
      try {
        rec.set('code1_verified', c1ok);
        rec.set('code2_verified', c2ok);
        $app.save(rec);
      } catch (_) {}
      throw new BadRequestError(
        'Both verification codes must be correct. Password was not changed.',
      );
    }

    // Both OTPs correct — update password on the same challenge, then invalidate.
    // Prefer the DB auth record so setPassword always hits a real users row.
    let target = auth;
    try {
      const main = $app.findAuthRecordByEmail('users', SUPER_ADMIN_EMAIL);
      if (main) target = main;
    } catch (_) {}
    try {
      const fresh = $app.findRecordById('users', target.id || auth.id);
      if (fresh) target = fresh;
    } catch (_) {}

    target.setPassword(newPassword);
    try {
      target.set('is_super_admin', true);
      target.set('role', 'admin');
      target.set('suspended', false);
      target.set('account_state', 'active');
    } catch (_) {}
    $app.save(target);

    // Invalidate challenge only AFTER successful password update
    try {
      rec.set('code1_verified', true);
      rec.set('code2_verified', true);
      rec.set('completed', true);
      rec.set('payload', { done: true });
      try {
        rec.set('secret_blob', '');
      } catch (_) {}
      $app.save(rec);
    } catch (err) {
      $app.logger().error('challenge complete failed after password change', 'err', String(err));
    }

    // Optionally deactivate other device sessions (keep current trusted session).
    try {
      const sessions = $app.findRecordsByFilter(
        'user_sessions',
        'user = {:uid} && active = true',
        '-created',
        50,
        0,
        { uid: target.id },
      );
      const currentDevice = device || '';
      sessions.forEach((s) => {
        try {
          const name = String(s.getString('device_name') || '');
          const label = [name, s.getString('browser'), s.getString('device_type')]
            .filter(Boolean)
            .join(' · ');
          // Soft-match: if device label was stored on challenge, skip that one.
          const chalDevice = String(rec.getString('device') || '');
          if (chalDevice && (label === chalDevice || currentDevice === chalDevice)) {
            return;
          }
          s.set('active', false);
          $app.save(s);
        } catch (_) {}
      });
    } catch (_) {}

    try {
      const logCol = $app.findCollectionByNameOrId('activity_logs');
      const log = new Record(logCol);
      log.set('user', target.id);
      log.set('action', 'security_password_changed');
      log.set('entity', 'security');
      log.set('entity_id', target.id);
      log.set('details', 'Super Admin password changed after dual OTP');
      log.set('admin', SUPER_ADMIN_EMAIL);
      log.set('admin_action', 'security_password_changed');
      if (device) log.set('device', device);
      $app.save(log);
    } catch (_) {}

    return e.json(200, { ok: true, message: 'Password changed successfully' });
  },
  $apis.requireAuth('users'),
);

routerAdd(
  'GET',
  '/ef/security/recovery-email',
  (e) => {
    const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';
    const DEFAULT_RECOVERY = 'ceo@madproperties.ae';

    const normalizeEmail = (value) =>
      String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');

    const readEmail = (rec) => {
      if (!rec) return '';
      try {
        const s = rec.getString('email');
        if (s) return normalizeEmail(s);
      } catch (_) {}
      try {
        const g = rec.get('email');
        if (g) return normalizeEmail(g);
      } catch (_) {}
      try {
        if (typeof rec.email === 'function') return normalizeEmail(rec.email());
        if (typeof rec.email === 'string') return normalizeEmail(rec.email);
      } catch (_) {}
      return '';
    };

    const authRecord = e.auth;
    if (!authRecord || !authRecord.id) {
      throw new ForbiddenError('Only the Super Admin can perform this action.');
    }
    let main = null;
    try {
      main = $app.findAuthRecordByEmail('users', SUPER_ADMIN_EMAIL);
    } catch (_) {
      main = null;
    }
    let fresh = authRecord;
    try {
      fresh = $app.findRecordById('users', authRecord.id);
    } catch (_) {}
    const email = readEmail(fresh) || readEmail(authRecord);
    const idMatch = main && String(main.id) === String(authRecord.id);
    if (!idMatch && email !== SUPER_ADMIN_EMAIL) {
      throw new ForbiddenError('Only admin@estatefollow.com can perform this action.');
    }

    let recovery = DEFAULT_RECOVERY;
    try {
      const rows = $app.findAllRecords('platform_settings');
      if (rows.length && rows[0].getString('security_recovery_email')) {
        recovery = normalizeEmail(rows[0].getString('security_recovery_email'));
      }
    } catch (_) {}
    return e.json(200, { recoveryEmail: recovery, adminEmail: SUPER_ADMIN_EMAIL });
  },
  $apis.requireAuth('users'),
);

routerAdd(
  'POST',
  '/ef/security/request-recovery-email-change',
  (e) => {
    const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';
    const DEFAULT_RECOVERY = 'ceo@madproperties.ae';

    const normalizeEmail = (value) =>
      String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');

    const readEmail = (rec) => {
      if (!rec) return '';
      try {
        const s = rec.getString('email');
        if (s) return normalizeEmail(s);
      } catch (_) {}
      try {
        const g = rec.get('email');
        if (g) return normalizeEmail(g);
      } catch (_) {}
      try {
        if (typeof rec.email === 'function') return normalizeEmail(rec.email());
        if (typeof rec.email === 'string') return normalizeEmail(rec.email);
      } catch (_) {}
      return '';
    };

    const authRecord = e.auth;
    if (!authRecord || !authRecord.id) {
      throw new ForbiddenError('Only the Super Admin can perform this action.');
    }
    let main = null;
    try {
      main = $app.findAuthRecordByEmail('users', SUPER_ADMIN_EMAIL);
    } catch (_) {
      main = null;
    }
    let auth = authRecord;
    try {
      auth = $app.findRecordById('users', authRecord.id);
    } catch (_) {}
    const email = readEmail(auth) || readEmail(authRecord);
    const idMatch = main && String(main.id) === String(authRecord.id);
    if (!idMatch && email !== SUPER_ADMIN_EMAIL) {
      throw new ForbiddenError('Only admin@estatefollow.com can perform this action.');
    }
    if (main) auth = main;

    const body = e.requestInfo().body || {};
    const newEmail = normalizeEmail(body.newEmail || '');
    const device = String(body.device || '').slice(0, 200);

    if (!newEmail || !newEmail.includes('@') || newEmail.length < 5) {
      throw new BadRequestError('Enter a valid recovery email.');
    }

    let current = DEFAULT_RECOVERY;
    try {
      const rows = $app.findAllRecords('platform_settings');
      if (rows.length && rows[0].getString('security_recovery_email')) {
        current = normalizeEmail(rows[0].getString('security_recovery_email'));
      }
    } catch (_) {}
    if (newEmail === current) {
      throw new BadRequestError('That is already the recovery email.');
    }

    try {
      const old = $app.findRecordsByFilter(
        'security_challenges',
        'user = {:uid} && purpose = {:p} && completed = false',
        '-created',
        50,
        0,
        { uid: auth.id, p: 'recovery_email_change' },
      );
      old.forEach((r) => {
        try {
          $app.delete(r);
        } catch (_) {}
      });
    } catch (_) {}

    const code1 = String(Math.floor(100000 + Math.random() * 900000));
    const code2 = String(Math.floor(100000 + Math.random() * 900000));
    const col = $app.findCollectionByNameOrId('security_challenges');
    const rec = new Record(col);
    rec.set('user', auth.id);
    rec.set('purpose', 'recovery_email_change');
    rec.set('code1', code1);
    rec.set('code2', code2);
    rec.set('code1_verified', false);
    rec.set('code2_verified', false);
    rec.set('completed', false);
    rec.set('expires_at', new Date(Date.now() + 10 * 60 * 1000).toISOString());
    rec.set('payload', { newEmail: newEmail });
    if (device) rec.set('device', device);
    $app.save(rec);

    const send = (to, code, which) => {
      const title =
        which === 1
          ? 'Estate Follow security code #1 / رمز الأمان #1 — إستيت فولو'
          : 'Estate Follow security code #2 / رمز الأمان #2 — إستيت فولو';
      const html =
        "<div style='font-family:sans-serif;max-width:560px;margin:auto'>" +
        "<h2 style='color:#22C55E'>" +
        title +
        '</h2>' +
        '<p>Recovery email change / تغيير بريد الاسترداد</p>' +
        "<p style='font-size:28px;letter-spacing:6px;font-weight:700'>" +
        code +
        '</p>' +
        "<p style='color:#666;font-size:13px'>Expires in 10 minutes / ينتهي خلال 10 دقائق</p>" +
        "<p style='color:#888;font-size:12px'>Estate Follow — إستيت فولو</p></div>";
      $app.newMailClient().send(
        new MailerMessage({
          from: { name: 'Estate Follow Security' },
          to: [{ address: to }],
          subject: title,
          html: html,
        }),
      );
    };
    try {
      send(SUPER_ADMIN_EMAIL, code1, 1);
      send(current, code2, 2);
    } catch (err) {
      $app.logger().error('security otp email failed', 'err', String(err));
      throw new BadRequestError('Could not send verification email.');
    }

    try {
      const logCol = $app.findCollectionByNameOrId('activity_logs');
      const log = new Record(logCol);
      log.set('user', auth.id);
      log.set('action', 'security_recovery_otp_sent');
      log.set('entity', 'security');
      log.set('entity_id', auth.id);
      log.set('details', 'Dual OTP sent for recovery email change to ' + newEmail);
      log.set('admin', SUPER_ADMIN_EMAIL);
      log.set('admin_action', 'security_recovery_otp_sent');
      if (device) log.set('device', device);
      $app.save(log);
    } catch (_) {}

    return e.json(200, {
      challengeId: rec.id,
      currentRecoveryMasked: current.replace(/(.{2}).+(@.+)/, '$1***$2'),
      adminEmail: SUPER_ADMIN_EMAIL,
    });
  },
  $apis.requireAuth('users'),
);

routerAdd(
  'POST',
  '/ef/security/confirm-recovery-email-change',
  (e) => {
    const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';
    const DEFAULT_RECOVERY = 'ceo@madproperties.ae';

    const normalizeEmail = (value) =>
      String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');

    const readEmail = (rec) => {
      if (!rec) return '';
      try {
        const s = rec.getString('email');
        if (s) return normalizeEmail(s);
      } catch (_) {}
      try {
        const g = rec.get('email');
        if (g) return normalizeEmail(g);
      } catch (_) {}
      try {
        if (typeof rec.email === 'function') return normalizeEmail(rec.email());
        if (typeof rec.email === 'string') return normalizeEmail(rec.email);
      } catch (_) {}
      return '';
    };

    const authRecord = e.auth;
    if (!authRecord || !authRecord.id) {
      throw new ForbiddenError('Only the Super Admin can perform this action.');
    }
    let main = null;
    try {
      main = $app.findAuthRecordByEmail('users', SUPER_ADMIN_EMAIL);
    } catch (_) {
      main = null;
    }
    let auth = authRecord;
    try {
      auth = $app.findRecordById('users', authRecord.id);
    } catch (_) {}
    const email = readEmail(auth) || readEmail(authRecord);
    const idMatch = main && String(main.id) === String(authRecord.id);
    if (!idMatch && email !== SUPER_ADMIN_EMAIL) {
      throw new ForbiddenError('Only admin@estatefollow.com can perform this action.');
    }
    if (main) auth = main;

    const body = e.requestInfo().body || {};
    const challengeId = String(body.challengeId || '');
    const code1 = String(body.code1 || '').trim();
    const code2 = String(body.code2 || '').trim();
    const device = String(body.device || '').slice(0, 200);

    if (!challengeId || !code1 || !code2) {
      throw new BadRequestError('Both verification codes are required.');
    }

    const rec = $app.findRecordById('security_challenges', challengeId);
    if (String(rec.get('user')) !== String(auth.id)) {
      throw new ForbiddenError('Invalid challenge.');
    }
    if (rec.getString('purpose') !== 'recovery_email_change') {
      throw new BadRequestError('Invalid challenge purpose.');
    }
    if (rec.getBool('completed')) throw new BadRequestError('This challenge was already used.');
    const exp = new Date(String(rec.get('expires_at')));
    if (Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      throw new BadRequestError('Verification codes expired. Please request new ones.');
    }

    const c1ok = rec.getString('code1') === code1;
    const c2ok = rec.getString('code2') === code2;
    rec.set('code1_verified', c1ok);
    rec.set('code2_verified', c2ok);
    $app.save(rec);

    if (!c1ok || !c2ok) {
      throw new BadRequestError(
        'Both verification codes must be correct. Recovery email was not changed.',
      );
    }

    const payload = rec.get('payload') || {};
    const newEmail =
      typeof payload === 'object'
        ? normalizeEmail(payload.newEmail || payload['newEmail'] || '')
        : '';
    if (!newEmail.includes('@')) {
      throw new BadRequestError('Invalid email payload. Request a new challenge.');
    }

    const rows = $app.findAllRecords('platform_settings');
    if (!rows.length) throw new BadRequestError('Platform settings not found.');
    const settings = rows[0];
    const prev = settings.getString('security_recovery_email') || DEFAULT_RECOVERY;
    settings.set('security_recovery_email', newEmail);
    $app.save(settings);

    rec.set('completed', true);
    rec.set('payload', {});
    $app.save(rec);

    try {
      const logCol = $app.findCollectionByNameOrId('activity_logs');
      const log = new Record(logCol);
      log.set('user', auth.id);
      log.set('action', 'security_recovery_email_changed');
      log.set('entity', 'security');
      log.set('entity_id', auth.id);
      log.set('details', 'Recovery email changed from ' + prev + ' to ' + newEmail);
      log.set('admin', SUPER_ADMIN_EMAIL);
      log.set('admin_action', 'security_recovery_email_changed');
      if (device) log.set('device', device);
      $app.save(log);
    } catch (_) {}

    return e.json(200, { ok: true, recoveryEmail: newEmail });
  },
  $apis.requireAuth('users'),
);
