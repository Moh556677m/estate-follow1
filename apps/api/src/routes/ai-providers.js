import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import logger from '../utils/logger.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import {
	AI_SECTIONS,
	AI_PROVIDERS,
	maskKey,
	listProviderKeys,
	resolveProviderKey,
	sectionLabel,
	providerLabel,
} from '../lib/aiProviders.js';

const router = Router();

const ENV_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../.env',
);
const STAFF_ROLES = ['admin', 'editor', 'support', 'custom'];
const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';

/** Persist a KEY=value line into apps/api/.env (replace existing or append). */
function writeEnvKey(keyName, value) {
	let content = '';
	try {
		content = fs.readFileSync(ENV_PATH, 'utf8');
	} catch {
		content = '';
	}
	const lines = content.split('\n');
	const regex = new RegExp(`^\\s*${keyName}\\s*=`);
	let found = false;
	const next = lines.map((line) => {
		if (regex.test(line)) {
			found = true;
			return `${keyName}=${value}`;
		}
		return line;
	});
	if (!found) {
		next.push(`${keyName}=${value}`);
	}
	fs.writeFileSync(ENV_PATH, `${next.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

/** Validate an env var name: uppercase letters, digits, underscores, 2–80 chars. */
function isValidEnvVar(name) {
	return /^[A-Z][A-Z0-9_]{1,79}$/.test(String(name || ''));
}

async function requireStaff(req) {
	const userId = req.pocketbaseUserId;
	if (!userId) {
		const e = new Error('AI_PROVIDERS_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	let record;
	try {
		record = await pocketbaseClient.collection('users').getOne(userId);
	} catch {
		const e = new Error('AI_PROVIDERS_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	const isSuper =
		!!record.is_super_admin ||
		String(record.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
	const isStaff = isSuper || STAFF_ROLES.includes(record.role);
	if (!isStaff) {
		const e = new Error('AI_PROVIDERS_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	return record;
}

// IMPORTANT: this middleware must be scoped to '/ai-providers' specifically,
// never registered as a bare `router.use(pocketbaseAuth)`. This router is
// mounted at the API router's own bare root (`router.use('/', aiProvidersRouter)`
// in routes/index.js), which itself is mounted at the app's bare root
// (`app.use('/', apiRouter)` in main.js, kept for backward compatibility).
// That means EVERY request that isn't matched earlier — including frontend
// page loads like /admin/login, /admin/*, /editor/* — flows into this router.
// An unscoped `router.use(pocketbaseAuth)` here previously intercepted all of
// those unrelated requests too: with no Authorization header (the normal case
// for a fresh page load), pocketbaseAuth called next(unauthorizedError(...)),
// which skipped every remaining route/middleware (including the SPA fallback)
// and landed straight on the generic error handler — producing exactly the
// {"message":"Something went wrong!"} response reported for /admin/login.
// Scoping the middleware to '/ai-providers' keeps the exact same auth
// behavior for this feature's own endpoints while letting unrelated paths
// fall through untouched, as they should.
router.use('/ai-providers', pocketbaseAuth);

/* Catalog of assignable sections + supported providers (for the admin UI). */
router.get('/ai-providers/sections', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	res.json({
		sections: AI_SECTIONS.map((s) => ({ key: s.key, ar: s.ar, en: s.en })),
		providers: AI_PROVIDERS.map((p) => ({
			key: p.key,
			ar: p.ar,
			en: p.en,
			defaultEnv: p.defaultEnv,
		})),
	});
});

/* List all provider keys (metadata only — raw key never returned). */
router.get('/ai-providers', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	try {
		const keys = await listProviderKeys();
		res.json({ keys });
	} catch (err) {
		logger.error('ai-providers: list failed', {
			error: String(err?.message || err).slice(0, 200),
		});
		res.status(500).json({ error: 'AI_PROVIDERS_LIST_FAILED' });
	}
});

/* Resolve the active provider for a section (admin status check). */
router.get('/ai-providers/resolve/:section', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	const { section } = req.params;
	const resolved = await resolveProviderKey(section);
	res.json({
		section,
		active: !!resolved,
		provider: resolved
			? {
					name: resolved.name,
					provider: resolved.provider,
					providerLabel: providerLabel(resolved.provider, 'en'),
					env_var: resolved.env_var,
				}
			: null,
	});
});

/* Create a new provider key. The secret is written to apps/api/.env; only
 * metadata + a masked preview are stored in PocketBase. */
router.post('/ai-providers', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}

	const { name, provider, env_var, sections, enabled, key_value, notes } =
		req.body || {};

	const label = String(name || '').trim();
	const envVar = String(env_var || '').trim().toUpperCase();
	const providerKey = String(provider || 'custom').trim().toLowerCase();
	const sectionList = Array.isArray(sections) ? sections : [];
	const noteText = String(notes || '').trim();
	const secret = String(key_value || '').trim();

	if (!label) {
		return res.status(422).json({ error: 'AI_PROVIDERS_NAME_REQUIRED' });
	}
	if (!AI_PROVIDERS.some((p) => p.key === providerKey)) {
		return res.status(422).json({ error: 'AI_PROVIDERS_INVALID_PROVIDER' });
	}
	if (!isValidEnvVar(envVar)) {
		return res.status(422).json({ error: 'AI_PROVIDERS_INVALID_ENV_VAR' });
	}
	const validSections = sectionList.filter((s) =>
		AI_SECTIONS.some((x) => x.key === s),
	);
	if (validSections.length === 0) {
		return res.status(422).json({ error: 'AI_PROVIDERS_SECTIONS_REQUIRED' });
	}

	// If a secret is provided, persist it to .env and apply in-memory.
	if (secret) {
		try {
			writeEnvKey(envVar, secret);
			process.env[envVar] = secret;
		} catch (err) {
			logger.error('ai-providers: env write failed', {
				error: String(err?.message || err).slice(0, 160),
			});
			return res.status(500).json({ error: 'AI_PROVIDERS_ENV_WRITE_FAILED' });
		}
	}

	const masked = maskKey(secret || String(process.env[envVar] ?? ''));

	try {
		const record = await pocketbaseClient.collection('ai_provider_keys').create({
			name: label,
			provider: providerKey,
			env_var: envVar,
			sections: validSections,
			enabled: enabled !== false,
			masked_key: masked,
			notes: noteText,
		});
		logger.info('ai-providers: key created', {
			id: record.id,
			name: label,
			provider: providerKey,
			envVar,
			mask: masked,
			sections: validSections,
		});
		res.json({
			id: record.id,
			name: label,
			provider: providerKey,
			env_var: envVar,
			sections: validSections,
			enabled: enabled !== false,
			masked_key: masked,
			configured: !!String(process.env[envVar] ?? '').trim(),
			notes: noteText,
		});
	} catch (err) {
		logger.error('ai-providers: create failed', {
			error: String(err?.message || err).slice(0, 200),
		});
		res.status(500).json({ error: 'AI_PROVIDERS_CREATE_FAILED' });
	}
});

/* Update a provider key's metadata. Optionally rotate the secret. */
router.patch('/ai-providers/:id', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}

	const { id } = req.params;
	let existing;
	try {
		existing = await pocketbaseClient
			.collection('ai_provider_keys')
			.getOne(id);
	} catch {
		return res.status(404).json({ error: 'AI_PROVIDERS_NOT_FOUND' });
	}

	const {
		name,
		provider,
		env_var,
		sections,
		enabled,
		notes,
		key_value,
	} = req.body || {};

	const patch = {};
	if (name !== undefined) {
		const label = String(name || '').trim();
		if (!label) return res.status(422).json({ error: 'AI_PROVIDERS_NAME_REQUIRED' });
		patch.name = label;
	}
	if (provider !== undefined) {
		const providerKey = String(provider || 'custom').trim().toLowerCase();
		if (!AI_PROVIDERS.some((p) => p.key === providerKey)) {
			return res.status(422).json({ error: 'AI_PROVIDERS_INVALID_PROVIDER' });
		}
		patch.provider = providerKey;
	}
	if (env_var !== undefined) {
		const envVar = String(env_var || '').trim().toUpperCase();
		if (!isValidEnvVar(envVar)) {
			return res.status(422).json({ error: 'AI_PROVIDERS_INVALID_ENV_VAR' });
		}
		patch.env_var = envVar;
	}
	if (sections !== undefined) {
		const sectionList = Array.isArray(sections) ? sections : [];
		const validSections = sectionList.filter((s) =>
			AI_SECTIONS.some((x) => x.key === s),
		);
		if (validSections.length === 0) {
			return res.status(422).json({ error: 'AI_PROVIDERS_SECTIONS_REQUIRED' });
		}
		patch.sections = validSections;
	}
	if (enabled !== undefined) patch.enabled = !!enabled;
	if (notes !== undefined) patch.notes = String(notes || '').trim();

	// Rotate the secret if a new key_value is provided.
	const secret = String(key_value || '').trim();
	const finalEnvVar = patch.env_var || existing.env_var;
	if (secret) {
		try {
			writeEnvKey(finalEnvVar, secret);
			process.env[finalEnvVar] = secret;
		} catch (err) {
			logger.error('ai-providers: env write failed on update', {
				error: String(err?.message || err).slice(0, 160),
			});
			return res.status(500).json({ error: 'AI_PROVIDERS_ENV_WRITE_FAILED' });
		}
		patch.masked_key = maskKey(secret);
	} else {
		// Refresh the masked preview from the live env so it stays accurate.
		patch.masked_key = maskKey(String(process.env[finalEnvVar] ?? ''));
	}

	try {
		const updated = await pocketbaseClient
			.collection('ai_provider_keys')
			.update(id, patch);
		logger.info('ai-providers: key updated', {
			id,
			mask: patch.masked_key,
			rotated: !!secret,
		});
		res.json({
			id: updated.id,
			name: updated.name,
			provider: updated.provider,
			env_var: updated.env_var,
			sections: updated.sections,
			enabled: !!updated.enabled,
			masked_key: updated.masked_key,
			configured: !!String(process.env[updated.env_var] ?? '').trim(),
			notes: updated.notes || '',
		});
	} catch (err) {
		logger.error('ai-providers: update failed', {
			error: String(err?.message || err).slice(0, 200),
		});
		res.status(500).json({ error: 'AI_PROVIDERS_UPDATE_FAILED' });
	}
});

/* Rotate just the secret value (metadata untouched). */
router.post('/ai-providers/:id/rotate', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	const { id } = req.params;
	let existing;
	try {
		existing = await pocketbaseClient
			.collection('ai_provider_keys')
			.getOne(id);
	} catch {
		return res.status(404).json({ error: 'AI_PROVIDERS_NOT_FOUND' });
	}
	const secret = String(req.body?.key_value || '').trim();
	if (!secret) {
		return res.status(422).json({ error: 'AI_PROVIDERS_KEY_REQUIRED' });
	}
	try {
		writeEnvKey(existing.env_var, secret);
		process.env[existing.env_var] = secret;
	} catch (err) {
		logger.error('ai-providers: env write failed on rotate', {
			error: String(err?.message || err).slice(0, 160),
		});
		return res.status(500).json({ error: 'AI_PROVIDERS_ENV_WRITE_FAILED' });
	}
	const masked = maskKey(secret);
	try {
		await pocketbaseClient
			.collection('ai_provider_keys')
			.update(id, { masked_key: masked });
	} catch (err) {
		logger.error('ai-providers: rotate mask update failed', {
			error: String(err?.message || err).slice(0, 160),
		});
	}
	logger.info('ai-providers: key rotated', { id, mask: masked });
	res.json({ id, masked_key: masked, configured: true });
});

/* Delete a provider key record. Clears the env var so the secret does not
 * linger after the admin removes the key. */
router.delete('/ai-providers/:id', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	const { id } = req.params;
	let existing;
	try {
		existing = await pocketbaseClient
			.collection('ai_provider_keys')
			.getOne(id);
	} catch {
		return res.status(404).json({ error: 'AI_PROVIDERS_NOT_FOUND' });
	}
	try {
		await pocketbaseClient.collection('ai_provider_keys').delete(id);
	} catch (err) {
		logger.error('ai-providers: delete failed', {
			error: String(err?.message || err).slice(0, 200),
		});
		return res.status(500).json({ error: 'AI_PROVIDERS_DELETE_FAILED' });
	}
	// Best-effort: clear the secret from .env + process.env.
	try {
		writeEnvKey(existing.env_var, '');
	} catch {
		/* ignore */
	}
	process.env[existing.env_var] = '';
	logger.info('ai-providers: key deleted', { id, envVar: existing.env_var });
	res.json({ ok: true });
});

export default router;
