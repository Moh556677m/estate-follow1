// Permission helpers for the Estate Follow platform.
//
// The Super Admin (is_super_admin = true) always has every permission. Staff
// accounts (role = admin/editor/support/custom) carry a `permissions` json
// object whose keys are the PERMISSION_KEYS below. Owners have no staff
// permissions.

export const PERMISSION_KEYS = [
  'view_users',
  'edit_users',
  'approve_properties',
  'edit_properties',
  'view_documents',
  'manage_payments',
  'manage_subscriptions',
  'manage_support',
  'manage_settings',
  'view_revenue',
  'manage_cms',
];

export const PERMISSION_LABELS = {
  view_users: 'perm_view_users',
  edit_users: 'perm_edit_users',
  approve_properties: 'perm_approve_properties',
  edit_properties: 'perm_edit_properties',
  view_documents: 'perm_view_documents',
  manage_payments: 'perm_manage_payments',
  manage_subscriptions: 'perm_manage_subscriptions',
  manage_support: 'perm_manage_support',
  manage_settings: 'perm_manage_settings',
  view_revenue: 'perm_view_revenue',
  manage_cms: 'perm_manage_cms',
};

// Staff roles are everyone who is not a plain owner.
export const STAFF_ROLES = ['admin', 'editor', 'support', 'custom'];

export const ROLE_LABELS = {
  owner: 'role_owner',
  admin: 'role_admin',
  editor: 'role_editor',
  support: 'role_support',
  custom: 'role_custom',
};

export const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';

/** Normalize emails for permission checks (case/space insensitive). */
export function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Permanent platform Super Admin (admin@estatefollow.com). */
export function isMainSuperAdmin(user) {
  if (!user) return false;
  const email = normalizeEmail(user.email);
  if (email === SUPER_ADMIN_EMAIL) return true;
  // Stale session may still carry the permanent flag without a readable email.
  return !!user.is_super_admin;
}

export function isSuperAdmin(user) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  // Stale JWT may omit the bool — still treat the permanent account as super.
  return normalizeEmail(user.email) === SUPER_ADMIN_EMAIL;
}

// Platform revenue is Super Admin only unless view_revenue is explicitly granted.
export function canViewRevenue(user) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (user.can_view_revenue) return true;
  const perms = user.permissions || {};
  return !!perms.view_revenue;
}

export function isStaff(user) {
  return isSuperAdmin(user) || STAFF_ROLES.includes(user?.role);
}

// True when the user may perform a given permission key.
export function hasPermission(user, key) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (!STAFF_ROLES.includes(user.role)) return false;
  const perms = user.permissions || {};
  // Admins default to full access unless a permissions object was explicitly
  // saved (in which case honour the granular flags).
  if (user.role === 'admin' && (!perms || Object.keys(perms).length === 0)) {
    return true;
  }
  return !!perms[key];
}

// Resolve a staff role display label, honouring a custom role's staff_label.
export function roleDisplay(user, t) {
  if (!user) return '—';
  if (isSuperAdmin(user)) return t('role_super_admin');
  if (user.role === 'custom' && user.staff_label) return user.staff_label;
  return t(ROLE_LABELS[user.role] || 'role_owner');
}

// Default permissions for a freshly created staff role (super admin can tweak).
export function defaultPermissionsFor(role) {
  const all = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]));
  if (role === 'admin') {
    PERMISSION_KEYS.forEach((k) => (all[k] = true));
  } else if (role === 'editor') {
    ['view_users', 'approve_properties', 'edit_properties', 'view_documents', 'manage_payments'].forEach(
      (k) => (all[k] = true),
    );
  } else if (role === 'support') {
    ['view_users', 'view_documents', 'manage_support'].forEach((k) => (all[k] = true));
  }
  return all;
}
