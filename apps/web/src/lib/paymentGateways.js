// Payment Gateways client + extensible gateway-type registry.
//
// The subscription system reads active gateways dynamically via
// `listActiveGateways()` — adding a new gateway TYPE here automatically flows
// it into the subscription/upgrade page with no changes to the subscription
// code. New providers only need an entry in GATEWAY_TYPES below.

import pb from '@/lib/pocketbaseClient';

const API_SERVER_URL = '/hcgi/api';

function getPocketbaseToken() {
	const pocketbaseToken = localStorage.getItem('pocketbase_auth');
	if (pocketbaseToken) {
		const bytes = new TextEncoder().encode(pocketbaseToken);
		const binary = String.fromCharCode(...bytes);
		return btoa(binary);
	}
	return null;
}

async function apiFetch(path, options = {}) {
	const token = getPocketbaseToken();
	const res = await window.fetch(API_SERVER_URL + path, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
			...(token && { Authorization: `Bearer ${token}` }),
		},
	});
	if (!res.ok) {
		let msg;
		try {
			const j = await res.json();
			msg = j.error || j.message;
		} catch {
			msg = await res.text().catch(() => '');
		}
		const e = new Error(msg || `Request failed (${res.status})`);
		e.status = res.status;
		throw e;
	}
	return res.json();
}

// ---- Gateway type registry (extensible) -----------------------------------
// Each type declares its provider-specific fields. `secret: true` fields are
// encrypted server-side and never returned in full. `prefix` is validated on
// submit. Add a new provider by adding an entry here — no migration needed
// (the `type` column is plain text).
// Shared field shape for the manual Egyptian-wallet types below. `identifier`
// is where the customer sends money (phone/account/InstaPay address, its
// label varies per method); `beneficiary_name` is who it should show as paid
// to. Both required. The rest are optional — `required: false` means
// checkGatewayFields() below never blocks activation over them, even though
// they still render as editable fields in the admin form and get saved.
function manualWalletFieldDefs(identifierLabel, identifierLabelAr) {
	return [
		{ name: 'identifier', label: identifierLabel, labelAr: identifierLabelAr, secret: false, prefix: '', required: true },
		{ name: 'beneficiary_name', label: 'Beneficiary name', labelAr: 'اسم المستفيد', secret: false, prefix: '', required: true },
		{ name: 'instructions', label: 'Payment instructions', labelAr: 'تعليمات الدفع', secret: false, prefix: '', required: false },
		{ name: 'notes', label: 'Additional notes', labelAr: 'ملاحظات إضافية', secret: false, prefix: '', required: false },
		{ name: 'min_amount', label: 'Minimum amount (optional)', labelAr: 'الحد الأدنى للمبلغ (اختياري)', secret: false, prefix: '', required: false },
		{ name: 'max_amount', label: 'Maximum amount (optional)', labelAr: 'الحد الأقصى للمبلغ (اختياري)', secret: false, prefix: '', required: false },
		{ name: 'display_order', label: 'Display order (optional)', labelAr: 'ترتيب الظهور (اختياري)', secret: false, prefix: '', required: false },
	];
}

