/**
 * Integration Registry client — talks to the Express /integrations routes.
 *
 * Mirrors lib/aiProvidersClient.js's auth pattern exactly (same PocketBase
 * token header shape) — kept as a separate small client rather than merged
 * in, since this covers all external tools, not just AI providers.
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
		const err = new Error(body?.error || body?.message || `Request failed (${response.status})`);
		err.status = response.status;
		err.code = body?.error;
		err.body = body;
		throw err;
	}
	return body;
}

const integrationsClient = {
	list: () => request('/integrations'),
	create: (payload) => request('/integrations', { method: 'POST', body: JSON.stringify(payload) }),
	update: (id, patch) => request(`/integrations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
	remove: (id) => request(`/integrations/${id}`, { method: 'DELETE' }),
	test: (id) => request(`/integrations/${id}/test`, { method: 'POST' }),
};

export default integrationsClient;
