import { Router } from 'express';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

// Task #23 — "مشاكل الموقع" (Site Issues), all three scopes the user
// confirmed: (1) platform-wide technical/data issues, (2) the same class of
// problem the existing SEO panel surfaces (this endpoint owns its own
// `site_pages` SEO summary only — see the Admin panel's link-out to the full
// SEO & AI Search panel instead of duplicating that panel's logic), and
// (3) real technical issues users hit — uncaught frontend JS errors and
// failed backend API requests.
//
// `site_issues` itself is Super-Admin-write-only at the DB rule level (same
// as integration_registry/site_pages) — an anonymous visitor never gets a
// direct PocketBase write token for it. Instead, THIS Express route's public
// `/report` endpoint is the only way an error reaches the collection from
// the browser, and it writes through the already-authenticated superuser
// `pocketbaseClient` (apps/api/src/utils/pocketbaseClient.js). That means
// error reports automatically inherit this app's existing `globalRateLimit`,
// `helmet`, and JSON body-size limits (main.js) instead of needing a second,
// separately-invented abuse-mitigation layer.

const router = Router();
const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';

async function requireSuperAdmin(req) {
	const userId = req.pocketbaseUserId;
	if (!userId) {
		const e = new Error('FORBIDDEN');
		e.status = 403;
		throw e;
	}
	let record;
	try {
		record = await pocketbaseClient.collection('users').getOne(userId);
	} catch {
		const e = new Error('FORBIDDEN');
		e.status = 403;
		throw e;
	}
	const isSuper =
		!!record.is_super_admin ||
		String(record.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
	if (!isSuper) {
		const e = new Error('FORBIDDEN');
		e.status = 403;
		throw e;
	}
	return record;
}

function clamp(v, max) {
	const s = String(v == null ? '' : v);
	return s.length > max ? s.slice(0, max) : s;
}

/**
 * Best-effort logger used both by /report (below) and by the Express error
 * middleware (see middleware/error.js). Never throws — a logging failure
 * must never affect the actual response the caller/user sees.
 */
export async function logSiteIssue({ source, severity, title, message, details, context }) {
	try {
		await pocketbaseClient.collection('site_issues').create({
			source,
			severity: severity || 'warning',
			title: clamp(title || 'Untitled issue', 300),
			message: clamp(message || '', 2000),
			details: details || {},
			context: context || {},
			status: 'open',
			fingerprint: clamp(`${source}:${title || ''}`, 200),
		});
	} catch (err) {
		logger.error('site_issues logging failed (non-fatal):', err?.message || err);
	}
}

// Public: the frontend's global JS-error/unhandled-rejection listener
// (App.jsx) posts here. Only js_error/api_error may originate from a
// browser — seo/data_integrity findings are only ever written by the scan
// route below, run by a Super Admin.
router.post('/report', async (req, res) => {
	const body = req.body || {};
	const source = body.source === 'api_error' ? 'api_error' : 'js_error';
	if (!body.title && !body.message) {
		return res.status(400).json({ error: 'EMPTY_REPORT' });
	}
	await logSiteIssue({
		source,
		severity: 'warning',
		title: body.title,
		message: body.message,
		details: { stack: clamp(body.stack, 8000) },
		context: {
			url: clamp(body.url, 500),
			user_agent: clamp(req.headers['user-agent'], 300),
			lang: clamp(body.lang, 10),
		},
	});
	// Always 204 — a reporting endpoint must never itself surface an error
	// to the page that is already failing.
	res.status(204).end();
});

router.use(pocketbaseAuth);

router.get('/', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	const { source, status } = req.query;
	const filters = [];
	if (source) filters.push(`source = '${String(source).replace(/'/g, "\\'")}'`);
	if (status) filters.push(`status = '${String(status).replace(/'/g, "\\'")}'`);
	try {
		const rows = await pocketbaseClient.collection('site_issues').getList(1, 300, {
			filter: filters.join(' && '),
			sort: '-created',
		});
		res.json({ items: rows.items });
	} catch (err) {
		logger.error('site_issues list failed:', err);
		res.status(500).json({ error: 'LIST_FAILED' });
	}
});

router.patch('/:id', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	const patch = {};
	if (req.body?.status) patch.status = req.body.status;
	if (typeof req.body?.resolved_note === 'string') patch.resolved_note = clamp(req.body.resolved_note, 1000);
	try {
		const rec = await pocketbaseClient.collection('site_issues').update(req.params.id, patch);
		res.json({ item: rec });
	} catch (err) {
		logger.error('site_issues update failed:', err);
		res.status(500).json({ error: 'UPDATE_FAILED' });
	}
});

router.delete('/:id', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	try {
		await pocketbaseClient.collection('site_issues').delete(req.params.id);
		res.json({ ok: true });
	} catch (err) {
		logger.error('site_issues delete failed:', err);
		res.status(500).json({ error: 'DELETE_FAILED' });
	}
});

