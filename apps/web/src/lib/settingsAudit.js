// Shared settings-audit-log helpers.
//
// PlatformSettingsPanel.jsx and SeoAiSearchPanel.jsx each had their own
// independent copy of "load the audit log" / "write an audit entry" against
// the same `settings_audit_logs` collection — found during the Admin-area
// dedup audit. The two copies had already drifted (one used
// `getList(1, 50)`, silently capping history at 50 rows; the other used an
// uncapped `getFullList()`). Centralizing here so both panels see the same
// (uncapped) history and any future fix only needs to happen once.
//
// Usage:
//   import { loadSettingsAudit, writeSettingsAudit } from '@/lib/settingsAudit';
//   const rows = await loadSettingsAudit();
//   await writeSettingsAudit({ user, section: 'branding', action: 'save', summary, oldValue, newValue });

import pb from '@/lib/pocketbaseClient';

/**
 * Load settings-audit rows, newest first. Always uses getFullList (never a
 * capped page) so no panel silently hides older history.
 *
 * @param {object} [opts]
 * @param {string} [opts.filter] - optional PocketBase filter expression
 *   (e.g. to scope to a section prefix like `section ~ 'seo:%'` style needs
 *   would use PocketBase's own operators — left to the caller).
 * @param {string} [opts.expand] - relation expand, defaults to 'admin'.
 * @returns {Promise<Array>} rows, or [] on any failure (non-fatal by design
 *   — the audit tab degrades to "no history" rather than breaking the page).
 */
export async function loadSettingsAudit(opts = {}) {
  const { filter = '', expand = 'admin' } = opts;
  try {
    return await pb.collection('settings_audit_logs').getFullList({
      sort: '-created',
      expand,
      ...(filter ? { filter } : {}),
    });
  } catch {
    return [];
  }
}

/**
 * Write one settings-audit entry. Non-fatal: a failed write never throws,
 * matching both panels' original behavior (an audit-log hiccup should never
 * block the actual settings save it is describing).
 *
 * @param {object} params
 * @param {object} params.user - the acting admin user record (needs id/email)
 * @param {string} params.section - section label; callers may namespace it
 *   themselves (e.g. SeoAiSearchPanel uses `seo:${section}`) — this helper
 *   does not add its own prefix so existing section naming is preserved.
 * @param {string} [params.action] - defaults to 'update'
 * @param {string} [params.summary]
 * @param {*} [params.oldValue]
 * @param {*} [params.newValue]
 * @param {string} [params.requestKeyPrefix] - distinguishes concurrent
 *   requestKeys between callers (e.g. 'cms-audit' vs 'seo-audit').
 */
export async function writeSettingsAudit({
  user,
  section,
  action = 'update',
  summary = '',
  oldValue = null,
  newValue = null,
  requestKeyPrefix = 'settings-audit',
}) {
  try {
    await pb.collection('settings_audit_logs').create(
      {
        admin: user?.id,
        admin_email: user?.email || '',
        section,
        action: action || 'update',
        summary: summary || '',
        old_value: oldValue ?? null,
        new_value: newValue ?? null,
      },
      { requestKey: `${requestKeyPrefix}-${Date.now()}` },
    );
  } catch {
    /* non-fatal */
  }
}
