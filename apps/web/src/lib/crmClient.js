import pb from '@/lib/pocketbaseClient';

// CRM routes live on PocketBase under /ef/crm/...
// pb.send uses the configured base URL (/hcgi/platform) and attaches the auth token.

export async function checkSlug(slug) {
  return pb.send(`/ef/crm/check-slug?slug=${encodeURIComponent(slug)}`, { method: 'GET' });
}

export async function getLeadPage(slug) {
  return pb.send(`/ef/crm/lead-page/${encodeURIComponent(slug)}`, { method: 'GET' });
}

export async function getPublicFields() {
  return pb.send('/ef/crm/fields-public', { method: 'GET' });
}

export async function submitLead(payload) {
  return pb.send('/ef/crm/submit-lead', { method: 'POST', body: payload });
}

export async function getAdminCrmSettings() {
  return pb.send('/ef/crm/admin-settings', { method: 'GET' });
}

export async function saveAdminCrmSettings(settings) {
  return pb.send('/ef/crm/admin-settings', { method: 'POST', body: settings });
}

export async function getAdminCrmStats() {
  return pb.send('/ef/crm/admin-stats', { method: 'GET' });
}

// Build the public lead page URL for a slug.
export function buildLeadPageUrl(slug) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/connect/${slug}`;
}

// Build a tracking link URL (same lead page, with ?src= and ?t= params).
export function buildTrackingUrl(slug, source, token) {
  const base = buildLeadPageUrl(slug);
  const params = new URLSearchParams();
  if (source) params.set('src', source);
  if (token) params.set('t', token);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// Email a client analysis report (auth required). Server re-fetches the lead
// for real data and builds the HTML report.
export async function emailAnalysis(payload) {
  return pb.send('/ef/crm/email-analysis', { method: 'POST', body: payload });
}
