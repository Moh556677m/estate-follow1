// Stripe webhook receiver — NO auth. Stripe calls this directly; security
// comes from verifying the Stripe-Signature header with the gateway's
// webhook signing secret. On a confirmed checkout.session.completed event
// the matching subscription_order is flipped to `paid` and the package is
// activated on the user record automatically (no manual admin approval).
//
// The raw request body is captured by the `verify` hook on the global
// express.json() parser (see main.js) into req.rawBody, which is required
// for signature verification.
//
// The activation logic itself lives in utils/stripeActivation.js and is
// shared with the owner/admin fallback endpoints, so the webhook path and
// the fallback path activate packages identically.

import crypto from 'node:crypto';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import { decrypt } from '../utils/gatewayCrypto.js';
import { activateOrder } from '../utils/stripeActivation.js';
import logger from '../utils/logger.js';

const TOLERANCE_SECONDS = 300;

function timingSafeEqualHex(a, b) {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length || ab.length === 0) return false;
	return crypto.timingSafeEqual(ab, bb);
}

// Verify the Stripe-Signature header against a webhook secret.
// Stripe's scheme: header `t=<ts>,v1=<sig>,v1=<sig2>...`; signed payload is
// `<ts>.<rawBody>`; HMAC-SHA256 with the webhook secret; reject if older
// than TOLERANCE_SECONDS.
function verifySignature(payload, sigHeader, secret) {
	if (!sigHeader || !secret) return false;
	const parts = sigHeader.split(',');
	const tPart = parts.find((p) => p.trim().startsWith('t='));
	const v1Parts = parts
		.filter((p) => p.trim().startsWith('v1='))
		.map((p) => p.trim().slice(3));
	if (!tPart || v1Parts.length === 0) return false;
	const t = tPart.trim().slice(2);
	const signed = `${t}.${payload}`;
	const expected = crypto
		.createHmac('sha256', secret)
		.update(signed)
		.digest('hex');
	const valid = v1Parts.some((sig) => timingSafeEqualHex(sig, expected));
	if (!valid) return false;
	const age = Math.abs(Date.now() / 1000 - Number(t));
	return !isNaN(age) && age <= TOLERANCE_SECONDS;
}

// Try every active Stripe gateway's webhook secret; the first that verifies
// wins. Safe — verification is a HMAC check, trying multiple secrets leaks
// nothing and supports multiple Stripe accounts / test+live configs.
async function findGatewayBySignature(payload, sigHeader) {
	const all = await pocketbaseClient
		.collection('payment_gateways')
		.getFullList({ filter: "type = 'stripe' && active = true" });
	for (const gw of all || []) {
		const config = gw.config && typeof gw.config === 'object' ? gw.config : {};
		const secret = decrypt(config.webhook_secret_enc);
		if (!secret) continue;
		if (verifySignature(payload, sigHeader, secret)) return gw;
	}
	return null;
}

export default async (req, res) => {
	const payload = req.rawBody ? req.rawBody.toString('utf8') : '';
	const sigHeader = req.headers['stripe-signature'] || '';

	if (!payload) {
		return res.status(400).json({ error: 'Missing raw body' });
	}

	const gw = await findGatewayBySignature(payload, sigHeader);
	if (!gw) {
		logger.warn('stripe webhook: signature verification failed');
		return res.status(400).json({ error: 'Signature verification failed' });
	}

	let event;
	try {
		event = JSON.parse(payload);
	} catch {
		return res.status(400).json({ error: 'Invalid JSON' });
	}

	const type = event && event.type;
	const data = event && event.data && event.data.object;

	try {
		if (
			type === 'checkout.session.completed' ||
			type === 'checkout.session.async_payment_succeeded'
		) {
			if (data && data.payment_status === 'paid') {
				const orderId =
					data.client_reference_id ||
					(data.metadata && data.metadata.orderId);
				if (orderId) {
					try {
						const order = await pocketbaseClient
							.collection('subscription_orders')
							.getOne(orderId);
						await activateOrder(order, data);
					} catch (e) {
						logger.error('stripe webhook: activation failed', String(e));
					}
				}
			}
		} else if (
			type === 'checkout.session.expired' ||
			type === 'checkout.session.async_payment_failed'
		) {
			// Expired or async-payment-failed sessions never activate a
			// package. Flip a still-pending order to `failed` so it doesn't
			// linger as "awaiting payment" forever.
			const orderId =
				data &&
				(data.client_reference_id ||
					(data.metadata && data.metadata.orderId));
			if (orderId) {
				try {
					const order = await pocketbaseClient
						.collection('subscription_orders')
						.getOne(orderId);
					if (order && order.status === 'pending') {
						await pocketbaseClient
							.collection('subscription_orders')
							.update(orderId, { status: 'failed' });
					}
				} catch (e) {
					logger.error('stripe webhook: expire/fail update failed', String(e));
				}
			}
		}
	} catch (e) {
		logger.error('stripe webhook handler error', String(e));
	}

	// Always 200 for handled event types so Stripe doesn't retry forever.
	res.json({ received: true });
};
