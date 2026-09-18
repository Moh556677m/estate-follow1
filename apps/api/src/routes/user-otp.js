// Regular-user Signup / Forgot-Password OTP — Resend sends the email,
// PocketBase's own "users" collection owns the resulting identity/session
// directly (superuser-created/updated from here, no oldPassword needed —
// see otp-password-reset.pb.js for the reset case), PocketBase is also the
// backing store for the OTP challenge itself (see utils/userOtp.js for the
// full explanation of why this exists instead of PocketBase's own
// users-collection request-otp). Regular users no longer touch Supabase at
// all — this was previously bridged through Supabase Auth; that indirection
// is gone, so there is one fewer external dependency and one fewer place a
// misconfigured/missing third-party credential can break signup or login.
//
// Deliberately public (no PocketBase auth middleware) — these are the
// pre-authentication steps of signing up / resetting a forgotten password.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import { sendOtp, verifyOtp, issueResetTicket, consumeResetTicket } from '../utils/userOtp.js';
import logger from '../utils/logger.js';

const router = Router();

// A brand-new account has no name/phone/nationality/gender yet — those are
// collected on the signup form and committed afterward via
// finalize-signup.pb.js (SignupPage.jsx calls it right after verifySignupOtp
// succeeds), exactly like the existing Supabase-bridge placeholder pattern
// this replaces (see the same two constants in
// supabase-auth-bridge.js — kept identical here for consistency, though
// that route no longer handles regular users).
const PLACEHOLDER_NATIONALITY = 'PENDING';
const PLACEHOLDER_GENDER = 'male';

const PB_BASE = process.env.POCKETBASE_URL || 'http://localhost:8090';

function isNotUniqueEmailError(err) {
	const fieldCode = err?.response?.data?.email?.code || err?.data?.data?.email?.code;
	if (fieldCode === 'validation_not_unique') return true;
	const msg = String(err?.message || '').toLowerCase();
	return err?.status === 400 && msg.includes('email') && (msg.includes('unique') || msg.includes('taken'));
}

// Stricter than the app-wide globalRateLimit (100/5min) — an OTP endpoint
// is exactly the kind of thing brute-forcing/hammering targets first.
const otpRateLimit = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 8,
	standardHeaders: true,
	legacyHeaders: false,
	validate: { trustProxy: false },
	message: { message: 'Too many requests, please try again later.' },
});

// Deliberately simple — just enough to reject obviously-malformed input
// before it reaches a PocketBase filter string or a Resend "to" address,
// not a full RFC 5322 validator.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
	const v = String(value || '').trim().toLowerCase();
	return EMAIL_SHAPE.test(v) ? v : '';
}

function otpStartStatus(code) {
	if (code === 'RESEND_COOLDOWN') return 429;
	if (code === 'MAIL_NOT_CONFIGURED' || code === 'MAIL_SEND_FAILED') return 502;
	return 500;
}

function otpVerifyStatus(code) {
	if (code === 'OTP_INVALID' || code === 'OTP_EXPIRED' || code === 'OTP_LOCKED') return 400;
	return 500;
}

// --- Signup -----------------------------------------------------------

router.post('/signup/start', otpRateLimit, async (req, res) => {
	const email = normalizeEmail(req.body?.email);
	if (!email) return res.status(400).json({ message: 'Email is required.' });
	try {
		await sendOtp(email, 'signup');
		return res.json({ ok: true });
	} catch (err) {
		logger.error('signup/start failed', 'email', email, 'code', err?.code, 'err', err?.message);
		return res.status(otpStartStatus(err?.code)).json({ message: err?.message || 'Could not send the code.', code: err?.code });
	}
});

router.post('/signup/resend', otpRateLimit, async (req, res) => {
	const email = normalizeEmail(req.body?.email);
	if (!email) return res.status(400).json({ message: 'Email is required.' });
	try {
		await sendOtp(email, 'signup');
		return res.json({ ok: true });
	} catch (err) {
		logger.error('signup/resend failed', 'email', email, 'code', err?.code, 'err', err?.message);
		return res.status(otpStartStatus(err?.code)).json({ message: err?.message || 'Could not send the code.', code: err?.code });
	}
});

router.post('/signup/verify', otpRateLimit, async (req, res) => {
	const email = normalizeEmail(req.body?.email);
	const code = String(req.body?.code || '').trim();
	const password = String(req.body?.password || '');
	if (!email || !code || !password) {
		return res.status(400).json({ message: 'Email, code and password are required.' });
	}

	try {
		await verifyOtp(email, 'signup', code);
	} catch (err) {
		return res.status(otpVerifyStatus(err?.code)).json({ message: err?.message || 'Invalid code.', code: err?.code });
	}

	// Creates the real PocketBase "users" record directly, with the real
	// password the user typed — Resend already proved this mailbox above
	// (verifyOtp succeeded), so there is no separate "confirm your email"
	// step needed. The frontend authenticates against this same record
	// immediately afterward with the same password (see
	// AuthContext.jsx's verifySignupOtp()); finalize-signup.pb.js then
	// commits the real profile/subscription fields once that session exists.
	try {
		const record = await pocketbaseClient.collection('users').create({
			email,
			password,
			passwordConfirm: password,
			role: 'owner',
			pending_signup: false,
			nationality: PLACEHOLDER_NATIONALITY,
			gender: PLACEHOLDER_GENDER,
			verified: true,
			name: '',
		});
		return res.json({ ok: true, userId: record.id });
	} catch (err) {
		if (isNotUniqueEmailError(err)) {
			return res.status(409).json({ message: 'ACCOUNT_EXISTS', code: 'ACCOUNT_EXISTS' });
		}
		// Log everything PocketBase actually gave us — never just
		// err.message — so a real cause (a rejected password, a schema
		// change, a PocketBase connectivity issue) is diagnosable from the
		// logs instead of producing one opaque message with nothing to go
		// on. Email only, never the password.
		logger.error(
			'signup/verify: pocketbase user create failed',
			'email', email,
			'status', err?.status,
			'response', JSON.stringify(err?.response || err?.message || err),
		);
		return res.status(502).json({ message: 'Could not create your account. Please try again in a moment.', code: 'ACCOUNT_CREATE_FAILED' });
	}
});

