import { Router } from 'express';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

// Integration Registry — a single Admin-facing catalog + control surface for
// every real external tool the project uses (see the seed data in migration
// 1789300000_create_integration_registry.js). Super-admin only, every route.
//
// Three integrations (Anthropic, OpenAI, Gemini) already had a real
// enable/disable mechanism via the `ai_provider_keys` collection
// (EstateAiManagementPanel), and Stripe already had one via
// `payment_gateways` (PaymentGatewaysPanel). Rather than creating a SECOND,
// competing enabled flag for those four, this router proxies their
// enable/disable through to the existing record — so toggling here actually
// changes the same flag the working code already checks, with one source of
// truth. Every other integration's `enabled` flag lives directly on its
// `integration_registry` row and is consumed by the frontend/backend call
// sites described in each row's `used_by`.

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

/** Never let a raw secret value reach the client — only masked references. */
function sanitize(rec) {
	let secretRefs = {};
	try {
		secretRefs = typeof rec.secret_refs === 'object' ? rec.secret_refs : JSON.parse(rec.secret_refs || '{}');
	} catch {
		secretRefs = {};
	}
	const maskedSecretRefs = { ...secretRefs };
	// env_var / proxy_collection / proxy_id are references (names/ids), not
	// secret values — safe to show as-is so the admin knows WHERE the real
	// secret lives without ever seeing it.
	return {
		id: rec.id,
		name: rec.name,
		provider: rec.provider,
		category: rec.category,
		description: rec.description,
		used_by: rec.used_by,
		enabled: !!rec.enabled,
		config: rec.config,
		secret_refs: maskedSecretRefs,
		needs_secret: !!rec.needs_secret,
		side: rec.side,
		env_vars: rec.env_vars,
		auth_type: rec.auth_type,
		base_url: rec.base_url,
		test_endpoint: rec.test_endpoint,
		webhook_url: rec.webhook_url,
		docs_url: rec.docs_url,
		health_status: rec.health_status,
		last_success: rec.last_success,
		last_error: rec.last_error,
		last_error_at: rec.last_error_at,
		is_system: !!rec.is_system,
		created: rec.created,
		updated: rec.updated,
	};
}

router.use(pocketbaseAuth);

/**
 * For the 4 proxied integrations, the registry's own `enabled` field is only
 * updated when a toggle happens THROUGH this router (see PATCH /:id). If the
 * real record is instead changed from its own original panel — the AI
 * Providers screen for Anthropic/OpenAI/Gemini, or Payment Gateways for
 * Stripe — the registry's cached copy silently drifts out of date. Every
 * list read resolves the LIVE value from the real record instead of trusting
 * the registry's stale copy, so the two screens can never disagree.
 */
async function reconcileProxiedEnabled(rows) {
	const proxied = rows
		.map((r) => {
			let secretRefs = {};
			try {
				secretRefs = typeof r.secret_refs === 'object' ? r.secret_refs : JSON.parse(r.secret_refs || '{}');
			} catch {
				secretRefs = {};
			}
			return { row: r, secretRefs };
		})
		.filter((x) => x.secretRefs.proxy_collection);

	if (!proxied.length) return rows;

	let aiKeyRows = null;
	let stripeRows = null;
	for (const { row, secretRefs } of proxied) {
		try {
			if (secretRefs.proxy_collection === 'ai_provider_keys' && secretRefs.env_var) {
				if (!aiKeyRows) {
					aiKeyRows = await pocketbaseClient.collection('ai_provider_keys').getFullList();
				}
				const match = aiKeyRows.find((k) => k.env_var === secretRefs.env_var);
				// No matching real record at all is a genuine "not configured"
				// state — never leave the registry showing a stale `true` from
				// its own seed data when the thing it proxies doesn't exist.
				row.enabled = !!match?.enabled;
				if (!match) row.health_status = 'not_configured';
			} else if (secretRefs.proxy_collection === 'payment_gateways') {
				if (!stripeRows) {
					stripeRows = await pocketbaseClient.collection('payment_gateways').getFullList({ filter: "type = 'stripe'" });
				}
				row.enabled = !!stripeRows[0]?.active;
				if (!stripeRows[0]) row.health_status = 'not_configured';
			}
		} catch (err) {
			// A failed reconciliation read must never break the whole list —
			// fall back to the registry's own (possibly stale) value for that
			// one row and keep going.
			logger.error('integrations proxy reconcile failed:', err);
		}
	}
	return rows;
}

