// Direct Resend API caller for apps/api (Node/Express side).
//
// This is the regular-user counterpart to
// apps/pocketbase/pb_hooks/0-resend-mailer.pb.js (which handles Resend for
// PocketBase's own mailer events — admin/staff OTP, verification, password
// reset). Regular users no longer go through PocketBase's mailer at all
// (see apps/api/src/utils/userOtp.js) — this module sends their OTP emails
// directly via Resend's REST API from the Node process, using the exact
// same RESEND_API_KEY env var, trimmed the same defensive way (a stray
// whitespace/newline in the panel-stored value still passes a bare
// truthiness check but produces an invalid "Bearer <key>" header).
import logger from './logger.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function getApiKey() {
	return String(process.env.RESEND_API_KEY || '').trim();
}

export function isResendConfigured() {
	return !!getApiKey();
}

/**
 * Sends one email via Resend. Returns { ok, status, reason } instead of
 * throwing — callers decide what "delivery failed" means for their flow
 * (e.g. userOtp.js must never persist/report an OTP as sent when this
 * returns ok:false).
 */
export async function sendViaResend({ from, to, subject, html, text }) {
	const apiKey = getApiKey();
	if (!apiKey) {
		return { ok: false, reason: 'no-key', status: 0 };
	}
	const toList = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
	if (!toList.length) {
		return { ok: false, reason: 'no-recipients', status: 0 };
	}
	try {
		const res = await fetch(RESEND_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ from, to: toList, subject: subject || '', html, text }),
		});
		if (res.ok) {
			return { ok: true, status: res.status };
		}
		const body = await res.text().catch(() => '');
		logger.error('Resend API rejected an email', 'status', res.status, 'body', body.slice(0, 500));
		return { ok: false, reason: `http-${res.status}`, status: res.status };
	} catch (err) {
		logger.error('Resend send threw', err?.message || err);
		return { ok: false, reason: 'exception', status: 0 };
	}
}
