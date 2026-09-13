// Supabase Auth -> PocketBase session bridge.
//
// WHY THIS EXISTS: Supabase Auth is now the durable, deploy-independent
// source of truth for a regular user's identity (email + password + email
// confirmation + password reset — see apps/web/src/contexts/AuthContext.jsx
// and apps/web/src/lib/supabaseClient.js). But every OTHER piece of user
// data in this app (properties, payments, documents, subscriptions, staff
// permissions, ...) still lives in PocketBase, and PocketBase's own
// collection API rules only ever understand `@request.auth.*` from a real
// PocketBase auth token — they have no way to validate a Supabase-issued
// JWT. Without this bridge, a user authenticated only via Supabase would be
// able to log in and immediately find every other page broken (401s on
// every PocketBase-backed feature).
//
// This route is deliberately public (no PocketBase auth middleware) — the
// caller proves who they are with a Supabase access token instead, verified
// server-side against Supabase itself. It never accepts a password: this is
// purely "I already proved my identity to Supabase, now give me a working
// PocketBase session for that same identity."
//
// Flow:
//   1) Verify the caller's Supabase access token really belongs to a real,
//      current Supabase user (supabaseAdmin.auth.getUser — round-trips to
//      Supabase itself, so a forged/expired token is rejected there).
//   2) Look up the PocketBase "users" record already linked to that
//      Supabase user via the supabase_uid field (added by
//      1790000000_add_supabase_uid_to_users.js) — NEVER by matching email
//      alone, which would let anyone claim an existing PocketBase account
//      just by knowing its email. Provision one on first use.
//   3) Impersonate that PocketBase record (superuser-only PocketBase API —
//      pocketbaseClient is already superuser-authenticated, see
//      utils/pocketbaseClient.js) to mint a real, normal PocketBase auth
//      token for it, with no password ever needed or stored anywhere
//      retrievable.
//
// Admin/staff accounts are completely untouched by this file — they still
// sign in with pb.collection('users').authWithPassword() directly, exactly
// as before (see AdminLoginPage.jsx / portal-login-separation.pb.js).
import { Router } from 'express';
import { randomBytes } from 'crypto';
import { supabaseAdmin, isSupabaseConfigured } from '../utils/supabaseClient.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const router = Router();

// PocketBase's "users" collection still requires nationality/gender (added
// by 1787862388_signup_otp_fields.js). A brand-new Supabase-bridged account
// has neither yet — the real values are filled in from the profile page
// (OwnerProfileEditor.jsx), exactly like the existing OTP-signup placeholder
// record (signup-otp.pb.js uses the same "PENDING"/"male" placeholders).
const PLACEHOLDER_NATIONALITY = 'PENDING';
const PLACEHOLDER_GENDER = 'male';

// 7 days — same order of magnitude as a normal PocketBase auth session;
// the frontend re-bridges (gets a fresh token) whenever its own Supabase
// session refreshes, so this never needs to be exceptionally long-lived.
const IMPERSONATE_DURATION_SECONDS = 60 * 60 * 24 * 7;

router.post('/', async (req, res) => {
	if (!isSupabaseConfigured) {
		return res.status(503).json({ message: 'Supabase is not configured on this server.' });
	}

	const authHeader = String(req.headers.authorization || '');
	const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
	if (!token) {
		return res.status(401).json({ message: 'Missing Supabase access token.' });
	}

	let supabaseUser;
	try {
		const { data, error } = await supabaseAdmin.auth.getUser(token);
		if (error || !data?.user) {
			return res.status(401).json({ message: 'Invalid or expired Supabase session.' });
		}
		supabaseUser = data.user;
	} catch (err) {
		logger.error('Supabase auth bridge: could not verify token:', err?.message || err);
		return res.status(502).json({ message: 'Could not verify the Supabase session.' });
	}

	const email = String(supabaseUser.email || '').trim().toLowerCase();
	if (!email) {
		return res.status(400).json({ message: 'This Supabase account has no email.' });
	}

	try {
		let record = null;
		try {
			record = await pocketbaseClient
				.collection('users')
				.getFirstListItem(`supabase_uid = "${supabaseUser.id}"`);
		} catch (err) {
			if (err?.status !== 404) throw err;
			record = null;
		}

		if (!record) {
			// This account is only ever accessed via impersonation from this
			// route onward — the random password is generated once and
			// discarded immediately; nothing ever authenticates with it
			// directly, so it never needs to be stored or retrievable.
			const randomPassword = randomBytes(24).toString('base64');
			record = await pocketbaseClient.collection('users').create({
				email,
				password: randomPassword,
				passwordConfirm: randomPassword,
				supabase_uid: supabaseUser.id,
				role: 'owner',
				pending_signup: false,
				nationality: PLACEHOLDER_NATIONALITY,
				gender: PLACEHOLDER_GENDER,
				verified: !!supabaseUser.email_confirmed_at,
				name: supabaseUser.user_metadata?.name || supabaseUser.user_metadata?.full_name || '',
			});
			logger.info(`Supabase auth bridge: provisioned a new PocketBase user for supabase_uid=${supabaseUser.id}`);
		} else if (supabaseUser.email_confirmed_at && !record.verified) {
			// Keep PocketBase's own "verified" flag (used by existing UI) in
			// sync if the Supabase side got confirmed after the record was
			// first provisioned.
			try {
				record = await pocketbaseClient.collection('users').update(record.id, { verified: true });
			} catch {
				/* non-fatal — the impersonated session below still works */
			}
		}

		if (record.suspended || String(record.account_state || '').toLowerCase() === 'suspended') {
			return res.status(403).json({ message: 'ACCOUNT_SUSPENDED' });
		}

		// impersonate() returns a SEPARATE PocketBase client instance with its
		// own authStore — it does not touch pocketbaseClient's own superuser
		// session (see utils/pocketbaseClient.js), so this is safe to call
		// repeatedly from this shared, long-lived superuser-authenticated
		// client without ever disturbing it.
		const impersonated = await pocketbaseClient
			.collection('users')
			.impersonate(record.id, IMPERSONATE_DURATION_SECONDS);

		return res.json({
			token: impersonated.authStore.token,
			record: impersonated.authStore.record,
		});
	} catch (err) {
		logger.error('Supabase auth bridge failed:', err?.message || err);
		return res.status(500).json({ message: 'Could not bridge the Supabase session to the app.' });
	}
});

export default router;
