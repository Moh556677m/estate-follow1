// Regular-user OTP challenge/response, backed by Resend for delivery and
// the `auth_otps` PocketBase collection (superuser-only, see
// pb_migrations/1792200000_add_user_otp_collection.js) for storage — NOT
// Supabase's own built-in email/OTP system, and NOT PocketBase's own
// users-collection request-otp/authWithOTP flow. Supabase Auth is only
// ever touched afterwards (by the routes in user-otp.js), once a code
// verified here proves the caller owns the mailbox — this file never
// imports supabaseClient.js at all.
//
// The raw 6-digit code is NEVER stored, logged, or returned by any
// function here — only a salted SHA-256 hash of it. It exists in memory
// only for the single call to sendViaResend().
import crypto from 'crypto';
import pocketbaseClient from './pocketbaseClient.js';
import { sendViaResend, isResendConfigured } from './resendMailer.js';
import logger from './logger.js';

const COLLECTION = 'auth_otps';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches OTP_DURATION in SignupPage.jsx / ForgotPasswordPage.jsx
const RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_ATTEMPTS = 5;
const TICKET_TTL_MS = 10 * 60 * 1000; // window to actually pick a new password after verifying the code
const VERIFY_FROM = 'verify@estatefollow.com';
const BRAND_NAME = 'Estate Follow';

function otpError(code, message) {
	const err = new Error(message);
	err.code = code;
	return err;
}

