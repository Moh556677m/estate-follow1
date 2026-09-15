// Regular-user Signup / Forgot-Password OTP — Resend sends the email,
// Supabase Auth owns the resulting identity/session, PocketBase is only a
// private backing store for the OTP challenge itself (see utils/userOtp.js
// for the full explanation of why this exists instead of either Supabase's
// built-in email/OTP or PocketBase's own users-collection request-otp).
//
// Deliberately public (no PocketBase auth middleware) — these are the
// pre-authentication steps of signing up / resetting a forgotten password.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabaseAdmin, isSupabaseConfigured } from '../utils/supabaseClient.js';
import { sendOtp, verifyOtp, issueResetTicket, consumeResetTicket } from '../utils/userOtp.js';
import logger from '../utils/logger.js';

const router = Router();

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
	if (!isSupabaseConfigured) {
		return res.status(503).json({ message: 'Supabase is not configured on this server.' });
	}

	try {
		await verifyOtp(email, 'signup', code);
	} catch (err) {
		return res.status(otpVerifyStatus(err?.code)).json({ message: err?.message || 'Invalid code.', code: err?.code });
	}

	// Admin API createUser() never sends any email regardless of
	// email_confirm — Resend already proved this mailbox above, so we mark
	// it confirmed immediately instead of triggering a second (Supabase)
	// confirmation email.
	try {
		const { data, error } = await supabaseAdmin.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
		});
		if (error) {
			const msg = String(error.message || '').toLowerCase();
			const alreadyExists =
				error.code === 'email_exists' ||
				error.code === 'user_already_exists' ||
				msg.includes('already been registered') ||
				msg.includes('already registered') ||
				msg.includes('already exists');
			if (alreadyExists) {
				return res.status(409).json({ message: 'ACCOUNT_EXISTS', code: 'ACCOUNT_EXISTS' });
			}
			logger.error('signup/verify: admin.createUser failed', 'email', email, 'err', error.message);
			return res.status(500).json({ message: 'Could not create your account.' });
		}
		return res.json({ ok: true, userId: data.user.id });
	} catch (err) {
		logger.error('signup/verify threw', 'email', email, 'err', err?.message || err);
		return res.status(500).json({ message: 'Could not create your account.' });
	}
});

// --- Forgot / reset password --------------------------------------------
//
// Anti-enumeration: both /reset/start and /reset/resend always respond
// { ok: true } whether or not the email belongs to a real account — the
// existence check (via generateLink, which never sends anything itself)
// only decides whether Resend is actually asked to send a code, never
// what the HTTP response says.

async function findSupabaseUserIdByEmail(email) {
	const { data, error } = await supabaseAdmin.auth.admin.generateLink({
		type: 'recovery',
		email,
	});
	if (error || !data?.user?.id) return null;
	return data.user.id;
}

router.post('/reset/start', otpRateLimit, async (req, res) => {
	const email = normalizeEmail(req.body?.email);
	if (!email) return res.status(400).json({ message: 'Email is required.' });
	if (!isSupabaseConfigured) {
		return res.status(503).json({ message: 'Supabase is not configured on this server.' });
	}
	try {
		const userId = await findSupabaseUserIdByEmail(email);
		if (userId) {
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
	if (!isSupabaseConfigured) {
		return res.status(503).json({ message: 'Supabase is not configured on this server.' });
	}
	try {
		const userId = await findSupabaseUserIdByEmail(email);
		if (userId) {
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
	if (!isSupabaseConfigured) {
		return res.status(503).json({ message: 'Supabase is not configured on this server.' });
	}

	try {
		await consumeResetTicket(email, resetTicket);
	} catch (err) {
		return res.status(otpVerifyStatus(err?.code)).json({ message: err?.message || 'Invalid session.', code: err?.code });
	}

	try {
		const userId = await findSupabaseUserIdByEmail(email);
		if (!userId) {
			return res.status(404).json({ message: 'No account found with this email.' });
		}
		const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
		if (error) {
			logger.error('reset/complete: updateUserById failed', 'email', email, 'err', error.message);
			return res.status(500).json({ message: 'Could not reset your password.' });
		}
		return res.json({ ok: true });
	} catch (err) {
		logger.error('reset/complete threw', 'email', email, 'err', err?.message || err);
		return res.status(500).json({ message: 'Could not reset your password.' });
	}
});

export default router;
