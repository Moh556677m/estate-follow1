// Cloudinary upload helper — routes user-uploaded files through the Express
// /cloudinary/upload endpoint so the Cloudinary API secret never reaches the
// browser. Returns the hosted secure URL to store alongside the record.
//
// Also provides resolveCloudinaryUrl(): a display-layer resolver that prefers
// a Cloudinary URL field on a record and falls back to the original
// PocketBase file URL (so legacy files keep working).

import apiServerClient from '@/lib/apiServerClient';
import pb from '@/lib/pocketbaseClient';

function getPocketbaseToken() {
	const raw = localStorage.getItem('pocketbase_auth');
	if (!raw) return null;
	try {
		const bytes = new TextEncoder().encode(raw);
		return btoa(String.fromCharCode(...bytes));
	} catch {
		return null;
	}
}

let _configured = null;

// True when the backend Cloudinary keys are present. Cached for the session.
export async function isCloudinaryConfigured() {
	if (_configured !== null) return _configured;
	try {
		const res = await apiServerClient.fetch('/cloudinary/status');
		const data = await res.json();
		_configured = !!data?.configured;
	} catch {
		_configured = false;
	}
	return _configured;
}

// Upload a single File/Blob to Cloudinary via the Express signed endpoint.
// Returns { url, publicId, name } or throws on failure.
export async function uploadToCloudinary(file) {
	if (!file) return null;
	const token = getPocketbaseToken();
	const form = new FormData();
	form.append('file', file);

	const res = await apiServerClient.fetch('/cloudinary/upload', {
		method: 'POST',
		headers: {
			...(token && { Authorization: `Bearer ${token}` }),
		},
		body: form,
	});

	if (!res.ok) {
		let message = `Upload failed (${res.status})`;
		try {
			const parsed = await res.json();
			message = parsed?.error?.message || parsed?.message || message;
		} catch {
			/* ignore */
		}
		const err = new Error(message);
		err.status = res.status;
		throw err;
	}

	const data = await res.json();
	return {
		url: data.url,
		publicId: data.public_id,
		name: data.name || file.name,
	};
}

// Resolve a file's display URL. Prefers a Cloudinary URL stored on the record
// (urlField); falls back to the PocketBase file URL (fileField) for legacy
// records. Returns a string URL or null.
//
// `record` is a PocketBase record. `fileField` is the legacy file-field name
// (its value is the stored filename). `urlField` is the Cloudinary URL field.
export function resolveCloudinaryUrlSync(record, fileField, urlField) {
	if (!record) return null;
	const url = record[urlField];
	if (url && typeof url === 'string') return url;
	const filename = record[fileField];
	if (filename) return pb.files.getURL(record, filename);
	return null;
}

export default {
	isCloudinaryConfigured,
	uploadToCloudinary,
	resolveCloudinaryUrlSync,
};
