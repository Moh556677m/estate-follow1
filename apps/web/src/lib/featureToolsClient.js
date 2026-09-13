// Task #17 — Express-backed pieces of the Central Features system:
// AI Portfolio Advisor (/portfolio-advisor/*) and Secure Sharing's public
// resolution route (/public/document-shares/:token). Follows the exact same
// API_SERVER_URL + Authorization-header convention already used in
// aiProvidersClient.js / paymentGateways.js rather than inventing a new one.

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
		err.body = body;
		throw err;
	}
	return body;
}

// ---- AI Portfolio Advisor ---------------------------------------------------
export async function getPortfolioAdvisorStatus() {
	return request('/portfolio-advisor/status', { method: 'GET' });
}
export async function getPortfolioInsights() {
	return request('/portfolio-advisor/insights', { method: 'POST' });
}

// ---- Secure Sharing (public resolution — no auth token needed, but sending
// one if present is harmless since the route ignores it) -------------------
export async function resolveShareToken(token) {
	return request(`/public/document-shares/${encodeURIComponent(token)}`, { method: 'GET' });
}