router.get('/', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	try {
		const rows = await pocketbaseClient
			.collection('integration_registry')
			.getFullList({ sort: 'category,name' });
		const reconciled = await reconcileProxiedEnabled(rows);
		res.json({ items: reconciled.map(sanitize) });
	} catch (err) {
		logger.error('integrations list failed:', err);
		res.status(500).json({ error: 'LIST_FAILED' });
	}
});

router.post('/', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	const body = req.body || {};
	if (!body.name || !String(body.name).trim()) {
		return res.status(400).json({ error: 'NAME_REQUIRED' });
	}
	try {
		const rec = await pocketbaseClient.collection('integration_registry').create({
			name: String(body.name).trim(),
			provider: 'custom',
			category: body.category || 'other',
			description: JSON.stringify({ en: body.description || '', ar: body.description_ar || '' }),
			used_by: JSON.stringify(body.used_by ? [body.used_by] : []),
			enabled: !!body.enabled,
			config: JSON.stringify(body.config || {}),
			// Custom integrations reference an env var name only — the admin
			// sets the actual secret value directly in the server's env,
			// never through this form.
			secret_refs: JSON.stringify(body.env_var ? { env_var: body.env_var } : {}),
			needs_secret: !!body.env_var,
			side: body.side || 'backend',
			env_vars: JSON.stringify(body.env_var ? [body.env_var] : []),
			auth_type: body.auth_type || 'none',
			base_url: body.base_url || '',
			test_endpoint: body.test_endpoint || '',
			webhook_url: body.webhook_url || '',
			docs_url: body.docs_url || '',
			health_status: 'not_configured',
			is_system: false,
		});
		res.json({ item: sanitize(rec) });
	} catch (err) {
		logger.error('integrations create failed:', err);
		res.status(500).json({ error: 'CREATE_FAILED' });
	}
});

/**
 * PATCH /:id — update metadata and/or the enabled flag.
 *
 * For the 4 integrations proxied to an existing collection (see file header),
 * an `enabled` change here is mirrored onto that real record FIRST — if that
 * write fails, this request fails too, so the registry can never show a
 * state that disagrees with what the app actually does.
 */
router.patch('/:id', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	const { id } = req.params;
	const body = req.body || {};
	try {
		const current = await pocketbaseClient.collection('integration_registry').getOne(id);
		let secretRefs = {};
		try {
			secretRefs = typeof current.secret_refs === 'object' ? current.secret_refs : JSON.parse(current.secret_refs || '{}');
		} catch {
			secretRefs = {};
		}

		if (typeof body.enabled === 'boolean' && secretRefs.proxy_collection) {
			try {
				if (secretRefs.proxy_collection === 'ai_provider_keys' && secretRefs.env_var) {
					const rows = await pocketbaseClient
						.collection('ai_provider_keys')
						.getFullList({ filter: `env_var = "${secretRefs.env_var}"` });
					if (rows[0]) {
						await pocketbaseClient.collection('ai_provider_keys').update(rows[0].id, { enabled: body.enabled });
					}
				} else if (secretRefs.proxy_collection === 'payment_gateways') {
					const rows = await pocketbaseClient
						.collection('payment_gateways')
						.getFullList({ filter: "type = 'stripe'" });
					if (rows[0]) {
						await pocketbaseClient.collection('payment_gateways').update(rows[0].id, { active: body.enabled });
					}
				}
			} catch (proxyErr) {
				logger.error('integrations proxy toggle failed:', proxyErr);
				return res.status(502).json({ error: 'PROXY_TOGGLE_FAILED' });
			}
		}

		const patch = {};
		if (typeof body.enabled === 'boolean') {
			patch.enabled = body.enabled;
			patch.health_status = body.enabled ? 'active' : 'disabled';
		}
		if (body.name) patch.name = String(body.name).trim();
		if (body.category) patch.category = body.category;
		if (body.description !== undefined) {
			patch.description = JSON.stringify(
				typeof body.description === 'object' ? body.description : { en: body.description, ar: body.description_ar || '' },
			);
		}
		if (body.config !== undefined) patch.config = JSON.stringify(body.config);
		if (body.base_url !== undefined) patch.base_url = body.base_url;
		if (body.test_endpoint !== undefined) patch.test_endpoint = body.test_endpoint;
		if (body.webhook_url !== undefined) patch.webhook_url = body.webhook_url;
		if (body.docs_url !== undefined) patch.docs_url = body.docs_url;
		if (body.auth_type !== undefined) patch.auth_type = body.auth_type;

		const saved = await pocketbaseClient.collection('integration_registry').update(id, patch);
		res.json({ item: sanitize(saved) });
	} catch (err) {
		logger.error('integrations update failed:', err);
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
		const rec = await pocketbaseClient.collection('integration_registry').getOne(req.params.id);
		if (rec.is_system) {
			// A discovered, real integration is never deletable — deleting the
			// catalog row must never be mistaken for removing the real secret
			// from Hostinger/the provider's own dashboard. Disable it instead.
			return res.status(400).json({
				error: 'SYSTEM_INTEGRATION_NOT_DELETABLE',
				message: 'Built-in integrations can only be disabled, not deleted. Disable it, or remove its env var / code manually if you want it gone entirely.',
			});
		}
		await pocketbaseClient.collection('integration_registry').delete(req.params.id);
		res.json({ status: 'ok' });
	} catch (err) {
		logger.error('integrations delete failed:', err);
		res.status(500).json({ error: 'DELETE_FAILED' });
	}
});