export const GATEWAY_TYPES = {
	stripe: {
		label: 'Stripe',
		labelAr: 'سترايب',
		status: 'active',
		fields: [
			{
				name: 'publishable_key',
				label: 'Publishable Key',
				labelAr: 'مفتاح النشر (Publishable Key)',
				secret: false,
				prefix: 'pk_',
			},
			{
				name: 'secret_key',
				label: 'Secret Key',
				labelAr: 'المفتاح السري (Secret Key)',
				secret: true,
				prefix: 'sk_',
			},
			{
				name: 'webhook_secret',
				label: 'Webhook Signing Secret',
				labelAr: 'سر توقيع Webhook',
				secret: true,
				prefix: 'whsec_',
			},
		],
	},
	// Crypto is real (manual/custodial verification) — its "fields" are a
	// wallet list (asset+network+address), edited with a dedicated UI in
	// PaymentGatewaysPanel rather than the generic text-field loop, so it
	// declares `walletBased: true` and no scalar `fields`.
	crypto: {
		label: 'Crypto (manual verification)',
		labelAr: 'عملات رقمية (تحقق يدوي)',
		status: 'active',
		walletBased: true,
		fields: [],
	},
	// Named in the product spec but not yet wired to real payment-processing
	// code in this project (no live credentials/account to build and test
	// against). Field shapes below are each provider's real, publicly
	// documented credential names — declared so the admin can see exactly
	// what a future integration would need — but `status: 'requires_credentials'`
	// means these can NEVER be activated (server-enforced) and never appear
	// on the owner-facing subscription page, so nothing broken is ever shown
	// to a paying user.
	paypal: {
		label: 'PayPal',
		labelAr: 'باي بال',
		status: 'requires_credentials',
		fields: [
			{ name: 'client_id', label: 'Client ID', labelAr: 'معرّف العميل (Client ID)', secret: false, prefix: '' },
			{ name: 'client_secret', label: 'Client Secret', labelAr: 'السر (Client Secret)', secret: true, prefix: '' },
		],
	},
	paymob: {
		label: 'Paymob',
		labelAr: 'بايموب',
		status: 'requires_credentials',
		fields: [
			{ name: 'api_key', label: 'API Key', labelAr: 'مفتاح API', secret: true, prefix: '' },
			{ name: 'integration_id', label: 'Integration ID', labelAr: 'معرّف التكامل', secret: false, prefix: '' },
			{ name: 'hmac_secret', label: 'HMAC Secret', labelAr: 'سر HMAC', secret: true, prefix: '' },
		],
	},
	adyen: {
		label: 'Adyen',
		labelAr: 'أدين',
		status: 'requires_credentials',
		fields: [
			{ name: 'api_key', label: 'API Key', labelAr: 'مفتاح API', secret: true, prefix: '' },
			{ name: 'merchant_account', label: 'Merchant Account', labelAr: 'حساب التاجر', secret: false, prefix: '' },
			{ name: 'hmac_key', label: 'HMAC Key', labelAr: 'مفتاح HMAC', secret: true, prefix: '' },
		],
	},
	checkoutcom: {
		label: 'Checkout.com',
		labelAr: 'Checkout.com',
		status: 'requires_credentials',
		fields: [
			{ name: 'public_key', label: 'Public Key', labelAr: 'المفتاح العام', secret: false, prefix: 'pk_' },
			{ name: 'secret_key', label: 'Secret Key', labelAr: 'المفتاح السري', secret: true, prefix: 'sk_' },
			{ name: 'webhook_signature_key', label: 'Webhook Signature Key', labelAr: 'مفتاح توقيع Webhook', secret: true, prefix: '' },
		],
	},
	apple_pay: {
		label: 'Apple Pay',
		labelAr: 'Apple Pay',
		status: 'requires_credentials',
		fields: [
			{ name: 'merchant_id', label: 'Merchant ID', labelAr: 'معرّف التاجر', secret: false, prefix: 'merchant.' },
			{ name: 'merchant_certificate', label: 'Merchant Certificate', labelAr: 'شهادة التاجر', secret: true, prefix: '' },
		],
	},
	google_pay: {
		label: 'Google Pay',
		labelAr: 'Google Pay',
		status: 'requires_credentials',
		fields: [
			{ name: 'merchant_id', label: 'Merchant ID', labelAr: 'معرّف التاجر', secret: false, prefix: '' },
			{ name: 'gateway_merchant_id', label: 'Gateway Merchant ID', labelAr: 'معرّف تاجر البوابة', secret: false, prefix: '' },
		],
	},
	// Manual Egyptian wallets — real and activatable today (manual/human
	// review needs no external API, same justification as Crypto above).
	// `identifier`/`beneficiary_name` are required (the admin must tell the
	// customer where to send money); the rest are optional descriptive/limit
	// fields (`required: false` — see checkGatewayFields below) that still
	// render as editable inputs through the same generic field loop.
	instapay: {
		label: 'InstaPay',
		labelAr: 'إنستاباي',
		status: 'active',
		integrationType: 'manual',
		fields: manualWalletFieldDefs('InstaPay address', 'عنوان InstaPay'),
	},
	vodafone_cash: {
		label: 'Vodafone Cash',
		labelAr: 'فودافون كاش',
		status: 'active',
		integrationType: 'manual',
		fields: manualWalletFieldDefs('Phone number', 'رقم الهاتف'),
	},
	orange_cash: {
		label: 'Orange Cash',
		labelAr: 'أورانج كاش',
		status: 'active',
		integrationType: 'manual',
		fields: manualWalletFieldDefs('Phone number', 'رقم الهاتف'),
	},
	etisalat_cash: {
		label: 'e& / Etisalat Cash',
		labelAr: 'اتصالات كاش (e&)',
		status: 'active',
		integrationType: 'manual',
		fields: manualWalletFieldDefs('Phone number', 'رقم الهاتف'),
	},
	we_pay: {
		label: 'WE Pay',
		labelAr: 'وي باي',
		status: 'active',
		integrationType: 'manual',
		fields: manualWalletFieldDefs('Phone number / account', 'رقم الهاتف / الحساب'),
	},
};

