/// <reference path="../pb_data/types.d.ts" />

// Super Admin-only account controls.
//
// Deleting a user account and suspending / deactivating an account are
// restricted to the Super Admin. The permanent Super Admin account can never
// be deleted or suspended. Internal (non-API) saves — e.g. migrations or
// boot-time healing — have no request auth and are always allowed through.
//
// NOTE: PocketBase compiles every *.pb.js file into one JSVM scope, so every
// helper is declared INSIDE the callback (never at file top level) to avoid
// duplicate-identifier panics across hook files.

const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';

// Block user account deletion unless the caller is the Super Admin.
onRecordDeleteRequest((e) => {
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
    return '';
  };

  const isSuper = (auth) => {
    if (!auth) return false;
    try {
      if (auth.getBool('is_super_admin')) return true;
    } catch (_) {}
    return false;
  };

  const isMainSuperAdmin = (rec) => {
    if (!rec) return false;
    if (readEmail(rec) === SUPER_ADMIN_EMAIL) return true;
    try {
      return !!rec.getBool('is_super_admin');
    } catch (_) {
      return false;
    }
  };

  const auth = e.requestInfo().auth;
  if (!auth) {
    e.next();
    return;
  }
  if (!isSuper(auth)) {
    throw new ForbiddenError('Only the Super Admin can delete user accounts.');
  }
  if (isMainSuperAdmin(e.record)) {
    throw new ForbiddenError('The Super Admin account cannot be deleted.');
  }
  e.next();
}, 'users');

// Block suspend / deactivate (account_state or suspended changes) unless the
// caller is the Super Admin. Other profile field updates by permitted staff
// are unaffected. The Super Admin account itself can never be suspended.
onRecordUpdateRequest((e) => {
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
    return '';
  };

  const isSuper = (auth) => {
    if (!auth) return false;
    try {
      if (auth.getBool('is_super_admin')) return true;
    } catch (_) {}
    return false;
  };

  const isMainSuperAdmin = (rec) => {
    if (!rec) return false;
    if (readEmail(rec) === SUPER_ADMIN_EMAIL) return true;
    try {
      return !!rec.getBool('is_super_admin');
    } catch (_) {
      return false;
    }
  };

  const auth = e.requestInfo().auth;
  if (!auth) {
    e.next();
    return;
  }
  let orig = null;
  try {
    orig = e.record.original();
  } catch (_) {
    orig = null;
  }
  const newSuspended = e.record.getBool('suspended');
  const oldSuspended = orig ? orig.getBool('suspended') : newSuspended;
  const newState = String(e.record.get('account_state') || '');
  const oldState = orig ? String(orig.get('account_state') || '') : newState;
  const accountControlChanged =
    newSuspended !== oldSuspended || newState !== oldState;
  if (!accountControlChanged) {
    e.next();
    return;
  }
  if (!isSuper(auth)) {
    throw new ForbiddenError(
      'Only the Super Admin can suspend or deactivate user accounts.',
    );
  }
  if (
    isMainSuperAdmin(e.record) &&
    (newSuspended || newState === 'suspended' || newState === 'inactive')
  ) {
    throw new ForbiddenError(
      'The Super Admin account cannot be suspended or deactivated.',
    );
  }
  e.next();
}, 'users');