function generateCode() {
	// crypto.randomInt is cryptographically secure, unlike Math.random().
	return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashCode(code, salt) {
	return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

// Constant-time compare — the OTP hash must never leak through a
// response-timing side channel, however small.
function hashesMatch(a, b) {
	const bufA = Buffer.from(String(a || ''), 'hex');
	const bufB = Buffer.from(String(b || ''), 'hex');
	if (bufA.length !== bufB.length) return false;
	return crypto.timingSafeEqual(bufA, bufB);
}

function escapeForFilter(value) {
	return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function findLatest(email, purpose) {
	try {
		return await pocketbaseClient
			.collection(COLLECTION)
			.getFirstListItem(
				`email = "${escapeForFilter(email)}" && purpose = "${escapeForFilter(purpose)}"`,
				{ sort: '-created', requestKey: null },
			);
	} catch (err) {
		if (err?.status === 404) return null;
		throw err;
	}
}

function buildOtpEmail(code) {
	const subject = 'رمز التحقق — Estate Follow / Verification code';
	const html =
		'<div dir="rtl" style="font-family:IBM Plex Sans Arabic,Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">' +
		'<h2 style="margin:0 0 12px">إستيت فولو</h2>' +
		'<p style="font-size:16px;line-height:1.7">رمز التحقق الخاص بك هو:</p>' +
		'<p style="font-size:30px;font-weight:700;letter-spacing:6px;direction:ltr;text-align:center;margin:16px 0">' + code + '</p>' +
		'<p style="font-size:13px;color:#64748b">ينتهي خلال 5 دقائق. لا تشاركه مع أحد.</p>' +
		'<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
		'<p dir="ltr" style="font-size:15px;line-height:1.6">Your Estate Follow verification code is: <b style="font-size:20px;letter-spacing:3px">' + code + '</b></p>' +
		'<p dir="ltr" style="font-size:13px;color:#64748b">It expires in 5 minutes. Never share it with anyone.</p>' +
		'</div>';
	const text = 'Your Estate Follow verification code: ' + code;
	return { subject, html, text };
}

/**
 * Generates a fresh code, sends it via Resend, and ONLY THEN persists the
 * challenge record — a failed Resend send throws instead of ever letting a
 * caller report "code sent" for one that wasn't. Enforces a resend cooldown
 * per (email, purpose) so a caller can't hammer Resend's API.
 */
export async function sendOtp(email, purpose) {
	if (!isResendConfigured()) {
		throw otpError('MAIL_NOT_CONFIGURED', 'Email service is not configured. Please contact support.');
	}

	const existing = await findLatest(email, purpose);
	if (existing && !existing.consumed && existing.last_sent_at) {
		const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
		if (elapsed < RESEND_COOLDOWN_MS) {
			throw otpError('RESEND_COOLDOWN', 'Please wait a moment before requesting another code.');
		}
	}

	const code = generateCode();
	const salt = crypto.randomBytes(16).toString('hex');
	const otpHash = hashCode(code, salt);
	const nowIso = new Date().toISOString();
	const expiresAtIso = new Date(Date.now() + OTP_TTL_MS).toISOString();

	const { subject, html, text } = buildOtpEmail(code);
	const result = await sendViaResend({
		from: `${BRAND_NAME} <${VERIFY_FROM}>`,
		to: email,
		subject,
		html,
		text,
	});

	if (!result.ok) {
		logger.error('OTP email send failed', 'email', email, 'purpose', purpose, 'reason', result.reason, 'status', result.status || 0);
		throw otpError('MAIL_SEND_FAILED', 'Could not send the verification email. Please try again or contact support.');
	}

	const payload = {
		email,
		purpose,
		otp_hash: otpHash,
		otp_salt: salt,
		expires_at: expiresAtIso,
		attempts: 0,
		consumed: false,
		last_sent_at: nowIso,
	};

	if (existing) {
		await pocketbaseClient.collection(COLLECTION).update(existing.id, payload);
	} else {
		await pocketbaseClient.collection(COLLECTION).create(payload);
	}

	// Deliberately never logs the code itself — only that a send happened.
	logger.info('OTP email sent via Resend', 'email', email, 'purpose', purpose, 'status', result.status);
}

/**
 * Verifies a submitted code against the latest pending challenge for
 * (email, purpose). Throws OTP_INVALID / OTP_EXPIRED / OTP_LOCKED on
 * failure; on success, marks the record consumed (single-use) and returns.
 */
export async function verifyOtp(email, purpose, code) {
	const record = await findLatest(email, purpose);
	if (!record || record.consumed) {
		throw otpError('OTP_INVALID', 'Invalid or expired code.');
	}
	if (new Date(record.expires_at).getTime() < Date.now()) {
		throw otpError('OTP_EXPIRED', 'This code has expired.');
	}
	if ((record.attempts || 0) >= MAX_ATTEMPTS) {
		throw otpError('OTP_LOCKED', 'Too many attempts. Please request a new code.');
	}

	const candidateHash = hashCode(String(code || '').trim(), record.otp_salt);
	if (!hashesMatch(candidateHash, record.otp_hash)) {
		await pocketbaseClient.collection(COLLECTION).update(record.id, { attempts: (record.attempts || 0) + 1 });
		throw otpError('OTP_INVALID', 'Invalid code.');
	}

	await pocketbaseClient.collection(COLLECTION).update(record.id, { consumed: true });
}

/**
 * Password-reset only: issues a short-lived, single-use opaque ticket once
 * the OTP itself has already been verified (verifyOtp() above marks it
 * consumed — single use — so the frontend's separate "choose a new
 * password" step cannot resubmit the same code; it presents this ticket
 * instead). Never logged.
 */
export async function issueResetTicket(email) {
	const record = await findLatest(email, 'reset');
	if (!record || !record.consumed) {
		throw otpError('OTP_INVALID', 'Please verify your code again.');
	}
	const ticket = crypto.randomBytes(32).toString('hex');
	await pocketbaseClient.collection(COLLECTION).update(record.id, {
		reset_ticket: ticket,
		ticket_expires_at: new Date(Date.now() + TICKET_TTL_MS).toISOString(),
	});
	return ticket;
}

/**
 * Validates and immediately invalidates (one-time use) the ticket issued by
 * issueResetTicket(). Throws OTP_INVALID / OTP_EXPIRED on failure.
 */
export async function consumeResetTicket(email, ticket) {
	const record = await findLatest(email, 'reset');
	if (!record || !record.consumed || !record.reset_ticket) {
		throw otpError('OTP_INVALID', 'Please verify your code again.');
	}
	if (!record.ticket_expires_at || new Date(record.ticket_expires_at).getTime() < Date.now()) {
		throw otpError('OTP_EXPIRED', 'This session has expired. Please verify your code again.');
	}
	const a = Buffer.from(String(ticket || ''), 'hex');
	const b = Buffer.from(String(record.reset_ticket || ''), 'hex');
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
		throw otpError('OTP_INVALID', 'Please verify your code again.');
	}
	await pocketbaseClient.collection(COLLECTION).update(record.id, { reset_ticket: '' });
}
