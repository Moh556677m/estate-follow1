import { Router } from 'express';
import pocketbaseClient from '../utils/pocketbaseClient.js';

// Task #17 — Secure Sharing. PUBLIC resolution endpoint for a
// document_shares token (the viewer clicking a share link has no PocketBase
// session — that's the point of a share link), so this deliberately carries
// NO pocketbaseAuth middleware. Every safety check that matters lives here
// instead: the token must exist, not be revoked, not be past expires_at.
//
// Mirrors the exact `pocketbaseClient.files.getToken()` pattern already
// used (and tested, Task #16) for crypto-proof review in
// payment-gateways.js's GET /crypto/pending — the superuser-authenticated
// SDK client is the only thing that can mint a short-lived token for a
// `protected: true` file field, and Express is where that client lives (the
// PB JSVM side has no equivalent helper — see the comment in
// task17-hooks.pb.js for why this route is NOT implemented in pb_hooks).
//
// The record creation itself (POST) is NOT here — the owner creates a share
// by calling pb.collection('document_shares').create(...) directly from the
// frontend, which is guarded by the onRecordCreateRequest hook in
// task17-hooks.pb.js (entitlement check + server-generated token, ignoring
// any token the client sends).

const router = Router();

const SOURCE_COLLECTION = {
	property: 'properties',
	custom: 'properties',
	user: 'users',
	expense: 'owner_expenses',
};

// GET /document-shares/:token
router.get('/:token', async (req, res) => {
	const token = String(req.params.token || '').trim();
	if (!token) return res.status(400).json({ error: 'token_required' });

	let share;
	try {
		// `token` comes straight from the URL of a PUBLIC, unauthenticated route
		// — use the SDK's parameterized filter() (not raw string interpolation)
		// so a token containing a quote/operator can never escape the intended
		// equality check against the superuser-privileged client.
		share = await pocketbaseClient.collection('document_shares').getFirstListItem(
			pocketbaseClient.filter('token = {:token}', { token }),
		);
	} catch {
		return res.status(404).json({ error: 'not_found' });
	}

	if (share.revoked) return res.status(410).json({ error: 'revoked' });
	if (share.expires_at) {
		const expMs = new Date(share.expires_at).getTime();
		if (!Number.isNaN(expMs) && Date.now() > expMs) {
			return res.status(410).json({ error: 'expired' });
		}
	}

	const sourceCollection = SOURCE_COLLECTION[share.doc_source];
	if (!sourceCollection || !share.doc_field) {
		return res.status(410).json({ error: 'broken_link' });
	}

	let target;
	try {
		target = await pocketbaseClient.collection(sourceCollection).getOne(share.doc_ref_id);
	} catch {
		return res.status(410).json({ error: 'broken_link' });
	}

	const fileName = target[share.doc_field];
	if (!fileName) return res.status(410).json({ error: 'broken_link' });

	let fileToken = '';
	try {
		fileToken = await pocketbaseClient.files.getToken();
	} catch {
		fileToken = '';
	}
	if (!fileToken) {
		return res.status(503).json({ error: 'file_token_unavailable' });
	}

	// Best-effort view counter — never blocks resolution if it fails.
	try {
		await pocketbaseClient.collection('document_shares').update(share.id, {
			view_count: (Number(share.view_count) || 0) + 1,
		});
	} catch {
		/* non-fatal */
	}

	res.json({
		label: share.label || '',
		fileName,
		url: `${pocketbaseClient.files.getURL(target, fileName)}?token=${fileToken}`,
		expires_at: share.expires_at || null,
	});
});

export default router;
