// Shared Stripe subscription-activation logic.
//
// Used by BOTH the Stripe webhook receiver (stripe-webhook.js) and the
// owner/admin fallback endpoints in payment-gateways.js. Keeping the
// activation logic in ONE place guarantees the webhook path and the
// fallback path activate packages identically — same date math, same
// idempotency, same referral-discount consumption.
//
// Why a fallback exists at all: the webhook is a single point of failure.
// If it is not registered in the Stripe dashboard, registered with the
// wrong URL, or the signing secret doesn't match, Stripe still charges the
// customer but the order stays `pending` and the package never activates.
// The fallback retrieves the Checkout Session directly from the Stripe API
// (using the stored stripe_session_id + the gateway's secret key) and
// activates when Stripe itself confirms payment_status === 'paid'. Stripe's
// API is the source of truth — we never activate on the redirect alone and
// never guess a user or package.

import pocketbaseClient from './pocketbaseClient.js';
import { decrypt } from './gatewayCrypto.js';
import logger from './logger.js';

const PB_BASE = process.env.POCKETBASE_URL || 'http://localhost:8090';

/**
 * Atomically claim an order for activation (duplicate-execution fix — see
 * order-activation-claim.pb.js for the full rationale). Performs ONE
 * conditional UPDATE (status: not-paid -> 'paid') on the PocketBase side;
 * returns true only for the single caller whose UPDATE actually flipped the
 * row, so the webhook, the /stripe/verify-order fallback and the admin
 * /stripe/reconcile action can never both activate the same order even if
 * they run at nearly the same instant.
 */
async function claimOrderActivation(orderId) {
	try {
		const res = await fetch(
			`${PB_BASE}/ef/orders/${encodeURIComponent(orderId)}/claim-activation`,
			{
				method: 'POST',
				headers: { Authorization: pocketbaseClient.authStore.token },
			},
		);
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			logger.error('order activation claim request failed', orderId, res.status, JSON.stringify(body));
			return false;
		}
		return !!body.claimed;
	} catch (e) {
		logger.error('order activation claim request errored', orderId, String(e));
		return false;
	}
}

/**
 * Dual-write the real per-user Subscription record (user_subscriptions) —
 * see 1789400000_create_plans_and_entitlements.js. `users.subscription_*`
 * fields stay the primary source every existing caller already reads
 * (RevenuePanel, SpecialAccessPanel, subscriptionUtils.js, SubscriptionPanel)
 * — this keeps the new per-user Subscription record in sync with the same
 * decision, never a second source that can disagree. Best-effort: a failure
 * here must never fail the real Stripe activation above it.
 */
async function upsertUserSubscription(userId, packageKey, patch) {
	try {
		let planId = null;
		if (packageKey) {
			const plans = await pocketbaseClient
				.collection('plans')
				.getFullList({ filter: `key = "${packageKey}"` });
			if (plans[0]) planId = plans[0].id;
		}
		const existing = await pocketbaseClient
			.collection('user_subscriptions')
			.getFullList({ filter: `user = "${userId}"` });
		const data = { user: userId, ...patch };
		if (planId) data.plan = planId;
		if (existing[0]) {
			await pocketbaseClient.collection('user_subscriptions').update(existing[0].id, data);
		} else if (planId) {
			// A brand-new row needs a plan relation (required field) — skip
			// creating one here if we don't have a plan to attach (e.g. an
			// extra_property purchase before any user_subscriptions row
			// exists yet, which should not normally happen since trial
			// assignment always creates one first).
			await pocketbaseClient.collection('user_subscriptions').create(data);
		}
	} catch (e) {
		logger.error('user_subscriptions dual-write failed:', String(e));
	}
}

/**
 * Activate the purchased package on the user record. Idempotent — skips if
 * the order is already paid/approved (Stripe may deliver the event twice,
 * or the fallback may run after the webhook already activated).
 *
 * `session` is the Stripe Checkout Session object (used for payment_intent).
 * It may be null when called from a context that only has the order record.
 *
 * Returns { activated, reason, packageKey?, userId? }. Throws on unexpected
 * errors (e.g. PocketBase write failure) so the caller can log + retry.
 */
