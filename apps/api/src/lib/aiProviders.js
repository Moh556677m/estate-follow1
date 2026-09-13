/**
 * AI Providers — shared catalog + secure resolution helpers.
 *
 * The admin panel manages one or more AI provider keys (Claude, OpenAI, or any
 * future/custom provider). Each key record lives in the PocketBase
 * `ai_provider_keys` collection and stores ONLY metadata: a label, the provider
 * type, the env var name that holds the real secret, the site sections it is
 * responsible for, and an enabled flag. The secret value itself is never stored
 * in PocketBase — it lives in apps/api/.env, written by the Express
 * /ai-providers routes. This module is the single server-side source of truth
 * for resolving which key (if any) is active for a given site section, so every
 * AI call can verify activation + assignment before contacting the provider.
 */

import pocketbaseClient from '../utils/pocketbaseClient.js';
import { isIntegrationConfigured } from '../utils/integrationConfig.js';

/**
 * Catalog of site sections that can be assigned to a provider key.
 * Extensible — add a new entry here and it becomes selectable in the admin UI
 * and resolvable by resolveProviderKey(). No other change required.
 */
// Estate AI has been simplified to a SINGLE section: "add_property".
// This is the only site section any admin-managed AI provider key can be
// assigned to, and the only section that consumes those keys at runtime
// (via /integrated-ai/extract-property). The retired sections (chat,
// plan reader, Insights) are intentionally absent so they can no longer be
// assigned or resolved — and any stale assignment on an existing key is
// ignored by resolveProviderKey() and cleaned up by migration
// 1789133663_trim_ai_provider_key_sections.js.
export const AI_SECTIONS = [
	{
		key: 'add_property',
		ar: 'إضافة عقار بالذكاء الاصطناعي',
		en: 'AI Add Property',
	},
	// Task #17 — AI Portfolio Advisor. Only the 'claude' provider type is
	// actually implemented for this section today (see
	// apps/api/src/lib/portfolioAdvisor.js); a key assigned here with a
	// different provider type resolves normally (so the admin UI stays
	// generic) but the advisor route returns an honest "provider not
	// supported yet" response rather than silently calling nothing.
	{
		key: 'portfolio_advisor',
		ar: 'المستشار الذكي للمحفظة',
		en: 'AI Portfolio Advisor',
	},
];

/**
 * Catalog of supported AI providers. `defaultEnv` is only a UI suggestion when
 * creating a new key — the admin can override the env var name freely. Add a
 * new provider here to make it selectable in the admin panel.
 */
export const AI_PROVIDERS = [
	{
		key: 'claude',
		ar: 'Anthropic Claude',
		en: 'Anthropic Claude',
		defaultEnv: 'ANTHROPIC_API_KEY',
	},
	{
		key: 'openai',
		ar: 'OpenAI',
		en: 'OpenAI',
		defaultEnv: 'OPENAI_API_KEY',
	},
	{
		key: 'gemini',
		ar: 'Google Gemini',
		en: 'Google Gemini',
		defaultEnv: 'GEMINI_API_KEY',
	},
	{
		key: 'custom',
		ar: 'مزوّد مخصّص',
		en: 'Custom Provider',
		defaultEnv: 'CUSTOM_AI_API_KEY',
	},
];

/** Mask a secret for display: keep a short prefix + suffix, hide the middle. */
export function maskKey(value) {
	const v = String(value || '').trim();
	if (!v) return '';
	if (v.length <= 12) return `${v.slice(0, 4)}…${v.slice(-2)}`;
	return `${v.slice(0, 7)}…${v.slice(-4)}`;
}

function parseJson(value, fallback) {
	if (!value) return fallback;
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return fallback;
		}
	}
	return value;
}

function sectionLabel(key, lang = 'en') {
	const s = AI_SECTIONS.find((x) => x.key === key);
	if (!s) return key;
	return lang === 'ar' ? s.ar : s.en;
}

function providerLabel(key, lang = 'en') {
	const p = AI_PROVIDERS.find((x) => x.key === key);
	if (!p) return key;
	return lang === 'ar' ? p.ar : p.en;
}

