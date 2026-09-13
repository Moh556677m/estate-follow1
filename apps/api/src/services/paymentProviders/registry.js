// Payment Provider registry — Task #16.
//
// Single source of truth (server-side) for which gateway `type` values are
// genuinely wired to real payment processing code, and what each type's
// essential/credential fields are. Mirrored on the frontend in
// apps/web/src/lib/paymentGateways.js (GATEWAY_TYPES) for the admin form —
// same convention this file already followed before this task (comment in
// the old payment-gateways.js: "Mirrors the frontend GATEWAY_TYPES
// registry").
//
// PROVIDER_STATUS is the honesty gate: a type is only ever 'active' here
// once real request/response code exists for it in this codebase AND it can
// be exercised without external credentials this project does not have
// (Stripe — pre-existing, tested in Task #15; Crypto — new in this task,
// manual/custodial verification needs no external API). Every other type
// the business spec named (PayPal, Paymob, Adyen, Checkout.com, Apple/
// Google Pay) is declared as 'requires_credentials': its field shape is
// documented so an admin can see exactly what a future integration would
// need, but checkComplete() below NEVER allows it to be marked active, and
// the public `/active` route (payment-gateways.js) filters non-active
// provider types out regardless of the `active` flag on the record — so a
// half-configured stub can never appear as a broken payment button for an
// owner.
export const PROVIDER_STATUS = {
  stripe: 'active',
  crypto: 'active',
  // Egyptian manual-transfer wallets (Task: manual payment methods). Real,
  // usable today — the same justification as crypto: manual/human
  // verification needs no external API, so there is nothing "stubbed" about
  // these; an admin can configure and activate them right now.
  instapay: 'active',
  vodafone_cash: 'active',
  orange_cash: 'active',
  etisalat_cash: 'active',
  we_pay: 'active',
  paypal: 'requires_credentials',
  paymob: 'requires_credentials',
  adyen: 'requires_credentials',
  checkoutcom: 'requires_credentials',
  apple_pay: 'requires_credentials',
  google_pay: 'requires_credentials',
};

// Separates the Payment Method STRUCTURE (a payment_gateways record, its
// country/currency visibility, its config fields) from the EXECUTION method
// (how a payment actually gets verified). Today every 'manual' type is
// verified by a human Super Admin reviewing a submitted reference/proof
// (routes: POST /manual/submit, /manual/approve, /manual/reject — generic
// across every manual type except crypto, which keeps its own dedicated
// /crypto/* routes). An 'api_gateway' type is verified by a real API/webhook
// (Stripe today). Upgrading e.g. `vodafone_cash` from manual confirmation to
// a real API later is a one-line change here plus new route logic — it never
// requires touching payment_gateways/subscription_orders schema or rebuilding
// the frontend, because the gateway record shape and the order record shape
// are already identical for every type.
export const INTEGRATION_TYPE = {
  stripe: 'api_gateway',
  crypto: 'manual',
  instapay: 'manual',
  vodafone_cash: 'manual',
  orange_cash: 'manual',
  etisalat_cash: 'manual',
  we_pay: 'manual',
  paypal: 'api_gateway',
  paymob: 'api_gateway',
  adyen: 'api_gateway',
  checkoutcom: 'api_gateway',
  apple_pay: 'api_gateway',
  google_pay: 'api_gateway',
};

export function getIntegrationType(type) {
  return INTEGRATION_TYPE[type] || 'api_gateway';
}

// Shared field shape for every manual Egyptian-wallet type: `identifier` is
// whatever the customer sends money to (phone number, account, InstaPay
// address) and `beneficiary_name` is who it should show as paid to — both
// required to activate (the admin must tell the customer where to send
// money). `instructions`/`notes`/`min_amount`/`max_amount`/`display_order`
// are optional — `required: false` means they never block activation (see
// checkComplete below) even though they render as editable fields in the
// admin form. None of these are secrets — no encryption needed.
function manualWalletFields() {
  return [
    { name: 'identifier', prefix: '', secret: false, required: true },
    { name: 'beneficiary_name', prefix: '', secret: false, required: true },
    { name: 'instructions', prefix: '', secret: false, required: false },
    { name: 'notes', prefix: '', secret: false, required: false },
    { name: 'min_amount', prefix: '', secret: false, required: false },
    { name: 'max_amount', prefix: '', secret: false, required: false },
    { name: 'display_order', prefix: '', secret: false, required: false },
  ];
}