export async function activateOrder(order, session) {
	if (!order) return { activated: false, reason: 'no_order' };
	if (order.status === 'paid' || order.status === 'approved') {
		return { activated: false, reason: 'already_paid' };
	}

	// Atomic claim — see claimOrderActivation() above. This is the real fix
	// for the webhook-vs-fallback-vs-reconcile race: only one caller ever
	// gets claimed === true for a given order, no matter how concurrently
	// they arrive. The plain status check above remains as a fast, cheap
	// short-circuit for the common (non-racing) case; the claim below is
	// what actually prevents a double activation.
	const claimed = await claimOrderActivation(order.id);
	if (!claimed) {
		return { activated: false, reason: 'already_paid' };
	}

	const userId = order.user;
	const packageKey = order.package;
	const now = new Date();

	let userRec;
	try {
		userRec = await pocketbaseClient.collection('users').getOne(userId);
	} catch (e) {
		logger.error('stripe activation: user not found', userId, String(e));
		return { activated: false, reason: 'user_not_found' };
	}

	if (packageKey === 'extra_property') {
		const current = Number(userRec.extra_properties_purchased || 0);
		const newExtra = current + 1;
		await pocketbaseClient.collection('users').update(userId, {
			extra_properties_purchased: newExtra,
		});
		await upsertUserSubscription(userId, null, { extra_properties_purchased: newExtra });
	} else {
		// annual / premium / unlimited → full calendar year ending the day
		// before the anniversary (e.g. 2026-09-20 → 2027-09-19).
		// If still active, extend from the current end; else start from now.
		const existingEnd = userRec.subscription_end
			? new Date(userRec.subscription_end)
			: null;
		const stillActive =
			existingEnd &&
			!isNaN(existingEnd.getTime()) &&
			existingEnd.getTime() > now.getTime();
		const start = stillActive
			? new Date(existingEnd.getTime())
			: new Date(now.getTime());
		if (stillActive) {
			// renew: new window starts the day after previous end
			start.setDate(start.getDate() + 1);
			start.setHours(0, 0, 0, 0);
		} else {
			start.setHours(0, 0, 0, 0);
		}
		const end = new Date(start.getTime());
		end.setFullYear(end.getFullYear() + 1);
		end.setDate(end.getDate() - 1);
		end.setHours(23, 59, 59, 999);
		await pocketbaseClient.collection('users').update(userId, {
			subscription_package: packageKey,
			subscription_start: start.toISOString(),
			subscription_end: end.toISOString(),
		});
		await upsertUserSubscription(userId, packageKey, {
			status: 'active',
			subscription_start: start.toISOString(),
			subscription_end: end.toISOString(),
		});
	}

	// status + processed_at were already committed atomically by the claim
	// above — only the remaining, non-critical fields need writing here.
	const patch = {};
	if (session && session.payment_intent) {
		patch.stripe_payment_id = String(session.payment_intent).slice(0, 200);
	}
	// Consume the one-time referral discount: if this order was placed with a
	// referral discount, mark the user so the discount can never be reused.
	const refDisc = Number(order.referral_discount_percent || 0);
	if (refDisc > 0 && userId) {
		try {
			await pocketbaseClient.collection('users').update(userId, {
				referral_discount_used: true,
			});
		} catch (e) {
			logger.error(
				'stripe activation: referral discount consume failed',
				String(e),
			);
		}
	}
	if (Object.keys(patch).length > 0) {
		await pocketbaseClient.collection('subscription_orders').update(order.id, patch);
	}
	return { activated: true, reason: 'ok', packageKey, userId };
}

/**
 * Retrieve a Stripe Checkout Session by id using a gateway's secret key.
 * Returns the session JSON or null on any failure (never throws).
 */
export async function retrieveStripeSession(sessionId, secretKey) {
	if (!sessionId || !secretKey) return null;
	try {
		const res = await fetch(
			`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
			{ headers: { Authorization: `Bearer ${secretKey}` } },
		);
		if (!res.ok) {
			logger.warn(
				'stripe activation: retrieve session non-ok',
				sessionId,
				res.status,
			);
			return null;
		}
		return await res.json();
	} catch (e) {
		logger.error('stripe activation: retrieve session failed', String(e));
		return null;
	}
}

/**
 * Find the active Stripe gateway and return its decrypted secret key.
 * Pass a specific gatewayId to use that gateway, or '' to use the first
 * active Stripe gateway. Returns null if none is available.
 */
export async function getActiveStripeSecretKey(gatewayId = '') {
	let gw = null;
	if (gatewayId) {
		try {
			gw = await pocketbaseClient
				.collection('payment_gateways')
				.getOne(gatewayId);
		} catch {
			gw = null;
		}
		if (!gw || gw.type !== 'stripe' || !gw.active) return null;
	} else {
		const all = await pocketbaseClient
			.collection('payment_gateways')
			.getFullList({ filter: "type = 'stripe' && active = true", sort: 'created' });
		gw = all && all.length > 0 ? all[0] : null;
	}
	if (!gw) return null;
	const config = gw.config && typeof gw.config === 'object' ? gw.config : {};
	const secretKey = decrypt(config.secret_key_enc);
	return secretKey || null;
}