export const GATEWAY_TYPE_OPTIONS = Object.keys(GATEWAY_TYPES).map((k) => ({
	value: k,
	label: GATEWAY_TYPES[k].label,
	labelAr: GATEWAY_TYPES[k].labelAr,
	status: GATEWAY_TYPES[k].status || 'requires_credentials',
}));

export function getGatewayType(key) {
	return GATEWAY_TYPES[key] || null;
}

export function gatewayTypeLabel(key, lang) {
	const t = GATEWAY_TYPES[key];
	if (!t) return key;
	return lang === 'ar' ? t.labelAr : t.label;
}

// Whether real payment-processing code exists for this type (mirrors the
// server-side PROVIDER_STATUS gate in
// apps/api/src/services/paymentProviders/registry.js). A type that is not
// 'active' can be saved with its credential fields filled in for later, but
// can never be marked Active — the admin UI should disable that toggle and
// show a clear "requires development" notice instead of pretending it works.
export function isProviderSupported(key) {
	const t = GATEWAY_TYPES[key];
	return !!t && t.status === 'active';
}

// ---- Completeness check (activation gate) ---------------------------------
// All fields declared for a gateway type are considered essential for
// activation. A gateway may be SAVED with empty fields (inactive), but it can
// only be ACTIVATED (and thus surface as a payment option) when every
// essential field is present and matches its expected prefix.
//
// `fieldsObj` accepts either raw input values (from the form) or the masked
// public shape returned by the API (masked secrets keep their prefix, so the
// prefix check still passes for stored values).
export function checkGatewayFields(typeKey, fieldsObj) {
	const type = getGatewayType(typeKey);
	if (!type) return { complete: false, missing: [], invalid: [] };
	if (type.status !== 'active') {
		// Never completable — see isProviderSupported() above.
		return { complete: false, missing: [], invalid: [], unsupported: true };
	}
	if (type.walletBased) {
		let wallets = [];
		try {
			wallets = JSON.parse((fieldsObj && fieldsObj.wallets) || '[]');
		} catch {
			wallets = [];
		}
		const valid =
			Array.isArray(wallets) &&
			wallets.length > 0 &&
			wallets.every((w) => w && String(w.asset || '').trim() && String(w.network || '').trim() && String(w.address || '').trim());
		return valid
			? { complete: true, missing: [], invalid: [] }
			: { complete: false, missing: [{ name: 'wallets', label: 'At least one wallet', labelAr: 'محفظة واحدة على الأقل' }], invalid: [] };
	}
	const missing = [];
	const invalid = [];
	type.fields.forEach((fd) => {
		// Optional descriptive/limit fields (instructions, notes, min/max
		// amount, display order) never block activation.
		if (fd.required === false) return;
		const val = String((fieldsObj && fieldsObj[fd.name]) || '').trim();
		if (!val) {
			missing.push(fd);
			return;
		}
		if (fd.prefix && !val.startsWith(fd.prefix)) invalid.push(fd);
	});
	return { complete: missing.length === 0 && invalid.length === 0, missing, invalid };
}