// Essential (simple, single-value) fields per type — used for the
// activation gate on the standard text-field types. Crypto is handled
// separately below (its "essential field" is a list of wallets, not a set
// of scalar fields) so it has no entry here.
export const ESSENTIAL_FIELDS = {
  stripe: [
    { name: 'publishable_key', prefix: 'pk_', secret: false },
    { name: 'secret_key', prefix: 'sk_', secret: true },
    { name: 'webhook_secret', prefix: 'whsec_', secret: true },
  ],
  // Documented, publicly-known credential shapes for providers this project
  // has no live account/credentials for yet. Declared so the admin UI can
  // show what would be required — NOT implemented, NOT activatable (see
  // checkComplete below, gated by PROVIDER_STATUS).
  paypal: [
    { name: 'client_id', prefix: '', secret: false },
    { name: 'client_secret', prefix: '', secret: true },
  ],
  paymob: [
    { name: 'api_key', prefix: '', secret: true },
    { name: 'integration_id', prefix: '', secret: false },
    { name: 'hmac_secret', prefix: '', secret: true },
  ],
  adyen: [
    { name: 'api_key', prefix: '', secret: true },
    { name: 'merchant_account', prefix: '', secret: false },
    { name: 'hmac_key', prefix: '', secret: true },
  ],
  checkoutcom: [
    { name: 'public_key', prefix: 'pk_', secret: false },
    { name: 'secret_key', prefix: 'sk_', secret: true },
    { name: 'webhook_signature_key', prefix: '', secret: true },
  ],
  apple_pay: [
    { name: 'merchant_id', prefix: 'merchant.', secret: false },
    { name: 'merchant_certificate', prefix: '', secret: true },
  ],
  google_pay: [
    { name: 'merchant_id', prefix: '', secret: false },
    { name: 'gateway_merchant_id', prefix: '', secret: false },
  ],
  instapay: manualWalletFields(),
  vodafone_cash: manualWalletFields(),
  orange_cash: manualWalletFields(),
  etisalat_cash: manualWalletFields(),
  we_pay: manualWalletFields(),
};

function decryptField(cfg, name, decrypt) {
  const enc = cfg[`${name}_enc`];
  if (!enc) return '';
  return decrypt(enc) || '';
}

/**
 * Crypto's completeness check: at least one configured wallet
 * (asset + network + address, all non-empty). Wallets are stored as a
 * single plain (non-secret) JSON-string field named `wallets` inside
 * `config` — no secrets involved (a receiving address is public by
 * design), so it flows through the exact same serializeConfig/mergeConfig/
 * toPublic machinery every other gateway type already uses, with zero
 * changes to that code.
 */
function checkCryptoComplete(cfg) {
  let wallets = [];
  try {
    wallets = JSON.parse(cfg.wallets || '[]');
  } catch {
    wallets = [];
  }
  const valid =
    Array.isArray(wallets) &&
    wallets.length > 0 &&
    wallets.every(
      (w) =>
        w &&
        String(w.asset || '').trim() &&
        String(w.network || '').trim() &&
        String(w.address || '').trim(),
    );
  return valid
    ? { complete: true, missing: [], invalid: [] }
    : { complete: false, missing: ['wallets'], invalid: [] };
}

/**
 * Whether `type` + `config` satisfy activation. `decrypt` is passed in
 * (rather than imported here) so this module has no dependency on the
 * encryption key material — it only ever sees already-decrypted values the
 * caller hands it.
 */
export function checkComplete(type, config, decrypt) {
  const cfg = config && typeof config === 'object' ? config : {};
  const status = PROVIDER_STATUS[type];
  if (status !== 'active') {
    // Deliberately NOT the same shape as "missing fields" — the frontend
    // shows a distinct "requires development" message instead of asking
    // the admin to fill in more fields that would not do anything.
    return { complete: false, missing: [], invalid: [], unsupported: true };
  }
  if (type === 'crypto') return checkCryptoComplete(cfg);

  const essential = ESSENTIAL_FIELDS[type];
  if (!essential) return { complete: false, missing: ['unknown_type'], invalid: [] };
  const missing = [];
  const invalid = [];
  essential.forEach((fd) => {
    // Optional descriptive/limit fields (instructions, notes, min/max
    // amount, display order) never block activation — only fields with no
    // `required: false` marker (the default for every pre-existing type) do.
    if (fd.required === false) return;
    if (fd.secret) {
      const plain = decryptField(cfg, fd.name, decrypt);
      if (!plain) { missing.push(fd.name); return; }
      if (fd.prefix && !String(plain).startsWith(fd.prefix)) invalid.push(fd.name);
    } else {
      const val = cfg[fd.name];
      if (!val || String(val).trim() === '') { missing.push(fd.name); return; }
      if (fd.prefix && !String(val).startsWith(fd.prefix)) invalid.push(fd.name);
    }
  });
  return { complete: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function isProviderActive(type) {
  return PROVIDER_STATUS[type] === 'active';
}
