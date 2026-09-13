import { Router } from 'express';
import { encrypt, decrypt } from '../utils/gatewayCrypto.js';
import { respondNotConfigured } from '../utils/integrationConfig.js';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import {
	activateOrder,
	retrieveStripeSession,
	getActiveStripeSecretKey,
} from '../utils/stripeActivation.js';
import {
	PROVIDER_STATUS,
	INTEGRATION_TYPE,
	checkComplete as checkProviderComplete,
	isProviderActive,
	listWallets,
	findWallet,
} from '../services/paymentProviders/index.js';
import { uploadFiles } from '../middleware/file-upload.js';

const router = Router();

// Every gateway `type` whose execution method is manual human review, other
// than crypto (which keeps its own dedicated /crypto/* routes above — left
// untouched). Computed from the registry so a future manual type only needs
// an INTEGRATION_TYPE entry, never a change to the routes below.
function manualTypeSet() {
	return new Set(
		Object.keys(INTEGRATION_TYPE).filter(
			(t) => INTEGRATION_TYPE[t] === 'manual' && t !== 'crypto',
		),
	);
}

// All endpoints require an authenticated PocketBase user. Super-Admin-only
// operations are additionally gated by requireSuperAdmin().
router.use(pocketbaseAuth);

const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';

// AES-256-GCM encryption/decryption for gateway secrets lives in
// utils/gatewayCrypto.js (shared with the Stripe webhook route).

// Mask a secret for display: keep a recognizable prefix (e.g. `sk_`) and the
// last 4 characters, hide everything in between. Never returns the full value.
function maskSecret(value) {
	const s = String(value || '');
	if (!s) return '';
	if (s.length <= 8) return '••••••••';
	const prefixMatch = s.match(/^([a-zA-Z]+_)/);
	const prefix = prefixMatch ? prefixMatch[1] : '';
	return `${prefix}••••••••${s.slice(-4)}`;
}

