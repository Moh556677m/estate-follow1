/// <reference path="../pb_data/types.d.ts" />

// Multi-session architecture (independent browser profiles / apps):
//   - Up to 5 simultaneous ACTIVE sessions per account
//   - A new login never deactivates other valid active sessions
//   - Stale active sessions (no heartbeat) are recycled before blocking
//   - "Device" = browser profile / storage partition, not physical hardware
//
// Every callback is self-contained (isolated PB JSVM scope).

onRecordCreateRequest((e) => {
  const MAX_ACTIVE = 5;
  // Active sessions with no heartbeat for this long are freeable under pressure.
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;

  const auth = e.requestInfo().auth;
  if (!auth) {
    throw new UnauthorizedError('Authentication required.');
  }

  const nowMs = Date.now();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const d = new Date(nowMs);
  const nowStr =
    d.getUTCFullYear() +
    '-' +
    pad(d.getUTCMonth() + 1) +
    '-' +
    pad(d.getUTCDate()) +
    ' ' +
    pad(d.getUTCHours()) +
    ':' +
    pad(d.getUTCMinutes()) +
    ':' +
    pad(d.getUTCSeconds());

  e.record.set('user', auth.id);
  e.record.set('active', true);
  e.record.set('last_active', nowStr);
  try {
    e.record.set('last_seen_ms', nowMs);
  } catch (_) {}

  // Ensure opaque session tokens exist (client may also send them).
  const randToken = (prefix) => {
    const a = Math.random().toString(36).slice(2, 12);
    const b = Math.random().toString(36).slice(2, 12);
    const c = nowMs.toString(36);
    return prefix + '_' + a + b + c;
  };
  if (!String(e.record.get('session_token') || '').trim()) {
    try {
      e.record.set('session_token', randToken('sess'));
    } catch (_) {}
  }
  if (!String(e.record.get('access_token') || '').trim()) {
    try {
      e.record.set('access_token', randToken('atk'));
    } catch (_) {}
  }
  if (!String(e.record.get('refresh_token') || '').trim()) {
    try {
      e.record.set('refresh_token', randToken('rtk'));
    } catch (_) {}
  }

  const deviceId = String(e.record.get('device_id') || '').trim();
  const userId = auth.id;
  if (!deviceId) {
    throw new BadRequestError('DEVICE_ID_REQUIRED');
  }

  // Same browser profile already registered — client should update, not create.
  const existing = $app.findRecordsByFilter(
    'user_sessions',
    'user = {:uid} && device_id = {:did}',
    '-created',
    1,
    0,
    { uid: userId, did: deviceId },
  );
  if (existing.length > 0) {
    throw new BadRequestError('DEVICE_EXISTS');
  }

  let all = $app.findRecordsByFilter(
    'user_sessions',
    'user = {:uid}',
    '-created',
    100,
    0,
    { uid: userId },
  );

  const readLastSeen = (r) => {
    let ms = 0;
    try {
      ms = Number(r.get('last_seen_ms') || 0);
    } catch (_) {
      ms = 0;
    }
    if (ms && !Number.isNaN(ms) && ms > 0) return ms;
    try {
      const la = r.get('last_active');
      if (la && typeof la.unix === 'function') return la.unix() * 1000;
      const t = new Date(String(la || r.get('created') || '')).getTime();
      return Number.isNaN(t) ? 0 : t;
    } catch (_) {
      return 0;
    }
  };

  const isStaleActive = (r) => {
    if (!r.getBool('active')) return false;
    const seen = readLastSeen(r);
    if (!seen) return true;
    return nowMs - seen > STALE_MS;
  };

  // 1) Soft-deactivate stale "active" rows so closed browsers free slots.
  all.forEach((r) => {
    if (isStaleActive(r)) {
      try {
        r.set('active', false);
        $app.save(r);
      } catch (_) {}
    }
  });
  // Reload after stale pass.
  all = $app.findRecordsByFilter(
    'user_sessions',
    'user = {:uid}',
    '-created',
    100,
    0,
    { uid: userId },
  );

  const deleteOldest = (predicate) => {
    const pool = all
      .filter(predicate)
      .slice()
      .sort((a, b) => readLastSeen(a) - readLastSeen(b));
    if (!pool.length) return false;
    try {
      $app.delete(pool[0]);
      all = all.filter((r) => r.id !== pool[0].id);
      return true;
    } catch (_) {
      return false;
    }
  };

  // 2) Free registered-row capacity by deleting oldest inactive first.
  while (all.length >= MAX_ACTIVE) {
    if (!deleteOldest((r) => !r.getBool('active'))) break;
  }

  // 3) Still full? Delete oldest stale-ish inactive already gone — try any
  //    inactive again, then refuse rather than kicking a live session.
  if (all.length >= MAX_ACTIVE) {
    while (all.length >= MAX_ACTIVE) {
      if (!deleteOldest((r) => !r.getBool('active'))) break;
    }
  }

  if (all.length >= MAX_ACTIVE) {
    // All remaining rows are active and fresh — block 6th session only.
    const activeFresh = all.filter((r) => r.getBool('active'));
    if (activeFresh.length >= MAX_ACTIVE) {
      throw new BadRequestError('MAX_SESSIONS');
    }
    // Mixed leftover: delete oldest inactive-or-stale if any slipped through.
    if (!deleteOldest((r) => !r.getBool('active') || isStaleActive(r))) {
      throw new BadRequestError('MAX_SESSIONS');
    }
  }

  const activeCount = all.filter((r) => r.getBool('active')).length;
  if (activeCount >= MAX_ACTIVE) {
    throw new BadRequestError('MAX_SESSIONS');
  }

  e.next();
}, 'user_sessions');