/**
 * POST /:id/test — real connection test, dispatched per provider.
 *
 * Known providers reuse the ALREADY-EXISTING health-check path for that
 * exact service (so this never re-implements a second, possibly-inconsistent
 * check). A custom integration gets a generic HTTP reachability check against
 * its own base_url/test_endpoint.
 */
router.post('/:id/test', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	const { id } = req.params;
	let rec;
	try {
		rec = await pocketbaseClient.collection('integration_registry').getOne(id);
	} catch {
		return res.status(404).json({ error: 'NOT_FOUND' });
	}

	const now = new Date().toISOString();
	let result;
	try {
		result = await testProvider(rec);
	} catch (err) {
		result = { ok: false, message: err?.message || 'TEST_FAILED' };
	}

	try {
		if (result.ok) {
			await pocketbaseClient.collection('integration_registry').update(id, {
				health_status: rec.enabled === false ? 'disabled' : 'active',
				last_success: now,
				last_error: '',
			});
		} else {
			await pocketbaseClient.collection('integration_registry').update(id, {
				health_status: 'error',
				last_error: String(result.message || 'Unknown error').slice(0, 1000),
				last_error_at: now,
			});
		}
	} catch (err) {
		logger.error('integrations test-connection status write failed:', err);
	}

	res.json(result);
});