/**
 * POST /scan — Super-Admin-triggered platform-wide data-integrity scan.
 * Bounded, explicit list of real checks (never invented/fake data):
 *   1. Properties stuck in "pending" review for more than 30 days.
 *   2. Payments referencing a property id that no longer exists (orphaned).
 *   3. Custom-role staff accounts with zero permissions granted.
 *   4. Custom site_pages (Task #22) published with zero content blocks.
 * Each finding is written once per scan run (no de-dup against older scans —
 * the admin panel groups by fingerprint for display instead), so re-running
 * the scan after a real fix naturally stops reporting it.
 */
router.post('/scan', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}

	const findings = [];
	const now = Date.now();
	const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

	try {
		// 1. Properties stuck in "pending" for 30+ days.
		const pendingProps = await pocketbaseClient.collection('properties').getFullList({
			filter: "status = 'pending'",
			fields: 'id,created,area,building',
		});
		pendingProps.forEach((p) => {
			const created = new Date(p.created).getTime();
			if (Number.isFinite(created) && now - created > THIRTY_DAYS_MS) {
				findings.push({
					source: 'data_integrity',
					severity: 'warning',
					title: 'Property stuck in pending review for 30+ days',
					message: `Property ${p.id} (${p.area || ''} ${p.building || ''}) has been pending since ${p.created}.`,
					details: { collection: 'properties', id: p.id },
				});
			}
		});
	} catch (err) {
		logger.error('site_issues scan (pending properties) failed:', err);
	}

	try {
		// 2. Payments referencing a property id that no longer exists.
		const payments = await pocketbaseClient.collection('payments').getFullList({
			fields: 'id,property',
		});
		const propertyIds = new Set(
			(await pocketbaseClient.collection('properties').getFullList({ fields: 'id' })).map((p) => p.id),
		);
		payments.forEach((pay) => {
			if (pay.property && !propertyIds.has(pay.property)) {
				findings.push({
					source: 'data_integrity',
					severity: 'critical',
					title: 'Payment references a deleted property',
					message: `Payment ${pay.id} points to property ${pay.property}, which no longer exists.`,
					details: { collection: 'payments', id: pay.id, missing_property: pay.property },
				});
			}
		});
	} catch (err) {
		logger.error('site_issues scan (orphaned payments) failed:', err);
	}

	try {
		// 3. Custom-role staff accounts with zero permissions granted — unlike
		// the "admin" role (which defaults to full access when unconfigured,
		// see lib/permissions.js), a "custom" role with an empty/all-false
		// permissions object is a locked-out account that can do nothing —
		// almost always an unfinished setup, worth flagging to the Super
		// Admin. (`permissions` is a PocketBase JSONField — the API already
		// rejects a non-JSON value at write time, so "malformed JSON" itself
		// is not a reachable state here; this check targets the real gap.)
		const customStaff = await pocketbaseClient.collection('users').getFullList({
			filter: "role = 'custom'",
			fields: 'id,email,permissions',
		});
		customStaff.forEach((u) => {
			const perms = u.permissions && typeof u.permissions === 'object' ? u.permissions : {};
			const hasAny = Object.values(perms).some(Boolean);
			if (!hasAny) {
				findings.push({
					source: 'data_integrity',
					severity: 'warning',
					title: 'Custom staff account has zero permissions granted',
					message: `User ${u.email || u.id} has role "custom" but no permission is enabled — this account can currently do nothing.`,
					details: { collection: 'users', id: u.id },
				});
			}
		});
	} catch (err) {
		logger.error('site_issues scan (malformed permissions) failed:', err);
	}

	try {
		// 4. Custom site_pages (Task #22) published with zero content blocks.
		const pages = await pocketbaseClient.collection('site_pages').getFullList({
			filter: "status = 'published' && is_core = false",
			fields: 'id,slug,blocks',
		});
		pages.forEach((p) => {
			let blocks = [];
			try {
				blocks = typeof p.blocks === 'string' ? JSON.parse(p.blocks) : p.blocks;
			} catch {
				blocks = [];
			}
			if (!Array.isArray(blocks) || blocks.length === 0) {
				findings.push({
					source: 'data_integrity',
					severity: 'warning',
					title: 'Published page has no content blocks',
					message: `/page/${p.slug} is published but has no content — visitors will see a blank page.`,
					details: { collection: 'site_pages', id: p.id, slug: p.slug },
				});
			}
		});
	} catch (err) {
		logger.error('site_issues scan (empty site_pages) failed:', err);
	}

	for (const f of findings) {
		await logSiteIssue(f);
	}

	res.json({ scanned: true, findings_created: findings.length });
});

export default router;
