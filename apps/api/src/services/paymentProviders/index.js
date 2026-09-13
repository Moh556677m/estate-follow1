// Payment Providers — single import point.
//
// Interface contract this rebuild establishes for any future gateway type:
//   - createPayment  → Stripe: POST /payment-gateways/stripe/checkout
//                       Crypto: POST /payment-gateways/crypto/submit
//   - verifyPayment  → Stripe: POST /payment-gateways/stripe/verify-order
//                       Crypto: manual — Super Admin reviews + confirms/rejects
//   - refundPayment  → not implemented for any provider yet (no refund flow
//                       exists in the product today); would live here.
//   - handleWebhook  → Stripe: routes/stripe-webhook.js (signature-verified,
//                       idempotent via order-activation-claim.pb.js)
//                       Crypto: no webhook — manual/custodial by design.
//   - healthCheck    → GET /payment-gateways/stripe/status (Stripe);
//                       PROVIDER_STATUS below doubles as the health/
//                       capability signal for every other type.
//
// Each concrete provider keeps its OWN route handlers in
// routes/payment-gateways.js (Stripe's pre-existing, tested routes are left
// completely unchanged) rather than being force-fitted into one generic
// handler — Stripe's flow (hosted checkout + webhook) and Crypto's flow
// (manual submission + admin review) are shaped too differently for a
// single generic function to serve both honestly. What IS shared and
// genuinely unified: the essential-fields/activation gate (registry.js) and
// the actual subscription-activation logic (utils/stripeActivation.js's
// activateOrder(), reused as-is by crypto confirmation).

export {
	PROVIDER_STATUS,
	ESSENTIAL_FIELDS,
	INTEGRATION_TYPE,
	getIntegrationType,
	checkComplete,
	isProviderActive,
} from './registry.js';
export { listWallets, findWallet } from './cryptoProvider.js';