/**
 * List all provider key records, augmented with a live `configured` boolean
 * (whether the env var currently holds a non-empty value) and a `masked_key`
 * preview recomputed from the live env. The raw key is NEVER included.
 */
export async function listProviderKeys() {
	const rows = await pocketbaseClient
		.collection('ai_provider_keys')
		.getFullList({ sort: 'created' });
	return rows.map((r) => {
		const envVar = String(r.env_var || '').trim();
		const raw = envVar ? String(process.env[envVar] ?? '').trim() : '';
		const sections = parseJson(r.sections, []);
		return {
			id: r.id,
			name: r.name || '',
			provider: r.provider || 'custom',
			providerLabel: providerLabel(r.provider, 'en'),
			env_var: envVar,
			sections,
			enabled: !!r.enabled,
			masked_key: maskKey(raw),
			configured: !!raw,
			notes: r.notes || '',
			created: r.created,
			updated: r.updated,
		};
	});
}

/**
 * Resolve the active provider key for a given site section.
 *
 * Returns { id, env_var, name, provider } for the first enabled key that is
 * (a) assigned to this section and (b) actually configured (its env var holds a
 * non-empty value). Returns null when no active+configured key is assigned.
 *
 * This is the "activation + assignment verification" every AI call runs before
 * contacting a provider — so a disabled, unassigned, or empty key never reaches
 * the upstream API, and the caller can surface a clear "no active provider"
 * message instead.
 */
export async function resolveProviderKey(section) {
	if (!section) return null;
	// Only catalog sections can resolve a key. Retired sections
	// (estate_ai_chat, plan_reader, insights) are rejected here even if a
	// stale key record still lists them, so they can never consume a key.
	if (!AI_SECTIONS.some((x) => x.key === section)) return null;
	let rows = [];
	try {
		rows = await pocketbaseClient
			.collection('ai_provider_keys')
			.getFullList({ sort: 'created' });
	} catch {
		return null;
	}
	for (const r of rows) {
		if (!r.enabled) continue;
		const sections = parseJson(r.sections, []);
		if (!Array.isArray(sections) || !sections.includes(section)) continue;
		const envVar = String(r.env_var || '').trim();
		if (!envVar || !isIntegrationConfigured(envVar)) continue;
		return {
			id: r.id,
			env_var: envVar,
			name: r.name || '',
			provider: r.provider || 'custom',
		};
	}
	return null;
}

/**
 * Resolve the env var name to use for a section, with a fallback to a legacy
 * env var (e.g. ANTHROPIC_API_KEY) so existing configured deployments keep
 * working even before the admin migrates to the new key records. Returns the
 * env var name when a key is available (configured), or null when no active
 * provider exists for the section.
 */
export async function resolveEnvVar(section, fallbackEnv = null) {
	const resolved = await resolveProviderKey(section);
	if (resolved && isIntegrationConfigured(resolved.env_var)) {
		return resolved.env_var;
	}
	if (fallbackEnv && isIntegrationConfigured(fallbackEnv)) {
		return fallbackEnv;
	}
	return null;
}

/**
 * Resolve the FULL active provider for a section — env var name AND provider
 * type — with a fallback to a legacy env var (treated as the Claude provider).
 * Reads the ai_provider_keys collection fresh on every call (no caching), so
 * an admin change to the provider, enabled flag, or section assignment is
 * reflected on the very next request. Returns { env_var, provider, name, id }
 * or null when no active+configured provider is assigned.
 */
export async function resolveProviderForSection(section, fallbackEnv = null) {
	const resolved = await resolveProviderKey(section);
	if (resolved) {
		return {
			env_var: resolved.env_var,
			provider: resolved.provider || 'claude',
			name: resolved.name || '',
			id: resolved.id || null,
		};
	}
	if (fallbackEnv && isIntegrationConfigured(fallbackEnv)) {
		return { env_var: fallbackEnv, provider: 'claude', name: '', id: null };
	}
	return null;
}

export { sectionLabel, providerLabel };