// --- Forgot / reset password --------------------------------------------
//
// Anti-enumeration: both /reset/start and /reset/resend always respond
// { ok: true } whether or not the email belongs to a real account — the
// existence check (a plain PocketBase lookup, which never sends anything
// itself) only decides whether Resend is actually asked to send a code,
// never what the HTTP response says.

async function findUserByEmail(email) {
	try {
		return await pocketbaseClient.collection('users').getFirstListItem(`email = "${email.replace(/"/g, '\\"')}"`);
	} catch (err) {
		if (err?.status === 404) return null;
		throw err;
	}
}

router.post('/reset/start', otpRateLimit, async (req, res) => {
	const email = normalizeEmail(req.body?.email);
	if (!email) return res.status(400).json({ message: 'Email is required.' });
	try {
		const user = await findUserByEmail(email);
		if (user) {
			await sendOtp(email, 'reset');
		}
	} catch (err) {
		// A real Resend delivery failure (not "no such account") should still
		// surface — the user is waiting for a code that was never sent.
		if (err?.code === 'MAIL_SEND_FAILED' || err?.code === 'MAIL_NOT_CONFIGURED' || err?.code === 'RESEND_COOLDOWN') {
			logger.error('reset/start failed', 'email', email, 'code', err?.code, 'err', err?.message);
			return res.status(otpStartStatus(err.code)).json({ message: err.message, code: err.code });
		}
		logger.error('reset/start: existence check failed', 'email', email, 'err', err?.message || err);
	}
	return res.json({ ok: true });
});

router.post('/reset/resend', otpRateLimit, async (req, res) => {
	const email = normalizeEmail(req.body?.email);
	if (!email) return res.status(400).json({ message: 'Email is required.' });
	try {
		const user = await findUserByEmail(email);
		if (user) {
			await sendOtp(email, 'reset');
		}
	} catch (err) {
		if (err?.code === 'MAIL_SEND_FAILED' || err?.code === 'MAIL_NOT_CONFIGURED' || err?.code === 'RESEND_COOLDOWN') {
			logger.error('reset/resend failed', 'email', email, 'code', err?.code, 'err', err?.message);
			return res.status(otpStartStatus(err.code)).json({ message: err.message, code: err.code });
		}
		logger.error('reset/resend: existence check failed', 'email', email, 'err', err?.message || err);
	}
	return res.json({ ok: true });
});

// Verifies the code only (the single-use code gets consumed here) and
// returns a short-lived opaque ticket for the frontend's separate "choose a
// new password" step — see issueResetTicket()'s comment for why this can't
// just be the same code again.
router.post('/reset/verify', otpRateLimit, async (req, res) => {
	const email = normalizeEmail(req.body?.email);
	const code = String(req.body?.code || '').trim();
	if (!email || !code) {
		return res.status(400).json({ message: 'Email and code are required.' });
	}
	try {
		await verifyOtp(email, 'reset', code);
		const resetTicket = await issueResetTicket(email);
		return res.json({ ok: true, resetTicket });
	} catch (err) {
		return res.status(otpVerifyStatus(err?.code)).json({ message: err?.message || 'Invalid code.', code: err?.code });
	}
});

router.post('/reset/complete', otpRateLimit, async (req, res) => {
	const email = normalizeEmail(req.body?.email);
	const resetTicket = String(req.body?.resetTicket || '').trim();
	const newPassword = String(req.body?.newPassword || '');
	if (!email || !resetTicket || !newPassword) {
		return res.status(400).json({ message: 'Email, reset ticket and new password are required.' });
	}

	try {
		await consumeResetTicket(email, resetTicket);
	} catch (err) {
		return res.status(otpVerifyStatus(err?.code)).json({ message: err?.message || 'Invalid session.', code: err?.code });
	}

	// Sets the new password via a dedicated PocketBase JSVM route
	// (otp-password-reset.pb.js) — PocketBase's REST API refuses to update
	// an auth record's password without oldPassword regardless of caller
	// identity, and this caller (this request has no logged-in user at all
	// yet — that's the whole point of "forgot" password) has no oldPassword
	// to supply. That route runs as a real record.setPassword() inside
	// PocketBase itself, gated to accept only our own superuser-authenticated
	// service token (pocketbaseClient.authStore.token below), and separately
	// refuses to touch a staff/admin account.
	try {
		const res2 = await fetch(`${PB_BASE}/ef/auth/otp-reset-password`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: pocketbaseClient.authStore.token,
			},
			body: JSON.stringify({ email, newPassword }),
		});
		const body = await res2.json().catch(() => ({}));
		if (!res2.ok) {
			if (res2.status === 404) {
				return res.status(404).json({ message: 'No account found with this email.' });
			}
			if (res2.status === 403) {
				return res.status(404).json({ message: 'No account found with this email.' });
			}
			logger.error('reset/complete: otp-reset-password failed', 'email', email, 'status', res2.status, 'body', JSON.stringify(body));
			return res.status(500).json({ message: 'Could not reset your password.' });
		}
		return res.json({ ok: true });
	} catch (err) {
		logger.error('reset/complete threw', 'email', email, 'err', err?.message || err);
		return res.status(500).json({ message: 'Could not reset your password.' });
	}
});

export default router;