// Whether `key` is verified by manual human review (InstaPay/Vodafone
// Cash/etc, Crypto) vs a real API/webhook (Stripe). Mirrors the server-side
// INTEGRATION_TYPE map in registry.js.
export function gatewayIntegrationType(key) {
	const t = GATEWAY_TYPES[key];
	return (t && t.integrationType) || (t && t.walletBased ? 'manual' : 'api_gateway');
}

// Every gateway type key verified by manual human review, other than crypto
// (which keeps its own dedicated wallet-based UI/routes).
export const MANUAL_GATEWAY_TYPES = Object.keys(GATEWAY_TYPES).filter(
	(k) => GATEWAY_TYPES[k].integrationType === 'manual',
);

// Human-readable list of missing/invalid field labels for alerts.
export function formatIncompleteFields(check, lang) {
	const isAr = lang === 'ar';
	const names = [
		...check.missing,
		...check.invalid,
	].map((fd) => (isAr ? fd.labelAr : fd.label));
	return names.join(isAr ? '، ' : ', ');
}

// ---- API helpers -----------------------------------------------------------
export async function listGateways() {
	return apiFetch('/payment-gateways');
}

export async function listActiveGateways({ country = '', currency = '' } = {}) {
	const params = new URLSearchParams();
	if (country) params.set('country', country);
	if (currency) params.set('currency', currency);
	const qs = params.toString();
	return apiFetch(`/payment-gateways/active${qs ? `?${qs}` : ''}`);
}

