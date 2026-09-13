// Task #17 — Central Features system. Thin client for the new PocketBase
// custom routes (/ef/features/*, all guarded server-side by
// lib-feature-gate.js) plus the 3 new collections (owner_expenses,
// owner_tasks, document_shares). Follows the exact pb.send('/ef/...')
// convention already used throughout this repo (see referralClient.js,
// crmClient.js, MonthlyReportsPanel.jsx) rather than inventing a new one.

import pb from '@/lib/pocketbaseClient';

export async function getNetProfit({ year, propertyIds } = {}) {
	const params = new URLSearchParams();
	if (year) params.set('year', String(year));
	if (propertyIds && propertyIds.length) params.set('propertyIds', propertyIds.join(','));
	const qs = params.toString();
	return pb.send(`/ef/features/net-profit${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function getCashFlowForecast({ months } = {}) {
	const qs = months ? `?months=${encodeURIComponent(months)}` : '';
	return pb.send(`/ef/features/cash-flow-forecast${qs}`, { method: 'GET' });
}

export async function getOccupancy() {
	return pb.send('/ef/features/occupancy', { method: 'GET' });
}

export async function getPropertyTimeline(propertyId) {
	return pb.send(`/ef/features/property-timeline?propertyId=${encodeURIComponent(propertyId)}`, { method: 'GET' });
}

// ---- Task #18 ---------------------------------------------------------------
export async function getCommandCenter() {
	return pb.send('/ef/features/command-center', { method: 'GET' });
}

// ---- Feature Management batch — Property Health Score -----------------------
export async function getPropertyHealthScore({ propertyIds } = {}) {
	const qs = propertyIds && propertyIds.length ? `?propertyIds=${encodeURIComponent(propertyIds.join(','))}` : '';
	return pb.send(`/ef/features/property-health${qs}`, { method: 'GET' });
}

// ---- Feature Management batch — Tenant Score ---------------------------------
export async function getTenantScore({ propertyId } = {}) {
	const qs = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
	return pb.send(`/ef/features/tenant-score${qs}`, { method: 'GET' });
}

// ---- Feature Management batch — Security Deposit Management -----------------
export async function getSecurityDeposits() {
	return pb.send('/ef/features/security-deposits', { method: 'GET' });
}
// Writes go straight to the `tenancies` record — the owner already has
// update rights on their own tenancies (see tenancies' PB rules).
export async function updateSecurityDeposit(tenancyId, data) {
	return pb.collection('tenancies').update(tenancyId, data);
}

// ---- tenant_claims (Claims Center) --------------------------------------------
export async function listClaims(userId) {
	return pb.collection('tenant_claims').getFullList({
		filter: `owner = "${userId}"`,
		sort: '-created',
	});
}
export async function createClaim(data) {
	return pb.collection('tenant_claims').create(data);
}
export async function updateClaim(id, data) {
	return pb.collection('tenant_claims').update(id, data);
}
export async function deleteClaim(id) {
	return pb.collection('tenant_claims').delete(id);
}

// ---- Feature Management batch — Market Rent Comparison -----------------------
// IMPORTANT: comparisons are built ONLY from comparables the owner records
// themselves (no external market-data source exists in this codebase) —
// see task-market-rent.pb.js's `basis` field, always surfaced to the UI.
export async function getMarketRentComparison({ propertyId } = {}) {
	const qs = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
	return pb.send(`/ef/features/market-rent-comparison${qs}`, { method: 'GET' });
}
export async function listMarketComparables(userId) {
	return pb.collection('market_comparables').getFullList({
		filter: `owner = "${userId}"`,
		sort: '-created',
	});
}
export async function createMarketComparable(data) {
	return pb.collection('market_comparables').create(data);
}
export async function deleteMarketComparable(id) {
	return pb.collection('market_comparables').delete(id);
}

// ---- Feature Management batch — Portfolio Net Worth / LTV --------------------
// Both are a cost/equity basis (purchase price + amount paid), never a
// market valuation — see task-networth-ltv.pb.js's `basis` field.
export async function getPortfolioNetWorth() {
	return pb.send('/ef/features/net-worth', { method: 'GET' });
}
export async function getLtv() {
	return pb.send('/ef/features/ltv', { method: 'GET' });
}

// ---- Feature Management batch — Property Statements --------------------------
export async function getPropertyStatement({ propertyId, from, to }) {
	const params = new URLSearchParams({ propertyId });
	if (from) params.set('from', from);
	if (to) params.set('to', to);
	return pb.send(`/ef/features/property-statement?${params.toString()}`, { method: 'GET' });
}
// Returns real CSV text (not JSON) — same direct-fetch pattern as
// fetchTaxExportCsv above, since pb.send() would try to auto-decode JSON.
// ---- Feature Management batch — Portfolio Distribution ------------------------
export async function getPortfolioDistribution() {
	return pb.send('/ef/features/portfolio-distribution', { method: 'GET' });
}

// ---- Feature Management batch — Lifetime Return -------------------------------
export async function getLifetimeReturn() {
	return pb.send('/ef/features/lifetime-return', { method: 'GET' });
}

// ---- Feature Management batch — Smart Monthly Suggestions ---------------------
// Every suggestion is computed server-side from the owner's own recorded
// data (overdue payments, bounced checks, leases expiring, held deposits,
// vacant properties, expense spikes, stale claims) — never AI-generated.
export async function getMonthlySuggestions() {
	return pb.send('/ef/features/monthly-suggestions', { method: 'GET' });
}

// ---- Feature Management batch — Owner Marketplace ------------------------------
// Peer-to-peer: owners list their own properties for sale/rent to OTHER
// owners. Reads (browse + "my listings") come from the joined read model
// below; writes go straight to marketplace_listings (gated server-side by
// task-marketplace-hooks.pb.js).
export async function getMarketplaceListings() {
	return pb.send('/ef/features/marketplace-listings', { method: 'GET' });
}
export async function createMarketplaceListing(data) {
	return pb.collection('marketplace_listings').create(data);
}
export async function updateMarketplaceListing(id, data) {
	return pb.collection('marketplace_listings').update(id, data);
}
export async function deleteMarketplaceListing(id) {
	return pb.collection('marketplace_listings').delete(id);
}

export async function fetchPropertyStatementCsv({ propertyId, from, to }) {
	const params = new URLSearchParams({ propertyId });
	if (from) params.set('from', from);
	if (to) params.set('to', to);
	const res = await fetch(pb.buildUrl(`/ef/features/property-statement-csv?${params.toString()}`), {
		headers: { Authorization: pb.authStore.token },
	});
	if (!res.ok) {
		let msg = `Request failed (${res.status})`;
		try { msg = (await res.json())?.error || msg; } catch { /* not JSON */ }
		const err = new Error(msg);
		err.status = res.status;
		throw err;
	}
	return res.text();
}

// ---- Feature Management batch — Tax / Country Accounting Center (extends ------
// the existing Tax & Accounting Export feature above with a per-country
// breakdown; same feature key, no new feature_entitlements row).
export async function getTaxSummary({ year } = {}) {
	const qs = year ? `?year=${encodeURIComponent(year)}` : '';
	return pb.send(`/ef/features/tax-summary${qs}`, { method: 'GET' });
}

// Tax/Accounting Export returns real CSV text (not JSON) — pb.send() decodes
// JSON automatically, so this route is fetched directly with the same
// PocketBase auth header pb.send() would attach, via pb.buildUrl()/authStore.
export async function fetchTaxExportCsv(year) {
	const qs = year ? `?year=${encodeURIComponent(year)}` : '';
	const res = await fetch(pb.buildUrl(`/ef/features/tax-export${qs}`), {
		headers: { Authorization: pb.authStore.token },
	});
	if (!res.ok) {
		let msg = `Request failed (${res.status})`;
		try { msg = (await res.json())?.error || msg; } catch { /* not JSON */ }
		const err = new Error(msg);
		err.status = res.status;
		throw err;
	}
	return res.text();
}

// ---- owner_goals (Portfolio Goals) -----------------------------------------
export async function listGoals(userId) {
	return pb.collection('owner_goals').getFullList({
		filter: `owner = "${userId}"`,
		sort: '-created',
	});
}
export async function createGoal(data) {
	return pb.collection('owner_goals').create(data);
}
export async function updateGoal(id, data) {
	return pb.collection('owner_goals').update(id, data);
}
export async function deleteGoal(id) {
	return pb.collection('owner_goals').delete(id);
}

// ---- owner_expenses (Expense Center + Maintenance Center) ------------------
export async function listExpenses(userId, { category } = {}) {
	const filterParts = [`owner = "${userId}"`];
	if (category) filterParts.push(`category = "${category}"`);
	return pb.collection('owner_expenses').getFullList({
		filter: filterParts.join(' && '),
		sort: '-date',
	});
}
export async function createExpense(data) {
	return pb.collection('owner_expenses').create(data);
}
export async function updateExpense(id, data) {
	return pb.collection('owner_expenses').update(id, data);
}
export async function deleteExpense(id) {
	return pb.collection('owner_expenses').delete(id);
}

// ---- owner_tasks (Task Center) ---------------------------------------------
export async function listTasks(userId) {
	return pb.collection('owner_tasks').getFullList({
		filter: `owner = "${userId}"`,
		sort: '+due_date',
	});
}
export async function createTask(data) {
	return pb.collection('owner_tasks').create(data);
}
export async function updateTask(id, data) {
	return pb.collection('owner_tasks').update(id, data);
}
export async function deleteTask(id) {
	return pb.collection('owner_tasks').delete(id);
}

// ---- document_shares (Secure Sharing) --------------------------------------
// `token` is never sent — the server generates it (see task17-hooks.pb.js).
export async function createShare({ ownerId, docSource, docRefId, docField, label, expiresAt }) {
	return pb.collection('document_shares').create({
		owner: ownerId,
		doc_source: docSource,
		doc_ref_id: docRefId,
		doc_field: docField,
		label: label || '',
		expires_at: expiresAt || null,
	});
}
export async function listShares(userId) {
	return pb.collection('document_shares').getFullList({
		filter: `owner = "${userId}"`,
		sort: '-created',
	});
}
export async function revokeShare(id) {
	return pb.collection('document_shares').update(id, { revoked: true });
}