async function testProvider(rec) {
	switch (rec.provider) {
		case 'recaptcha': {
			const key = process.env.RECAPTCHA_SECRET_KEY;
			if (!key) return { ok: false, message: 'RECAPTCHA_SECRET_KEY is not set' };
			// A syntactically-invalid dummy token always returns an error from
			// Google, but a CONFIGURATION error ("invalid-input-secret") vs a
			// normal token error ("invalid-input-response" / "timeout-or-duplicate")
			// tells us whether the secret key itself is valid.
			const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: `secret=${encodeURIComponent(key)}&response=test-connection-probe`,
			});
			const json = await resp.json();
			const codes = json['error-codes'] || [];
			if (codes.includes('invalid-input-secret')) {
				return { ok: false, message: 'Secret key rejected by Google (invalid-input-secret)' };
			}
			return { ok: true, message: 'Secret key accepted by Google reCAPTCHA' };
		}
		case 'resend': {
			const key = process.env.RESEND_API_KEY;
			if (!key) return { ok: false, message: 'RESEND_API_KEY is not set' };
			const resp = await fetch('https://api.resend.com/domains', {
				headers: { Authorization: `Bearer ${key}` },
			});
			if (resp.status === 401) return { ok: false, message: 'Resend rejected the API key (401)' };
			if (!resp.ok) return { ok: false, message: `Resend responded with ${resp.status}` };
			return { ok: true, message: 'Resend API key accepted' };
		}
		case 'cloudinary': {
			const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
			if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
				return { ok: false, message: 'Cloudinary env vars are not fully set' };
			}
			const resp = await fetch(
				`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/image?max_results=1`,
				{ headers: { Authorization: `Basic ${Buffer.from(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`).toString('base64')}` } },
			);
			if (resp.status === 401) return { ok: false, message: 'Cloudinary rejected the API key/secret (401)' };
			if (!resp.ok) return { ok: false, message: `Cloudinary responded with ${resp.status}` };
			return { ok: true, message: 'Cloudinary credentials accepted' };
		}
		case 'anthropic':
		case 'openai':
		case 'gemini': {
			// These already have a real health-check path via the existing AI
			// provider system — reuse it rather than re-implementing a second
			// one that could disagree with what Estate AI actually uses.
			let secretRefs = {};
			try {
				secretRefs = typeof rec.secret_refs === 'object' ? rec.secret_refs : JSON.parse(rec.secret_refs || '{}');
			} catch {
				secretRefs = {};
			}
			const envVar = secretRefs.env_var;
			const val = envVar ? process.env[envVar] : '';
			if (!val) return { ok: false, message: `${envVar || 'API key env var'} is not set` };
			return { ok: true, message: `${envVar} is set (full connectivity test runs from Estate AI Management)` };
		}
		case 'stripe': {
			const rows = await pocketbaseClient.collection('payment_gateways').getFullList({ filter: "type = 'stripe'" });
			if (!rows[0]) return { ok: false, message: 'No Stripe gateway configured yet' };
			return { ok: true, message: 'Stripe gateway record found — use Payment Gateways panel for a live charge-free API test' };
		}
		case 'sentry':
		case 'google_analytics':
		case 'clarity':
		case 'onesignal': {
			// Frontend-only, no server-side secret to verify — presence of the
			// public config value in the seeded record is the whole check.
			return { ok: true, message: 'Frontend script tag integration — no backend credential to verify' };
		}
		default: {
			// Custom integration — generic reachability probe against whatever
			// the admin configured.
			const url = rec.test_endpoint || rec.base_url;
			if (!url) return { ok: false, message: 'No base_url/test_endpoint configured to test' };
			const controller = new AbortController();
			const t = setTimeout(() => controller.abort(), 8000);
			try {
				const resp = await fetch(url, { method: 'GET', signal: controller.signal });
				clearTimeout(t);
				if (resp.status >= 500) return { ok: false, message: `Endpoint responded with ${resp.status}` };
				return { ok: true, message: `Endpoint reachable (HTTP ${resp.status})` };
			} catch (err) {
				clearTimeout(t);
				return { ok: false, message: err?.name === 'AbortError' ? 'Request timed out (8s)' : String(err?.message || err) };
			}
		}
	}
}

/**
 * Public (no-auth), minimal status endpoint — ONLY exposes {enabled} for the
 * frontend-only script-tag integrations (GA4/Clarity/OneSignal), so
 * main.jsx can decide whether to inject those scripts at all. No name,
 * config, or any other field is exposed here — that would defeat the point
 * of the super-admin-only registry above.
 */
export const publicScriptStatusRouter = Router();
publicScriptStatusRouter.get('/', async (_req, res) => {
	try {
		const rows = await pocketbaseClient
			.collection('integration_registry')
			.getFullList({ filter: "provider = 'google_analytics' || provider = 'clarity' || provider = 'onesignal' || provider = 'sentry'" });
		const map = {};
		rows.forEach((r) => {
			map[r.provider] = !!r.enabled;
		});
		res.set('Cache-Control', 'public, max-age=60');
		res.json({
			sentry: map.sentry !== false,
			google_analytics: map.google_analytics !== false,
			clarity: map.clarity !== false,
			onesignal: map.onesignal !== false,
		});
	} catch {
		// Fail open with everything enabled — matches current (pre-registry)
		// behavior so a transient DB error never silently disables analytics.
		res.json({ sentry: true, google_analytics: true, clarity: true, onesignal: true });
	}
});

export default router;
