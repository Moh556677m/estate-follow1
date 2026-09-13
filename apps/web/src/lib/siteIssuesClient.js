/**
 * Site Issues (Task #23) client — talks to the Express /site-issues routes.
 * Mirrors lib/integrationsClient.js's auth pattern exactly (same PocketBase
 * token header shape).
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
		throw err;
	}
	return body;
}

const siteIssuesClient = {
	list: (params = {}) => {
		const qs = new URLSearchParams(params).toString();
		return request(`/site-issues${qs ? `?${qs}` : ''}`);
	},
	update: (id, patch) => request(`/site-issues/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
	remove: (id) => request(`/site-issues/${id}`, { method: 'DELETE' }),
	scan: () => request('/site-issues/scan', { method: 'POST' }),
};

export default siteIssuesClient;