// ---- Authorization ---------------------------------------------------------
async function requireSuperAdmin(req) {
	const userId = req.pocketbaseUserId;
	if (!userId) {
		const e = new Error('PAYMENT_GATEWAY_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	let record;
	try {
		record = await pocketbaseClient.collection('users').getOne(userId);
	} catch {
		const e = new Error('PAYMENT_GATEWAY_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	const isSuper =
		!!record.is_super_admin ||
		String(record.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
	if (!isSuper) {
		const e = new Error('PAYMENT_GATEWAY_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	return record;
}

// ---- Essential fields (activation gate) -----------------------------------
// Real logic now lives in services/paymentProviders/registry.js, shared by
// every route below and documented there (also the PROVIDER_STATUS honesty
// gate: a type can never be activated here unless it is genuinely wired to
// real payment-processing code in this codebase).
function checkComplete(type, config) {
	return checkProviderComplete(type, config, decrypt);
}

// ---- Config (de)serialization ---------------------------------------------
// `config` json stores:
//   - public fields as plaintext (e.g. publishable_key)
//   - secret fields as `<name>_enc` encrypted blobs
// The frontend sends `fields` (all field values) + `secretFields` (names of
// the fields to encrypt). On update, a value that still contains the mask
// marker `••••` is treated as "leave unchanged".

function serializeConfig(fields, secretFields) {
	const secrets = Array.isArray(secretFields) ? secretFields : [];
	const config = {};
	Object.keys(fields || {}).forEach((k) => {
		const val = fields[k];
		if (val === undefined || val === null || val === '') return;
		if (secrets.includes(k)) {
			config[`${k}_enc`] = encrypt(val);
		} else {
			config[k] = val;
		}
	});
	return config;
}

function mergeConfig(prevConfig, fields, secretFields) {
	const secrets = Array.isArray(secretFields) ? secretFields : [];
	const config = {
		...(prevConfig && typeof prevConfig === 'object' ? prevConfig : {}),
	};
	Object.keys(fields || {}).forEach((k) => {
		const val = fields[k];
		if (val === undefined || val === null || val === '') return;
		// Masked value => keep the existing encrypted blob unchanged.
		if (typeof val === 'string' && val.includes('••••')) return;
		if (secrets.includes(k)) {
			config[`${k}_enc`] = encrypt(val);
			delete config[k];
		} else {
			config[k] = val;
		}
	});
	return config;
}

// Build a safe public representation of a gateway record. Secret fields are
// decrypted then masked — the full secret is NEVER sent to the browser.
function toPublic(gw) {
	const config = gw.config && typeof gw.config === 'object' ? gw.config : {};
	const out = {
		id: gw.id,
		type: gw.type,
		label: gw.label,
		mode: gw.mode,
		active: !!gw.active,
		created: gw.created,
		updated: gw.updated,
		fields: {},
		// Real capability signal for the admin UI — 'active' means real
		// payment-processing code exists for this type; 'requires_credentials'
		// means only the field shape is declared (see registry.js).
		providerStatus: PROVIDER_STATUS[gw.type] || 'requires_credentials',
		// 'manual' (human review, e.g. Vodafone Cash) vs 'api_gateway' (Stripe
		// today) — lets the admin UI label how a gateway is actually verified,
		// independent of its type. See registry.js's INTEGRATION_TYPE.
		integrationType: INTEGRATION_TYPE[gw.type] || 'api_gateway',
		allowedCountries: Array.isArray(gw.allowed_countries) ? gw.allowed_countries : [],
		allowedCurrencies: Array.isArray(gw.allowed_currencies) ? gw.allowed_currencies : [],
		// Deny-list — see 1791800000_payment_gateway_blocked_countries.js.
		// Always wins over allowedCountries: a country listed here is hidden
		// even if it also happens to be in allowedCountries.
		blockedCountries: Array.isArray(gw.blocked_countries) ? gw.blocked_countries : [],
	};
	if (gw.type === 'crypto') {
		out.wallets = listWallets(gw);
	}
	Object.keys(config).forEach((k) => {
		if (k.endsWith('_enc')) {
			const baseName = k.slice(0, -4);
			const plain = decrypt(config[k]);
			out.fields[baseName] = plain ? maskSecret(plain) : '••••••••';
		} else if (!k.endsWith('_hint')) {
			out.fields[k] = config[k];
		}
	});
	return out;
}

// ---- Routes ----------------------------------------------------------------

// GET /payment-gateways/active — any authenticated user.
// Returns the minimal public shape for the subscription/upgrade page.
// Optional ?country=XX&currency=YYY narrows results to gateways whose
// allowed_countries/allowed_currencies (when non-empty) include that value —
// an empty allow-list on a gateway (the default for every existing gateway)
// means "no restriction", so this is fully backward compatible.
// Provider types without real payment-processing code (PROVIDER_STATUS !==
// 'active') are always excluded here, even if a record was somehow marked
// active in the database — this is what stops an incomplete PayPal/Paymob/
// etc. stub from ever appearing as a broken payment option to an owner.
router.get('/active', async (req, res) => {
	try {
		const all = await pocketbaseClient
			.collection('payment_gateways')
			.getFullList({ filter: 'active = true', sort: 'created' });
		const country = String(req.query.country || '').trim().toUpperCase();
		const currency = String(req.query.currency || '').trim().toUpperCase();
		const filtered = all.filter((g) => {
			if (!isProviderActive(g.type)) return false;
			const countries = Array.isArray(g.allowed_countries) ? g.allowed_countries : [];
			if (country && countries.length > 0) {
				if (!countries.map((c) => String(c).toUpperCase()).includes(country)) return false;
			}
			// Deny-list always wins, independent of the allow-list above —
			// lets an admin say "show everywhere EXCEPT Egypt" without having
			// to enumerate every other country in allowedCountries.
			const blocked = Array.isArray(g.blocked_countries) ? g.blocked_countries : [];
			if (country && blocked.length > 0) {
				if (blocked.map((c) => String(c).toUpperCase()).includes(country)) return false;
			}
			const currencies = Array.isArray(g.allowed_currencies) ? g.allowed_currencies : [];
			if (currency && currencies.length > 0) {
				if (!currencies.map((c) => String(c).toUpperCase()).includes(currency)) return false;
			}
			return true;
		});
		// Optional admin-controlled display order (a plain, non-secret `config`
		// field — see registry.js's manualWalletFields()). Missing/zero sorts
		// last; ties keep the original `created` ordering from the query above.
		const manualTypes = manualTypeSet();
		filtered.sort((a, b) => {
			const da = Number((a.config && a.config.display_order) || 0) || 0;
			const db = Number((b.config && b.config.display_order) || 0) || 0;
			return da - db;
		});
		res.json(
			filtered.map((g) => {
				const cfg = g.config && typeof g.config === 'object' ? g.config : {};
				return {
					id: g.id,
					type: g.type,
					label: g.label,
					mode: g.mode,
					integrationType: INTEGRATION_TYPE[g.type] || 'api_gateway',
					...(g.type === 'crypto' ? { wallets: listWallets(g) } : {}),
					...(manualTypes.has(g.type)
						? {
								identifier: cfg.identifier || '',
								beneficiaryName: cfg.beneficiary_name || '',
								instructions: cfg.instructions || '',
								minAmount: Number(cfg.min_amount || 0) || 0,
								maxAmount: Number(cfg.max_amount || 0) || 0,
							}
						: {}),
				};
			}),
		);
	} catch {
		res.status(500).json({ error: 'Could not load payment gateways' });
	}
});

// GET /payment-gateways — Super Admin list (masked secrets).
router.get('/', async (req, res) => {
	try {
		await requireSuperAdmin(req);
		const all = await pocketbaseClient
			.collection('payment_gateways')
			.getFullList({ sort: '-created' });
		res.json(all.map(toPublic));
	} catch (err) {
		res.status(err.status || 500).json({
			error: err.message || 'Could not load payment gateways',
		});
	}
});

// POST /payment-gateways — create (Super Admin). Encrypts secret fields.
router.post('/', async (req, res) => {
	try {
		const admin = await requireSuperAdmin(req);
		const { type, label, mode, active, fields, secretFields, allowedCountries, allowedCurrencies, blockedCountries } = req.body || {};
		if (!type || !label || !mode) {
			return res
				.status(400)
				.json({ error: 'type, label and mode are required' });
		}
		if (!['test', 'live'].includes(mode)) {
			return res.status(400).json({ error: 'mode must be test or live' });
		}
		const config = serializeConfig(fields, secretFields);
		const wantActive = active !== false;
		if (wantActive) {
			const check = checkComplete(type, config);
			if (!check.complete) {
				return res.status(400).json({
					error: check.unsupported
						? 'This provider is not yet connected — it requires development before it can be activated'
						: 'Gateway cannot be activated — essential fields missing or invalid',
					missing: check.missing,
					invalid: check.invalid,
					unsupported: !!check.unsupported,
				});
			}
		}
		const rec = await pocketbaseClient.collection('payment_gateways').create({
			owner: admin.id,
			type: String(type).slice(0, 40),
			label: String(label).slice(0, 120),
			mode,
			active: wantActive,
			config,
			allowed_countries: Array.isArray(allowedCountries) ? allowedCountries.map((c) => String(c).slice(0, 10)) : [],
			allowed_currencies: Array.isArray(allowedCurrencies) ? allowedCurrencies.map((c) => String(c).slice(0, 10)) : [],
			blocked_countries: Array.isArray(blockedCountries) ? blockedCountries.map((c) => String(c).slice(0, 10)) : [],
		});
		res.json(toPublic(rec));
	} catch (err) {
		res.status(err.status || 500).json({
			error: err.message || 'Could not create payment gateway',
		});
	}
});

// PATCH /payment-gateways/:id — update (Super Admin).
// Secret fields are re-encrypted only when a non-masked value is submitted.
router.patch('/:id', async (req, res) => {
	try {
		await requireSuperAdmin(req);
		const { id } = req.params;
		let existing;
		try {
			existing = await pocketbaseClient
				.collection('payment_gateways')
				.getOne(id);
		} catch {
			return res.status(404).json({ error: 'Payment gateway not found' });
		}
		const { type, label, mode, active, fields, secretFields, allowedCountries, allowedCurrencies, blockedCountries } = req.body || {};
		const patch = {};
		if (type !== undefined) patch.type = String(type).slice(0, 40);
		if (label !== undefined) patch.label = String(label).slice(0, 120);
		if (mode !== undefined) {
			if (!['test', 'live'].includes(mode)) {
				return res
					.status(400)
					.json({ error: 'mode must be test or live' });
			}
			patch.mode = mode;
		}
		if (active !== undefined) patch.active = !!active;
		if (fields && typeof fields === 'object') {
			patch.config = mergeConfig(existing.config || {}, fields, secretFields);
		}
		if (allowedCountries !== undefined) {
			patch.allowed_countries = Array.isArray(allowedCountries)
				? allowedCountries.map((c) => String(c).slice(0, 10))
				: [];
		}
		if (allowedCurrencies !== undefined) {
			patch.allowed_currencies = Array.isArray(allowedCurrencies)
				? allowedCurrencies.map((c) => String(c).slice(0, 10))
				: [];
		}
		if (blockedCountries !== undefined) {
			patch.blocked_countries = Array.isArray(blockedCountries)
				? blockedCountries.map((c) => String(c).slice(0, 10))
				: [];
		}
		// Activation gate: refuse to flip active=true if the resulting config
		// is missing/invalid essential fields. Returns the exact field names.
		if (active === true) {
			const finalType = patch.type || existing.type;
			const finalConfig = patch.config || existing.config || {};
			const check = checkComplete(finalType, finalConfig);
			if (!check.complete) {
				return res.status(400).json({
					error: check.unsupported
						? 'This provider is not yet connected — it requires development before it can be activated'
						: 'Gateway cannot be activated — essential fields missing or invalid',
					missing: check.missing,
					invalid: check.invalid,
					unsupported: !!check.unsupported,
				});
			}
		}
		const rec = await pocketbaseClient
			.collection('payment_gateways')
			.update(id, patch);
		res.json(toPublic(rec));
	} catch (err) {
		res.status(err.status || 500).json({
			error: err.message || 'Could not update payment gateway',
		});
	}
});

// DELETE /payment-gateways/:id — Super Admin.
router.delete('/:id', async (req, res) => {
	try {
		await requireSuperAdmin(req);
		await pocketbaseClient
			.collection('payment_gateways')
			.delete(req.params.id);
		res.json({ ok: true });
	} catch (err) {
		res.status(err.status || 500).json({
			error: err.message || 'Could not delete payment gateway',
		});
	}
});

// ---------------------------------------------------------------------------
// Stripe Checkout — real payment flow (replaces the manual upgrade-request
// workflow). Creates a Stripe Checkout Session using the active Stripe
// gateway's decrypted secret key. The order is created as `pending`
// (awaiting payment); the Stripe webhook flips it to `paid` and activates
// the package automatically — no admin approval. Pressing the button or
// returning from Stripe is NEVER treated as success; only a verified
// Stripe webhook activates the package.
// ---------------------------------------------------------------------------

// Zero-decimal currencies (Stripe expects unit_amount = major units, not
// cents, for these). Everything else uses minor units (×100).
const ZERO_DECIMAL_CURRENCIES = new Set([
	'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg',
	'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/**
 * Pricing now reads the `plans` collection (Dynamic, Admin-editable — see
 * 1789400000_create_plans_and_entitlements.js) instead of the old
 * `subscription_settings` singleton, so an Admin price/discount edit is
 * reflected the very next time someone checks out — no redeploy, and any
 * NEW plan the Admin creates (not just the 3 original hardcoded ones)
 * becomes purchasable through this same Stripe flow automatically.
 */
function packageDiscountAmount(plan) {
	const price = Math.max(0, Number(plan.price || 0) || 0);
	const amt = Number(plan.discount_price || 0) || 0;
	return Math.min(price, Math.max(0, amt));
}

function packageAmount(packageKey, plan, extraPropertySourcePlan) {
	if (packageKey === 'extra_property') {
		const src = extraPropertySourcePlan;
		if (!src) return 0;
		const type = src.extra_property_type || 'percent';
		const v = Number(src.extra_property_value || 0);
		return type === 'fixed' ? v : (Number(src.price || 0) * v) / 100;
	}
	if (!plan) return 0;
	const price = Math.max(0, Number(plan.price || 0) || 0);
	const disc = packageDiscountAmount(plan);
	return Math.max(0, Math.round((price - disc) * 100) / 100);
}

/**
 * Currency-per-country pricing override (see
 * 1792100000_country_currency_settings.js). A plan's base
 * price/discount_price/currency is used unchanged UNLESS the client
 * requests a specific `currency` AND the admin configured a
 * `currency_prices` override for that exact currency on this plan — so a
 * plan/currency the admin never configured behaves exactly as before this
 * feature existed. Returns a shallow-overridden copy of `plan` (or the
 * original if there is nothing to override) so every existing call site
 * that reads `plan.price` / `plan.discount_price` / `plan.currency` keeps
 * working completely unchanged.
 */
function applyCurrencyOverride(plan, requestedCurrency) {
	if (!plan) return plan;
	const code = String(requestedCurrency || '').trim().toUpperCase();
	const baseCurrency = String(plan.currency || 'USD').toUpperCase();
	if (!code || code === baseCurrency) return plan;
	const overrides =
		plan.currency_prices && typeof plan.currency_prices === 'object' ? plan.currency_prices : {};
	const override = overrides[code];
	if (!override) return plan; // no override configured for this currency — keep the base plan
	return {
		...plan,
		price: Math.max(0, Number(override.price || 0) || Number(plan.price || 0) || 0),
		discount_price: Math.max(0, Number(override.discount_price || 0) || 0),
		currency: code,
	};
}

/** Any plan key except 'trial' (never purchasable) and 'extra_property'
 * (not a plan row — priced off the 'annual' plan's extra-property fields,
 * matching the pre-existing behavior). */
async function loadPurchasablePlan(packageKey) {
	if (!packageKey || packageKey === 'trial' || packageKey === 'extra_property') return null;
	const rows = await pocketbaseClient
		.collection('plans')
		.getFullList({ filter: `key = "${packageKey}" && active = true` });
	return rows && rows.length > 0 ? rows[0] : null;
}

async function loadAnnualPlan() {
	const rows = await pocketbaseClient
		.collection('plans')
		.getFullList({ filter: 'key = "annual"' });
	return rows && rows.length > 0 ? rows[0] : null;
}

async function findActiveStripeGateway() {
	const all = await pocketbaseClient
		.collection('payment_gateways')
		.getFullList({ filter: "type = 'stripe' && active = true", sort: 'created' });
	return all && all.length > 0 ? all[0] : null;
}

// GET /payment-gateways/stripe/status — Super Admin diagnostic.
// Returns whether an active Stripe gateway is configured and the public
// webhook URL the admin MUST register in the Stripe dashboard. Without a
// registered webhook endpoint, Stripe never calls back, so the package is
// never activated automatically — this is the #1 setup gap.
router.get('/stripe/status', async (req, res) => {
	try {
		await requireSuperAdmin(req);
		const gw = await findActiveStripeGateway();
		const config = gw && gw.config ? gw.config : {};
		const hasSecret = !!(config.secret_key_enc && decrypt(config.secret_key_enc));
		const hasWebhookSecret = !!(
			config.webhook_secret_enc && decrypt(config.webhook_secret_enc)
		);
		const origin =
			req.headers.origin ||
			(req.headers.referer
				? new URL(req.headers.referer).origin
				: `${req.protocol}://${req.get('host')}`);
		res.json({
			configured: !!gw && hasSecret && hasWebhookSecret,
			activeGateway: !!gw,
			hasSecretKey: hasSecret,
			hasWebhookSecret,
			// The public URL Stripe must POST signed events to.
			webhookUrl: `${origin}/hcgi/api/stripe/webhook`,
			events: [
				'checkout.session.completed',
				'checkout.session.async_payment_succeeded',
				'checkout.session.async_payment_failed',
				'checkout.session.expired',
			],
		});
	} catch (err) {
		res.status(err.status || 500).json({
			error: err.message || 'Could not load Stripe status',
		});
	}
});

// POST /payment-gateways/stripe/checkout  { packageKey, gatewayId? }
// → { url, orderId }  (redirect the browser to `url` — Stripe hosted checkout)
router.post('/stripe/checkout', async (req, res) => {
	try {
		const userId = req.pocketbaseUserId;
		if (!userId) {
			const e = new Error('UNAUTHORIZED');
			e.status = 401;
			throw e;
		}
		const { packageKey, gatewayId, currency: requestedCurrency } = req.body || {};
		let purchasePlan = null;
		if (packageKey !== 'extra_property') {
			purchasePlan = await loadPurchasablePlan(packageKey);
			if (!purchasePlan) {
				return res.status(400).json({ error: 'Invalid package' });
			}
			purchasePlan = applyCurrencyOverride(purchasePlan, requestedCurrency);
		}

		// Resolve the Stripe gateway to use (specific id, else first active).
		let gw = null;
		if (gatewayId) {
			try {
				gw = await pocketbaseClient
					.collection('payment_gateways')
					.getOne(gatewayId);
			} catch {
				gw = null;
			}
			if (!gw || gw.type !== 'stripe' || !gw.active) {
				return res
					.status(400)
					.json({ error: 'Selected payment method is unavailable' });
			}
		} else {
			gw = await findActiveStripeGateway();
		}
		if (!gw) {
			return respondNotConfigured(res, {
				integration: 'Stripe',
				envKeys: 'STRIPE_SECRET_KEY',
			});
		}

		const config = gw.config && typeof gw.config === 'object' ? gw.config : {};
		const secretKey = decrypt(config.secret_key_enc);
		if (!secretKey) {
			return respondNotConfigured(res, {
				integration: 'Stripe',
				envKeys: 'STRIPE_SECRET_KEY',
			});
		}

		let extraPropertySourcePlan = null;
		if (packageKey === 'extra_property') {
			extraPropertySourcePlan = await loadAnnualPlan();
			if (!extraPropertySourcePlan) {
				return res
					.status(503)
					.json({ error: 'Subscription pricing is not configured yet' });
			}
			extraPropertySourcePlan = applyCurrencyOverride(extraPropertySourcePlan, requestedCurrency);
		}
		const amount = packageAmount(packageKey, purchasePlan, extraPropertySourcePlan);
		if (!(amount > 0)) {
			return res.status(400).json({ error: 'Invalid amount for this package' });
		}

		// ---- Referral discount (first subscription only) ----
		// A user who signed up with a valid referral code (referred_by set) and
		// has NOT yet consumed their one-time discount gets the admin-configured
		// discount_percent off this purchase. Verified server-side: the client
		// cannot inject a discount. The discount is consumed (referral_discount_used
		// = true) only after the Stripe webhook confirms payment.
		let referralDiscountPercent = 0;
		let finalAmount = amount;
		try {
			const userRec = await pocketbaseClient.collection('users').getOne(userId);
			const referredBy = userRec.referred_by;
			const used = !!userRec.referral_discount_used;
			if (referredBy && !used) {
				const psRows = await pocketbaseClient
					.collection('platform_settings')
					.getFullList({ sort: 'created' });
				const ps = psRows && psRows.length > 0 ? psRows[0] : null;
				const cms = ps && ps.cms && typeof ps.cms === 'object' ? ps.cms : {};
				const ref = cms.referrals && typeof cms.referrals === 'object' ? cms.referrals : {};
				const dp = Number(ref.discount_percent);
				if (!isNaN(dp) && dp > 0 && dp <= 100) {
					referralDiscountPercent = dp;
					finalAmount = amount * (1 - dp / 100);
				}
			}
		} catch {
			/* discount is opt-in; ignore lookup failures */
		}

		const currencyCode = String(
			(purchasePlan && purchasePlan.currency) ||
				(extraPropertySourcePlan && extraPropertySourcePlan.currency) ||
				'USD',
		);
		const currency = currencyCode.toLowerCase();
		const unitAmount = ZERO_DECIMAL_CURRENCIES.has(currency)
			? Math.round(finalAmount)
			: Math.round(finalAmount * 100);

		// Duplicate-execution guard (system-wide audit finding): a double
		// click / accidental double form-submit on the checkout button used
		// to be able to create TWO `pending` orders for the same user +
		// package (nothing de-duped it — the requestKey below was made
		// unique per call, on purpose, so PocketBase's own auto-cancellation
		// never caught it either). Mirrors the same "one active job at a
		// time" pattern already used for AI extract jobs
		// (integrated-ai.js) — reject a second checkout attempt while a
		// very recent one for the same user+package is still pending,
		// instead of silently creating a second Stripe Checkout Session.
		try {
			const recentPending = await pocketbaseClient
				.collection('subscription_orders')
				.getFullList({
					filter: `user = "${userId}" && package = "${packageKey}" && status = "pending"`,
					sort: '-created',
					requestKey: null,
				});
			const now = Date.now();
			const dupe = recentPending.find((o) => {
				const createdMs = new Date(o.requested_at || o.created).getTime();
				return Number.isFinite(createdMs) && now - createdMs < 20_000;
			});
			if (dupe) {
				return res.status(409).json({
					error: 'A checkout for this package was just started — please wait a moment or use the existing tab.',
					reason: 'duplicate_request',
					orderId: dupe.id,
				});
			}
		} catch {
			/* best-effort guard only — never block checkout on a lookup failure */
		}

		// Create the order record as `pending` (awaiting Stripe payment).
		const order = await pocketbaseClient
			.collection('subscription_orders')
			.create(
				{
					user: userId,
					package: packageKey,
					amount: finalAmount,
					currency: currencyCode,
					status: 'pending',
					requested_at: new Date().toISOString(),
					gateway: gw.id,
					referral_discount_percent: referralDiscountPercent,
				},
				{ requestKey: `stripe-checkout-${userId}-${Date.now()}` },
			);

		const productNames = {
			annual: 'Annual Subscription',
			premium: 'Premium Package',
			unlimited: 'Unlimited Package',
			extra_property: 'Extra Property',
		};
		const productName =
			(purchasePlan && purchasePlan.name) || productNames[packageKey] || 'Subscription';

		// Prefill Checkout with the signed-in user's email/name when available.
		let customerEmail = '';
		let customerName = '';
		try {
			const userRec = await pocketbaseClient.collection('users').getOne(userId);
			customerEmail = String(userRec.email || '').trim();
			customerName = String(
				userRec.name || userRec.full_name || userRec.display_name || '',
			).trim();
		} catch {
			/* optional prefill */
		}

		const origin =
			req.headers.origin ||
			(req.headers.referer
				? new URL(req.headers.referer).origin
				: `${req.protocol}://${req.get('host')}`);

		const params = new URLSearchParams();
		params.append('mode', 'payment');
		params.append(
			'success_url',
			`${origin}/dashboard/subscription?paid=1&order=${order.id}`,
		);
		params.append('cancel_url', `${origin}/dashboard/subscription?cancelled=1`);
		params.append('client_reference_id', order.id);
		params.append('line_items[0][quantity]', '1');
		params.append('line_items[0][price_data][currency]', currency);
		params.append('line_items[0][price_data][unit_amount]', String(unitAmount));
		params.append('line_items[0][price_data][product_data][name]', productName);
		if (customerEmail) {
			params.append('customer_email', customerEmail);
		}
		if (customerName) {
			params.append('metadata[customerName]', customerName.slice(0, 200));
		}
		params.append('metadata[userId]', userId);
		params.append('metadata[packageKey]', packageKey);
		params.append('metadata[orderId]', order.id);
		params.append('metadata[gatewayId]', gw.id);

		const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${secretKey}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params,
		});
		if (!stripeRes.ok) {
			const txt = await stripeRes.text().catch(() => '');
			// Mark the order failed so it doesn't linger as pending.
			try {
				await pocketbaseClient
					.collection('subscription_orders')
					.update(order.id, { status: 'failed' });
			} catch {
				/* ignore */
			}
			throw new Error(
				`stripe checkout failed: ${stripeRes.status} ${stripeRes.statusText} ${txt}`.slice(0, 500),
			);
		}
		const session = await stripeRes.json();

		// Persist the Stripe session id for reconciliation.
		try {
			await pocketbaseClient
				.collection('subscription_orders')
				.update(order.id, { stripe_session_id: String(session.id).slice(0, 200) });
		} catch {
			/* ignore */
		}

		res.json({ url: session.url, orderId: order.id });
	} catch (err) {
		res.status(err.status || 500).json({
			error: err.message || 'Checkout failed',
		});
	}
});

// ---------------------------------------------------------------------------
// Fallback activation + admin recovery (Stripe API retrieval).
//
// The webhook is the primary activation path, but it is a single point of
// failure: if it is not registered in the Stripe dashboard, registered with
// the wrong URL, or the signing secret doesn't match, Stripe still charges
// the customer but the order stays `pending` and the package never activates.
//
// These endpoints retrieve the Checkout Session DIRECTLY from the Stripe API
// (using the stored stripe_session_id + the gateway's decrypted secret key)
// and activate the package when Stripe itself confirms payment_status ===
// 'paid'. Stripe's API is the source of truth — we never activate on the
// redirect alone and never guess a user or package.
// ---------------------------------------------------------------------------

// POST /payment-gateways/stripe/verify-order  { orderId }
// Owner-facing fallback. When a user returns from Stripe Checkout but the
// order is still `pending`, this retrieves the session from Stripe and
// activates if paid. The user may only verify their OWN order.
router.post('/stripe/verify-order', async (req, res) => {
	try {
		const userId = req.pocketbaseUserId;
		if (!userId) {
			const e = new Error('UNAUTHORIZED');
			e.status = 401;
			throw e;
		}
		const { orderId } = req.body || {};
		if (!orderId) return res.status(400).json({ error: 'orderId is required' });

		let order;
		try {
			order = await pocketbaseClient
				.collection('subscription_orders')
				.getOne(orderId);
		} catch {
			return res.status(404).json({ error: 'Order not found' });
		}
		// Owner may only verify their own order.
		if (String(order.user) !== String(userId)) {
			return res.status(403).json({ error: 'You can only verify your own order' });
		}
		// Already paid/approved — nothing to do (webhook already activated).
		if (order.status === 'paid' || order.status === 'approved') {
			return res.json({
				activated: false,
				status: order.status,
				reason: 'already_paid',
				packageKey: order.package,
			});
		}
		// Need a Stripe session id to verify with Stripe.
		const sessionId = order.stripe_session_id;
		if (!sessionId) {
			return res.json({
				activated: false,
				status: order.status,
				reason: 'no_stripe_session',
			});
		}
		const secretKey = await getActiveStripeSecretKey(order.gateway || '');
		if (!secretKey) {
			return res.json({
				activated: false,
				status: order.status,
				reason: 'no_active_gateway',
			});
		}
		const session = await retrieveStripeSession(sessionId, secretKey);
		if (!session) {
			return res.json({
				activated: false,
				status: order.status,
				reason: 'stripe_lookup_failed',
			});
		}
		if (session.payment_status === 'paid') {
			const result = await activateOrder(order, session);
			return res.json({
				activated: !!result.activated,
				status: 'paid',
				reason: result.reason,
				packageKey: order.package,
			});
		}
		// Stripe knows the session but it's not paid yet (open/expired).
		if (session.status === 'expired') {
			try {
				if (order.status === 'pending') {
					await pocketbaseClient
						.collection('subscription_orders')
						.update(order.id, { status: 'failed' });
				}
			} catch {
				/* ignore */
			}
			return res.json({ activated: false, status: 'failed', reason: 'expired' });
		}
		return res.json({
			activated: false,
			status: order.status,
			reason: 'not_paid',
			stripeStatus: session.status,
		});
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Verify failed' });
	}
});

// GET /payment-gateways/stripe/pending-orders — Super Admin.
// Lists pending orders that have a Stripe session id (candidates for
// reconciliation), with the user email + package for display. This is how
// the admin safely identifies a customer whose webhook never fired —
// without guessing, by reading the actual order records.
router.get('/stripe/pending-orders', async (req, res) => {
	try {
		await requireSuperAdmin(req);
		const all = await pocketbaseClient
			.collection('subscription_orders')
			.getFullList({
				filter: "status = 'pending' && stripe_session_id != ''",
				sort: '-created',
			});
		const out = [];
		for (const o of all || []) {
			let email = '';
			let name = '';
			try {
				const u = await pocketbaseClient.collection('users').getOne(o.user);
				email = u.email || '';
				name = u.name || '';
			} catch {
				/* user may be deleted */
			}
			out.push({
				id: o.id,
				user: o.user,
				email,
				name,
				package: o.package,
				amount: o.amount,
				currency: o.currency,
				status: o.status,
				stripe_session_id: o.stripe_session_id,
				created: o.created,
				requested_at: o.requested_at,
			});
		}
		res.json(out);
	} catch (err) {
		res.status(err.status || 500).json({
			error: err.message || 'Could not load pending orders',
		});
	}
});

// POST /payment-gateways/stripe/reconcile  { orderId? }
// Super Admin recovery. Retrieves each pending order's Checkout Session from
// the Stripe API and activates the package for any that Stripe confirms as
// paid. Pass a specific orderId to reconcile one order, or omit to reconcile
// all pending orders with a session id. Stripe's API is the source of truth
// — the admin does NOT guess; activation happens only when Stripe says paid.
router.post('/stripe/reconcile', async (req, res) => {
	try {
		await requireSuperAdmin(req);
		const { orderId } = req.body || {};
		const secretKey = await getActiveStripeSecretKey('');
		if (!secretKey) {
			return res.status(503).json({
				error: 'No active Stripe gateway with a secret key is configured',
			});
		}
		let orders = [];
		if (orderId) {
			try {
				const o = await pocketbaseClient
					.collection('subscription_orders')
					.getOne(orderId);
				orders = [o];
			} catch {
				return res.status(404).json({ error: 'Order not found' });
			}
		} else {
			const all = await pocketbaseClient
				.collection('subscription_orders')
				.getFullList({
					filter: "status = 'pending' && stripe_session_id != ''",
					sort: '-created',
				});
			orders = all || [];
		}
		const results = [];
		for (const order of orders) {
			const sessionId = order.stripe_session_id;
			if (!sessionId) {
				results.push({ orderId: order.id, activated: false, reason: 'no_stripe_session' });
				continue;
			}
			const session = await retrieveStripeSession(sessionId, secretKey);
			if (!session) {
				results.push({ orderId: order.id, activated: false, reason: 'stripe_lookup_failed' });
				continue;
			}
			if (session.payment_status === 'paid') {
				try {
					const r = await activateOrder(order, session);
					results.push({
						orderId: order.id,
						activated: !!r.activated,
						reason: r.reason,
						packageKey: order.package,
						userId: order.user,
					});
				} catch (e) {
					results.push({
						orderId: order.id,
						activated: false,
						reason: 'activation_error',
						error: String(e?.message || e),
					});
				}
			} else if (session.status === 'expired') {
				try {
					if (order.status === 'pending') {
						await pocketbaseClient
							.collection('subscription_orders')
							.update(order.id, { status: 'failed' });
					}
				} catch {
					/* ignore */
				}
				results.push({ orderId: order.id, activated: false, reason: 'expired' });
			} else {
				results.push({
					orderId: order.id,
					activated: false,
					reason: 'not_paid',
					stripeStatus: session.status,
				});
			}
		}
		res.json({ results });
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Reconcile failed' });
	}
});

// ---------------------------------------------------------------------------
// Crypto Payment Provider — manual/custodial verification (Task #16).
//
// Flow: owner picks an asset+network the admin has configured a deposit
// wallet for, sends the funds themselves (outside this app — this project
// has no blockchain node/explorer credentials to move or verify funds
// automatically), then submits the on-chain tx hash (+ optional proof file
// and notes) here. A Super Admin reviews the pending submissions and
// manually Confirms (which activates the package via the exact same
// activateOrder() Stripe orders use) or Rejects it. No webhook, no
// automatic on-chain check — this is intentionally the same manual/
// custodial shape the task spec asked for, not a simulated automatic one.
// ---------------------------------------------------------------------------

async function findActiveCryptoGateway(gatewayId) {
	if (gatewayId) {
		try {
			const gw = await pocketbaseClient.collection('payment_gateways').getOne(gatewayId);
			return gw && gw.type === 'crypto' && gw.active ? gw : null;
		} catch {
			return null;
		}
	}
	const all = await pocketbaseClient
		.collection('payment_gateways')
		.getFullList({ filter: "type = 'crypto' && active = true", sort: 'created' });
	return all && all.length > 0 ? all[0] : null;
}

// POST /payment-gateways/crypto/submit — multipart form.
// Fields: packageKey, gatewayId, asset, network, txHash, notes. File field
// `proof` is optional (screenshot/PDF of the transaction).
router.post(
	'/crypto/submit',
	uploadFiles({
		fieldName: 'proof',
		maxCount: 1,
		maxSizeMB: 20,
		allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
	}),
	async (req, res) => {
		try {
			const userId = req.pocketbaseUserId;
			if (!userId) {
				const e = new Error('UNAUTHORIZED');
				e.status = 401;
				throw e;
			}
			const { packageKey, gatewayId, asset, network, txHash, notes, currency: requestedCurrency } = req.body || {};
			if (!String(txHash || '').trim()) {
				return res.status(400).json({ error: 'A transaction hash is required' });
			}
			let purchasePlan = null;
			let extraPropertySourcePlan = null;
			if (packageKey === 'extra_property') {
				extraPropertySourcePlan = await loadAnnualPlan();
				if (!extraPropertySourcePlan) {
					return res.status(503).json({ error: 'Subscription pricing is not configured yet' });
				}
				extraPropertySourcePlan = applyCurrencyOverride(extraPropertySourcePlan, requestedCurrency);
			} else {
				purchasePlan = await loadPurchasablePlan(packageKey);
				if (!purchasePlan) return res.status(400).json({ error: 'Invalid package' });
				purchasePlan = applyCurrencyOverride(purchasePlan, requestedCurrency);
			}

			const gw = await findActiveCryptoGateway(gatewayId);
			if (!gw) {
				return res.status(503).json({ error: 'No active crypto payment gateway is configured' });
			}
			const wallet = findWallet(gw, asset, network);
			if (!wallet) {
				return res.status(400).json({ error: 'That asset/network combination is not accepted' });
			}

			const amount = packageAmount(packageKey, purchasePlan, extraPropertySourcePlan);
			if (!(amount > 0)) {
				return res.status(400).json({ error: 'Invalid amount for this package' });
			}
			const currencyCode = String(
				(purchasePlan && purchasePlan.currency) ||
					(extraPropertySourcePlan && extraPropertySourcePlan.currency) ||
					'USD',
			);

			// Prevent obvious resubmission spam: same user+package+txHash already pending/paid.
			try {
				const dupes = await pocketbaseClient.collection('subscription_orders').getFullList({
					filter: `user = "${userId}" && crypto_tx_hash = "${String(txHash).trim().slice(0, 200)}"`,
				});
				if (dupes && dupes.length > 0) {
					return res.status(409).json({
						error: 'This transaction hash was already submitted',
						orderId: dupes[0].id,
						status: dupes[0].status,
					});
				}
			} catch {
				/* best-effort guard only */
			}

			const orderData = {
				user: userId,
				package: packageKey,
				amount,
				currency: currencyCode,
				status: 'pending',
				requested_at: new Date().toISOString(),
				gateway: gw.id,
				crypto_asset: String(asset || wallet.asset).slice(0, 20),
				crypto_network: String(network || wallet.network).slice(0, 40),
				crypto_tx_hash: String(txHash).trim().slice(0, 200),
				crypto_notes: String(notes || '').slice(0, 1000),
			};

			let order;
			const file = req.files?.[0];
			if (file) {
				const formData = new FormData();
				Object.entries(orderData).forEach(([k, v]) => formData.append(k, v));
				const bytes = new Uint8Array(file.buffer);
				formData.append('crypto_proof', new Blob([bytes], { type: file.mimetype }), file.originalname || 'proof');
				order = await pocketbaseClient.collection('subscription_orders').create(formData);
			} else {
				order = await pocketbaseClient.collection('subscription_orders').create(orderData);
			}

			res.json({
				orderId: order.id,
				status: order.status,
				depositAddress: wallet.address,
				asset: wallet.asset,
				network: wallet.network,
			});
		} catch (err) {
			res.status(err.status || 500).json({ error: err.message || 'Could not submit crypto payment' });
		}
	},
);

// GET /payment-gateways/crypto/pending — Super Admin.
// Lists crypto submissions awaiting manual review (status pending, has a tx
// hash), with the user email/name and the wallet the funds were sent to.
router.get('/crypto/pending', async (req, res) => {
	try {
		await requireSuperAdmin(req);
		const all = await pocketbaseClient.collection('subscription_orders').getFullList({
			filter: "status = 'pending' && crypto_tx_hash != ''",
			sort: '-created',
		});
		let fileToken = '';
		try {
			fileToken = await pocketbaseClient.files.getToken();
		} catch {
			fileToken = '';
		}
		const out = [];
		for (const o of all || []) {
			let email = '';
			let name = '';
			try {
				const u = await pocketbaseClient.collection('users').getOne(o.user);
				email = u.email || '';
				name = u.name || '';
			} catch {
				/* user may be deleted */
			}
			out.push({
				id: o.id,
				user: o.user,
				email,
				name,
				package: o.package,
				amount: o.amount,
				currency: o.currency,
				crypto_asset: o.crypto_asset,
				crypto_network: o.crypto_network,
				crypto_tx_hash: o.crypto_tx_hash,
				crypto_notes: o.crypto_notes,
				has_proof: !!o.crypto_proof,
				proof_url: o.crypto_proof && fileToken
					? `${pocketbaseClient.files.getURL(o, o.crypto_proof)}?token=${fileToken}`
					: '',
				created: o.created,
			});
		}
		res.json(out);
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Could not load crypto submissions' });
	}
});

// POST /payment-gateways/crypto/confirm  { orderId }
// Super Admin manually confirms the on-chain transaction after checking it
// themselves. Activation reuses the exact same activateOrder() primitive
// the Stripe webhook/fallback use — same idempotent claim, same
// subscription/extra-property logic, no separate code path.
router.post('/crypto/confirm', async (req, res) => {
	try {
		const admin = await requireSuperAdmin(req);
		const { orderId } = req.body || {};
		if (!orderId) return res.status(400).json({ error: 'orderId is required' });
		let order;
		try {
			order = await pocketbaseClient.collection('subscription_orders').getOne(orderId);
		} catch {
			return res.status(404).json({ error: 'Order not found' });
		}
		if (!order.crypto_tx_hash) {
			return res.status(400).json({ error: 'This order is not a crypto submission' });
		}
		const result = await activateOrder(order, null);
		try {
			await pocketbaseClient.collection('subscription_orders').update(orderId, {
				crypto_reviewed_by: admin.id,
				crypto_reviewed_at: new Date().toISOString(),
			});
		} catch {
			/* non-critical bookkeeping */
		}
		res.json({ activated: !!result.activated, reason: result.reason, packageKey: order.package });
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Confirm failed' });
	}
});

// POST /payment-gateways/crypto/reject  { orderId, note? }
router.post('/crypto/reject', async (req, res) => {
	try {
		const admin = await requireSuperAdmin(req);
		const { orderId, note } = req.body || {};
		if (!orderId) return res.status(400).json({ error: 'orderId is required' });
		let order;
		try {
			order = await pocketbaseClient.collection('subscription_orders').getOne(orderId);
		} catch {
			return res.status(404).json({ error: 'Order not found' });
		}
		if (order.status !== 'pending') {
			return res.status(409).json({ error: 'Order is no longer pending' });
		}
		const updated = await pocketbaseClient.collection('subscription_orders').update(orderId, {
			status: 'failed',
			crypto_reviewed_by: admin.id,
			crypto_reviewed_at: new Date().toISOString(),
			note: String(note || '').slice(0, 1000),
		});
		res.json({ ok: true, status: updated.status });
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Reject failed' });
	}
});

// ---------------------------------------------------------------------------
// Generic MANUAL payment methods — InstaPay, Vodafone Cash, Orange Cash,
// Etisalat Cash/e&, WE Pay, and any future manual wallet type (registry.js's
// INTEGRATION_TYPE === 'manual', other than crypto, which keeps its own
// dedicated /crypto/* routes above, untouched).
//
// Flow: owner picks a configured method, sees the identifier/beneficiary
// name/instructions the admin configured, transfers the money themselves,
// then submits a reference number and/or proof file here. A Super Admin
// reviews pending submissions and Approves (activates the package via the
// exact same activateOrder() Stripe/Crypto orders use) or Rejects it with a
// reason. Mirrors the Crypto flow above field-for-field, generalized across
// `manual_method` instead of being asset/network-specific.
//
// Status convention — deliberately reuses the EXISTING 'pending' / 'paid' /
// 'failed' values rather than new literal 'approved'/'rejected' strings, so
// this never diverges from what every other status-aware code path in this
// project already expects: planValidator.js's paid/unpaid mapping, the
// Stripe return-trip polling in SubscriptionPanel.jsx, RevenuePanel, and the
// order-activation-claim.pb.js atomic guard (which already treats 'paid'
// as the one terminal-success value). "Approved" / "Rejected" / "Pending"
// are the labels the admin/owner UI shows for status 'paid' / 'failed' /
// 'pending' on a manual order — a presentation choice, not a new DB value —
// so nothing that already reads subscription_orders.status has to change.
// ---------------------------------------------------------------------------

async function findActiveManualGateway(type, gatewayId) {
	if (gatewayId) {
		try {
			const gw = await pocketbaseClient.collection('payment_gateways').getOne(gatewayId);
			if (gw && gw.type === type && gw.active) return gw;
		} catch {
			/* fall through to the default lookup below */
		}
	}
	const all = await pocketbaseClient
		.collection('payment_gateways')
		.getFullList({ filter: `type = '${type}' && active = true`, sort: 'created' });
	return all && all.length > 0 ? all[0] : null;
}

// POST /payment-gateways/manual/submit — multipart form.
// Fields: packageKey, gatewayId, method (the gateway `type`, e.g.
// 'vodafone_cash'), reference, notes. File field `proof` is optional.
router.post(
	'/manual/submit',
	uploadFiles({
		fieldName: 'proof',
		maxCount: 1,
		maxSizeMB: 20,
		allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
	}),
	async (req, res) => {
		try {
			const userId = req.pocketbaseUserId;
			if (!userId) {
				const e = new Error('UNAUTHORIZED');
				e.status = 401;
				throw e;
			}
			const { packageKey, gatewayId, method, reference, notes, currency: requestedCurrency } = req.body || {};
			const type = String(method || '').trim();
			if (!manualTypeSet().has(type)) {
				return res.status(400).json({ error: 'Unknown manual payment method' });
			}
			let purchasePlan = null;
			let extraPropertySourcePlan = null;
			if (packageKey === 'extra_property') {
				extraPropertySourcePlan = await loadAnnualPlan();
				if (!extraPropertySourcePlan) {
					return res.status(503).json({ error: 'Subscription pricing is not configured yet' });
				}
				extraPropertySourcePlan = applyCurrencyOverride(extraPropertySourcePlan, requestedCurrency);
			} else {
				purchasePlan = await loadPurchasablePlan(packageKey);
				if (!purchasePlan) return res.status(400).json({ error: 'Invalid package' });
				purchasePlan = applyCurrencyOverride(purchasePlan, requestedCurrency);
			}

			const gw = await findActiveManualGateway(type, gatewayId);
			if (!gw) {
				return res.status(503).json({ error: 'No active payment method of this type is configured' });
			}
			const cfg = gw.config && typeof gw.config === 'object' ? gw.config : {};

			const amount = packageAmount(packageKey, purchasePlan, extraPropertySourcePlan);
			if (!(amount > 0)) {
				return res.status(400).json({ error: 'Invalid amount for this package' });
			}
			const minAmount = Number(cfg.min_amount || 0) || 0;
			const maxAmount = Number(cfg.max_amount || 0) || 0;
			if (minAmount > 0 && amount < minAmount) {
				return res.status(400).json({ error: 'Amount is below the minimum allowed for this method' });
			}
			if (maxAmount > 0 && amount > maxAmount) {
				return res.status(400).json({ error: 'Amount is above the maximum allowed for this method' });
			}
			const currencyCode = String(
				(purchasePlan && purchasePlan.currency) ||
					(extraPropertySourcePlan && extraPropertySourcePlan.currency) ||
					'USD',
			);

			// Prevent obvious resubmission spam: same user+reference already submitted.
			const refValue = String(reference || '').trim().slice(0, 200);
			if (refValue) {
				try {
					const dupes = await pocketbaseClient.collection('subscription_orders').getFullList({
						filter: `user = "${userId}" && manual_reference = "${refValue}"`,
					});
					if (dupes && dupes.length > 0) {
						return res.status(409).json({
							error: 'This reference was already submitted',
							orderId: dupes[0].id,
							status: dupes[0].status,
						});
					}
				} catch {
					/* best-effort guard only */
				}
			}

			const orderData = {
				user: userId,
				package: packageKey,
				amount,
				currency: currencyCode,
				status: 'pending',
				requested_at: new Date().toISOString(),
				gateway: gw.id,
				manual_method: type,
				manual_reference: refValue,
				manual_notes: String(notes || '').slice(0, 1000),
			};

			let order;
			const file = req.files?.[0];
			if (file) {
				const formData = new FormData();
				Object.entries(orderData).forEach(([k, v]) => formData.append(k, v));
				const bytes = new Uint8Array(file.buffer);
				formData.append('manual_proof', new Blob([bytes], { type: file.mimetype }), file.originalname || 'proof');
				order = await pocketbaseClient.collection('subscription_orders').create(formData);
			} else {
				order = await pocketbaseClient.collection('subscription_orders').create(orderData);
			}

			res.json({
				orderId: order.id,
				status: order.status,
				method: type,
				identifier: cfg.identifier || '',
				beneficiaryName: cfg.beneficiary_name || '',
				instructions: cfg.instructions || '',
			});
		} catch (err) {
			res.status(err.status || 500).json({ error: err.message || 'Could not submit payment' });
		}
	},
);

// GET /payment-gateways/manual/pending — Super Admin.
router.get('/manual/pending', async (req, res) => {
	try {
		await requireSuperAdmin(req);
		const all = await pocketbaseClient.collection('subscription_orders').getFullList({
			filter: "status = 'pending' && manual_method != ''",
			sort: '-created',
		});
		let fileToken = '';
		try {
			fileToken = await pocketbaseClient.files.getToken();
		} catch {
			fileToken = '';
		}
		const out = [];
		for (const o of all || []) {
			let email = '';
			let name = '';
			try {
				const u = await pocketbaseClient.collection('users').getOne(o.user);
				email = u.email || '';
				name = u.name || '';
			} catch {
				/* user may be deleted */
			}
			out.push({
				id: o.id,
				user: o.user,
				email,
				name,
				package: o.package,
				amount: o.amount,
				currency: o.currency,
				method: o.manual_method,
				reference: o.manual_reference,
				notes: o.manual_notes,
				has_proof: !!o.manual_proof,
				proof_url: o.manual_proof && fileToken
					? `${pocketbaseClient.files.getURL(o, o.manual_proof)}?token=${fileToken}`
					: '',
				created: o.created,
			});
		}
		res.json(out);
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Could not load manual submissions' });
	}
});

// POST /payment-gateways/manual/approve  { orderId }
// Reuses activateOrder() exactly like Stripe/Crypto — same atomic claim,
// same subscription/extra-property activation logic. Resulting status is
// 'paid' (the codebase's existing terminal-success value); the UI shows
// this as "Approved" for manual orders.
router.post('/manual/approve', async (req, res) => {
	try {
		const admin = await requireSuperAdmin(req);
		const { orderId } = req.body || {};
		if (!orderId) return res.status(400).json({ error: 'orderId is required' });
		let order;
		try {
			order = await pocketbaseClient.collection('subscription_orders').getOne(orderId);
		} catch {
			return res.status(404).json({ error: 'Order not found' });
		}
		if (!order.manual_method) {
			return res.status(400).json({ error: 'This order is not a manual payment submission' });
		}
		const result = await activateOrder(order, null);
		try {
			await pocketbaseClient.collection('subscription_orders').update(orderId, {
				manual_reviewed_by: admin.id,
				manual_reviewed_at: new Date().toISOString(),
			});
		} catch {
			/* non-critical bookkeeping */
		}
		res.json({ activated: !!result.activated, reason: result.reason, packageKey: order.package });
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Approve failed' });
	}
});

// POST /payment-gateways/manual/reject  { orderId, reason? }
router.post('/manual/reject', async (req, res) => {
	try {
		const admin = await requireSuperAdmin(req);
		const { orderId, reason } = req.body || {};
		if (!orderId) return res.status(400).json({ error: 'orderId is required' });
		let order;
		try {
			order = await pocketbaseClient.collection('subscription_orders').getOne(orderId);
		} catch {
			return res.status(404).json({ error: 'Order not found' });
		}
		if (order.status !== 'pending') {
			return res.status(409).json({ error: 'Order is no longer pending' });
		}
		const updated = await pocketbaseClient.collection('subscription_orders').update(orderId, {
			status: 'failed',
			manual_reviewed_by: admin.id,
			manual_reviewed_at: new Date().toISOString(),
			manual_rejection_reason: String(reason || '').slice(0, 1000),
		});
		res.json({ ok: true, status: updated.status });
	} catch (err) {
		res.status(err.status || 500).json({ error: err.message || 'Reject failed' });
	}
});

export default router;
