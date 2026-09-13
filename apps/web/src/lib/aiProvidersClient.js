/**
 * AI Providers client — talks to the Express /ai-providers routes.
 *
 * The raw API key value is ONLY sent from the browser to the server when the
 * admin creates or rotates a key (over the authenticated API, never stored in
 * client code). The server writes it to apps/api/.env and returns only a
 * masked preview + a `configured` boolean. This client never reads, holds, or
 * displays the full secret.
 */
const API_SERVER_URL = '/hcgi/api';

function getPocketbaseToken() {
	const pocketbaseToken = localStorage.getItem('pocketbase_auth');
	if (pocketbaseToken) {
		const bytes = new TextEncoder().encode(pocketbaseToken);
		const binary = String.fromCharCode(...bytes);
		return btoa(binary);
	}
	return null;
}

async function request(path, options = {}) {
	const token = getPocketbaseToken();
	const response = await window.fetch(API_SERVER_URL + path, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
			...(token && { Authorization: `Bearer ${token}` }),
		},
	});
	const text = await response.text();
	let body = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = { error: text };
	}
	if (!response.ok) {
		const err = new Error(body?.error || `Request failed (${response.status})`);
		err.status = response.status;
		err.code = body?.error;
		err.body = body;
		throw err;
	}
	return body;
}

const aiProvidersClient = {
	/** Catalog of assignable sections + supported providers. */
	getCatalog: () => request('/ai-providers/sections'),

	/** List all provider key records (metadata + masked preview only). */
	list: () => request('/ai-providers'),

	/** Resolve the active provider for a section (admin status check). */
	resolve: (section) => request(`/ai-providers/resolve/${encodeURIComponent(section)}`),

	/** Create a new provider key. `key_value` is the secret (sent once). */
	create: ({ name, provider, env_var, sections, enabled, key_value, notes }) =>
		request('/ai-providers', {
			method: 'POST',
			body: JSON.stringify({ name, provider, env_var, sections, enabled, key_value, notes }),
		}),

	/** Update metadata; optionally rotate the secret via `key_value`. */
	update: (id, patch) =>
		request(`/ai-providers/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(patch),
		}),

	/** Rotate only the secret value. */
	rotate: (id, key_value) =>
		request(`/ai-providers/${id}/rotate`, {
			method: 'POST',
			body: JSON.stringify({ key_value }),
		}),

	/** Delete the key record and clear its env var. */
	remove: (id) =>
		request(`/ai-providers/${id}`, { method: 'DELETE' }),
};

export default aiProvidersClient;
