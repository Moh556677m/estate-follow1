import { Router } from 'express';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import { resolveProviderForSection } from '../lib/aiProviders.js';
import logger from '../utils/logger.js';

// Task #17 — AI Portfolio Advisor. Generates insights ONLY from the
// requesting owner's own portfolio data (properties/payments/expenses
// already stored) — never invented numbers, never another owner's data.
//
// Reuses the existing AI Provider Layer (apps/api/src/lib/aiProviders.js)
// rather than a second AI-calling code path: the 'portfolio_advisor' section
// was added there so this route consumes whatever key an admin assigns to
// it exactly like /integrated-ai/extract-property does for 'add_property'.

const router = Router();
router.use(pocketbaseAuth);

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

function getAdvisorModel() {
	return process.env.ANTHROPIC_ADVISOR_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
}

// ---------------------------------------------------------------------------
// Server-side entitlement gate. INTENTIONALLY mirrors
// apps/pocketbase/pb_hooks/lib-feature-gate.js's requireFeature() logic
// (enabled / account_type / plan / min_property_count / limit_by_plan) so a
// direct call to this Express route can never grant something the PB-side
// gate (used by every other new Task #17 route) would refuse. Duplicated
// rather than shared because this runs in Node, not the PB JSVM — kept in
// sync by design, same relationship as plan-entitlement.pb.js <->
// lib-feature-gate.js already have.
// ---------------------------------------------------------------------------
function asArray(v) {
	try {
		const parsed = typeof v === 'string' ? JSON.parse(v) : v;
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
function asObject(v) {
	try {
		const parsed = typeof v === 'string' ? JSON.parse(v) : v;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

async function requireFeatureServerSide(userRecord, featureKey) {
	const isStaff =
		!!userRecord?.is_super_admin ||
		['admin', 'editor', 'support', 'custom'].includes(String(userRecord?.role || ''));
	if (isStaff) return { available: true, reason: '' };

	let row = null;
	try {
		row = await pocketbaseClient.collection('feature_entitlements').getFirstListItem(
			`feature_key = "${featureKey}"`,
		);
	} catch {
		row = null;
	}
	if (!row) return { available: false, reason: 'feature_not_configured' };
	if (row.enabled === false) return { available: false, reason: 'disabled_by_admin' };

	const accountType = String(userRecord?.account_type || 'owner');
	const allowedTypes = asArray(row.allowed_account_types);
	if (allowedTypes.length > 0 && !allowedTypes.includes(accountType)) {
		return { available: false, reason: 'account_type_not_eligible' };
	}

	const pkgKey = String(userRecord?.subscription_package || 'none').trim().toLowerCase() || 'none';
	const allowedPlans = asArray(row.allowed_plans);
	if (allowedPlans.length > 0 && !allowedPlans.includes(pkgKey)) {
		return { available: false, reason: 'plan_not_eligible' };
	}

	const minProps = Number(row.min_property_count) || 0;
	if (minProps > 0) {
		let used = 0;
		try {
			const list = await pocketbaseClient.collection('properties').getList(1, 1, {
				filter: `owner = "${userRecord.id}" && status != "deleted" && status != "archived"`,
			});
			used = list.totalItems || 0;
		} catch {
			used = 0;
		}
		if (used < minProps) return { available: false, reason: 'min_property_count_not_met' };
	}

	const limitByPlan = asObject(row.limit_by_plan);
	const limit = limitByPlan[pkgKey] != null ? limitByPlan[pkgKey] : (limitByPlan.default != null ? limitByPlan.default : 0);
	if (limit === 0) return { available: false, reason: 'not_included_in_plan' };

	return { available: true, reason: '' };
}

// GET /portfolio-advisor/status — whether the feature is available to this
// user AND whether an active provider is assigned to the section, without
// spending a single AI call.
router.get('/status', async (req, res) => {
	try {
		const user = await pocketbaseClient.collection('users').getOne(req.pocketbaseUserId);
		const gate = await requireFeatureServerSide(user, 'ai_portfolio_advisor');
		const resolved = await resolveProviderForSection('portfolio_advisor', null);
		res.json({
			available: gate.available,
			reason: gate.reason,
			provider_configured: !!resolved,
			provider_type: resolved?.provider || null,
			provider_supported: !resolved || resolved.provider === 'claude',
		});
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Could not load status' });
	}
});

// POST /portfolio-advisor/insights — generate insights from the owner's own
// portfolio data. Never touches another owner's rows (every query below is
// filtered by `owner = req.pocketbaseUserId`).
router.post('/insights', async (req, res) => {
	try {
		const user = await pocketbaseClient.collection('users').getOne(req.pocketbaseUserId);

		const gate = await requireFeatureServerSide(user, 'ai_portfolio_advisor');
		if (!gate.available) {
			return res.status(403).json({ error: gate.reason || 'feature_not_available' });
		}

		const resolved = await resolveProviderForSection('portfolio_advisor', null);
		if (!resolved) {
			return res.status(503).json({ error: 'no_active_provider', message: 'No AI provider is currently assigned to the Portfolio Advisor section. An admin must assign one in AI Providers settings.' });
		}
		if (resolved.provider !== 'claude') {
			// Honest fallback — see aiProviders.js's AI_SECTIONS comment for
			// 'portfolio_advisor': only 'claude' is actually implemented today.
			return res.status(501).json({ error: 'provider_not_supported', message: `The assigned provider type ("${resolved.provider}") is not yet implemented for the Portfolio Advisor. Only Anthropic Claude is supported for this section right now.` });
		}

		const apiKey = process.env[resolved.env_var];
		if (!apiKey) {
			return res.status(503).json({ error: 'provider_key_missing', message: 'The assigned provider key is not configured on the server.' });
		}

		// ---- gather ONLY this owner's real data ----
		const oid = req.pocketbaseUserId;
		const [properties, payments, expenses] = await Promise.all([
			pocketbaseClient.collection('properties').getFullList({
				filter: `owner = "${oid}" && status != "deleted" && status != "archived"`,
			}),
			pocketbaseClient.collection('payments').getFullList({
				filter: `owner = "${oid}"`,
				sort: '-due_date',
				requestKey: null,
			}).catch(() => []),
			pocketbaseClient.collection('owner_expenses').getFullList({
				filter: `owner = "${oid}"`,
			}).catch(() => []),
		]);

		const summary = {
			property_count: properties.length,
			properties: properties.slice(0, 50).map((p) => ({
				id: p.id,
				building: p.building,
				unit_number: p.unit_number,
				type: p.type,
				status: p.status,
			})),
			payments_summary: {
				total: payments.length,
				paid: payments.filter((p) => p.status === 'paid').length,
				overdue: payments.filter((p) => p.status === 'overdue').length,
				upcoming: payments.filter((p) => p.status === 'upcoming').length,
			},
			expenses_summary: {
				total_count: expenses.length,
				total_amount: expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0),
				by_category: expenses.reduce((acc, x) => {
					const c = x.category || 'other';
					acc[c] = (acc[c] || 0) + (Number(x.amount) || 0);
					return acc;
				}, {}),
			},
		};

		if (properties.length === 0) {
			return res.json({
				insights: [],
				message: 'No properties found in your portfolio yet — add a property to get insights.',
			});
		}

		const systemPrompt = 'You are a real-estate portfolio analyst. You are given a JSON summary of ONE owner\'s real property portfolio (property count, payment status breakdown, expense breakdown by category). Produce 3-6 short, concrete, actionable insights based ONLY on the numbers given — never invent figures, dates, or facts not present in the JSON. If the data is too sparse for a meaningful insight, say so plainly instead of guessing. Respond with a JSON array of strings only, no prose, no markdown fences.';

		const response = await fetch(ANTHROPIC_API_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': ANTHROPIC_VERSION,
			},
			body: JSON.stringify({
				model: getAdvisorModel(),
				max_tokens: 1200,
				system: systemPrompt,
				messages: [{ role: 'user', content: JSON.stringify(summary) }],
			}),
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => '');
			logger.error('portfolio-advisor: Anthropic API rejected the request', {
				status: response.status,
				body: String(errText || '').slice(0, 800),
			});
			return res.status(502).json({ error: 'ai_call_failed', message: `AI provider returned ${response.status}` });
		}

		const data = await response.json();
		const text = Array.isArray(data?.content)
			? data.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
			: '';

		let insights = [];
		try {
			const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
			const parsed = JSON.parse(cleaned);
			insights = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
		} catch {
			// Model didn't return clean JSON — surface the raw text as a single
			// insight rather than silently dropping the response.
			insights = text ? [text.trim()] : [];
		}

		res.json({ insights, generated_at: new Date().toISOString() });
	} catch (err) {
		logger.error('portfolio-advisor: insights failed', { err: String(err) });
		res.status(err.status || 500).json({ error: err.message || 'Could not generate insights' });
	}
});

export default router;