onRecordUpdateRequest((e) => {
  const MAX_ACTIVE = 5;
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;

  const auth = e.requestInfo().auth;
  if (!auth) {
    throw new UnauthorizedError('Authentication required.');
  }

  // Owners may only mutate their own session rows (staff/super can manage any).
  try {
    const ownerId = String(e.record.get('user') || '');
    const isStaff =
      auth.getBool('is_super_admin') ||
      auth.get('role') === 'admin' ||
      auth.get('role') === 'editor' ||
      auth.get('role') === 'support' ||
      auth.get('role') === 'custom';
    if (!isStaff && ownerId && ownerId !== String(auth.id)) {
      throw new ForbiddenError("Cannot modify another user's session.");
    }
  } catch (err) {
    if (String(err).indexOf('Cannot modify') >= 0) throw err;
  }

  const nowMs = Date.now();
  try {
    e.record.set('last_seen_ms', nowMs);
  } catch (_) {}

  const orig = e.record.original();
  const wasActive = orig ? orig.getBool('active') : false;
  const willBeActive = e.record.getBool('active');

  // Already-active → still-active: heartbeat only. Never count against limit
  // and never touch other devices/sessions.
  if (wasActive && willBeActive) {
    e.next();
    return;
  }

  // Reactivating this session only — do not deactivate siblings.
  if (!wasActive && willBeActive) {
    const userId = String(e.record.get('user') || auth.id);
    let active = $app.findRecordsByFilter(
      'user_sessions',
      'user = {:uid} && active = true',
      '-created',
      100,
      0,
      { uid: userId },
    );

    const readLastSeen = (r) => {
      let ms = 0;
      try {
        ms = Number(r.get('last_seen_ms') || 0);
      } catch (_) {
        ms = 0;
      }
      if (ms && !Number.isNaN(ms) && ms > 0) return ms;
      try {
        const la = r.get('last_active');
        if (la && typeof la.unix === 'function') return la.unix() * 1000;
        const t = new Date(String(la || '')).getTime();
        return Number.isNaN(t) ? 0 : t;
      } catch (_) {
        return 0;
      }
    };

    // Free stale actives before enforcing the cap.
    active.forEach((r) => {
      if (r.id === e.record.id) return;
      const seen = readLastSeen(r);
      if (!seen || nowMs - seen > STALE_MS) {
        try {
          r.set('active', false);
          $app.save(r);
        } catch (_) {}
      }
    });

    active = $app.findRecordsByFilter(
      'user_sessions',
      'user = {:uid} && active = true',
      '-created',
      100,
      0,
      { uid: userId },
    );
    const others = active.filter((r) => r.id !== e.record.id);
    if (others.length >= MAX_ACTIVE) {
      throw new BadRequestError('MAX_SESSIONS');
    }
  }

  e.next();
}, 'user_sessions');