export async function createGateway(payload) {
	return apiFetch('/payment-gateways', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export async function updateGateway(id, payload) {
	return apiFetch(`/payment-gateways/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(payload),
	});
}

export async function deleteGateway(id) {
	return apiFetch(`/payment-gateways/${id}`, { method: 'DELETE' });
}

// Super Admin diagnostic: is Stripe fully configured, and what webhook URL
// must be registered in the Stripe dashboard? Without a registered webhook
// endpoint, Stripe never calls back and packages are never activated.
export async function getStripeStatus() {
	return apiFetch('/payment-gateways/stripe/status');
}

// Create a Stripe Checkout Session for a package upgrade / extra-property
// purchase. Returns { url, orderId } — redirect the browser to `url` to
// reach Stripe's hosted checkout. The package is activated only after the
// Stripe webhook confirms payment (server-side), never on redirect alone.
export async function createStripeCheckoutSession(packageKey, gatewayId = '', currency = '') {
	const body = { packageKey };
	if (gatewayId) body.gatewayId = gatewayId;
	// Currency-per-country override (see countryCurrency.js) — only applied
	// server-side if the admin configured a `currency_prices` entry for this
	// exact currency on the plan; otherwise the plan's base currency is used
	// unchanged.
	if (currency) body.currency = currency;
	return apiFetch('/payment-gateways/stripe/checkout', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

// Owner-facing fallback: when a user returns from Stripe Checkout but the
// order is still `pending` (webhook delayed / misconfigured / signature
// mismatch), the server retrieves the Checkout Session directly from the
// Stripe API and activates the package if Stripe confirms payment_status ===
// 'paid'. Returns { activated, status, reason, packageKey? }.
export async function verifyStripeOrder(orderId) {
  return apiFetch('/payment-gateways/stripe/verify-order', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  });
}

// Super Admin: list pending orders that have a Stripe session id (candidates
// for reconciliation), with the user email + package for display.
export async function listPendingStripeOrders() {
  return apiFetch('/payment-gateways/stripe/pending-orders');
}

// Super Admin recovery: retrieve each pending order's session from the Stripe
// API and activate the package for any Stripe confirms as paid. Pass a
// specific orderId to reconcile one order, or '' to reconcile all.
export async function reconcileStripeOrders(orderId = '') {
  const body = orderId ? { orderId } : {};
  return apiFetch('/payment-gateways/stripe/reconcile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---- Crypto (manual/custodial verification) -------------------------------
// Submits an on-chain transaction for manual review. `proofFile` is
// optional (screenshot/PDF of the transaction). Multipart — cannot reuse
// apiFetch's JSON-only content type.
export async function submitCryptoPayment({ packageKey, gatewayId, asset, network, txHash, notes, proofFile, currency = '' }) {
	const token = getPocketbaseToken();
	const form = new FormData();
	form.append('packageKey', packageKey);
	if (gatewayId) form.append('gatewayId', gatewayId);
	form.append('asset', asset);
	form.append('network', network);
	form.append('txHash', txHash);
	if (notes) form.append('notes', notes);
	if (currency) form.append('currency', currency);
	if (proofFile) form.append('proof', proofFile);
	const res = await window.fetch(`${API_SERVER_URL}/payment-gateways/crypto/submit`, {
		method: 'POST',
		headers: { ...(token && { Authorization: `Bearer ${token}` }) },
		body: form,
	});
	if (!res.ok) {
		let msg;
		try {
			const j = await res.json();
			msg = j.error || j.message;
		} catch {
			msg = await res.text().catch(() => '');
		}
		const e = new Error(msg || `Request failed (${res.status})`);
		e.status = res.status;
		throw e;
	}
	return res.json();
}

// Super Admin: pending crypto submissions awaiting manual confirm/reject.
export async function listPendingCryptoOrders() {
	return apiFetch('/payment-gateways/crypto/pending');
}

export async function confirmCryptoOrder(orderId) {
	return apiFetch('/payment-gateways/crypto/confirm', {
		method: 'POST',
		body: JSON.stringify({ orderId }),
	});
}

export async function rejectCryptoOrder(orderId, note = '') {
	return apiFetch('/payment-gateways/crypto/reject', {
		method: 'POST',
		body: JSON.stringify({ orderId, note }),
	});
}

// ---- Manual payment methods (InstaPay, Vodafone Cash, Orange Cash,
// Etisalat Cash/e&, WE Pay — manual/human-review verification) -------------
// Submits a reference number and/or proof file for manual review.
// `proofFile` is optional. Multipart — cannot reuse apiFetch's JSON-only
// content type.
export async function submitManualPayment({ packageKey, gatewayId, method, reference, notes, proofFile, currency = '' }) {
	const token = getPocketbaseToken();
	const form = new FormData();
	form.append('packageKey', packageKey);
	if (gatewayId) form.append('gatewayId', gatewayId);
	form.append('method', method);
	if (reference) form.append('reference', reference);
	if (notes) form.append('notes', notes);
	if (currency) form.append('currency', currency);
	if (proofFile) form.append('proof', proofFile);
	const res = await window.fetch(`${API_SERVER_URL}/payment-gateways/manual/submit`, {
		method: 'POST',
		headers: { ...(token && { Authorization: `Bearer ${token}` }) },
		body: form,
	});
	if (!res.ok) {
		let msg;
		try {
			const j = await res.json();
			msg = j.error || j.message;
		} catch {
			msg = await res.text().catch(() => '');
		}
		const e = new Error(msg || `Request failed (${res.status})`);
		e.status = res.status;
		throw e;
	}
	return res.json();
}

// Super Admin: pending manual submissions awaiting approve/reject.
export async function listPendingManualOrders() {
	return apiFetch('/payment-gateways/manual/pending');
}

export async function approveManualOrder(orderId) {
	return apiFetch('/payment-gateways/manual/approve', {
		method: 'POST',
		body: JSON.stringify({ orderId }),
	});
}

export async function rejectManualOrder(orderId, reason = '') {
	return apiFetch('/payment-gateways/manual/reject', {
		method: 'POST',
		body: JSON.stringify({ orderId, reason }),
	});
}

// Re-export pb so consumers don't need a second import.
export { pb };
