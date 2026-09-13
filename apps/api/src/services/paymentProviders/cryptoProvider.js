// Crypto Payment Provider — Task #16.
//
// Manual/custodial verification, as specified: the owner sends funds to an
// admin-configured wallet address for a chosen asset+network (e.g. USDT on
// TRC20), then submits the on-chain transaction hash (+ optional proof
// file/notes) here. A Super Admin manually checks the transaction and
// clicks Confirm or Reject — there is no automatic on-chain verification
// (this project has no blockchain-node/explorer-API credentials to verify
// against, so none is faked).
//
// Activation itself reuses the EXISTING, already-tested, gateway-agnostic
// `activateOrder()` primitive from utils/stripeActivation.js — the same
// function the Stripe webhook and fallback routes call. Confirming a crypto
// order is just: atomically claim the order (via the same
// claimOrderActivation mechanism, since activateOrder() calls it
// internally) then run the exact same subscription/extra-property
// activation logic Stripe orders get. No parallel activation code path was
// written for crypto — this is precisely why `session` is optional in
// activateOrder(order, session).

/** Parse a gateway's configured wallet list (asset/network/address triples).
 * Never throws — returns [] on any malformed config. */
export function listWallets(gateway) {
  const cfg = gateway && gateway.config && typeof gateway.config === 'object' ? gateway.config : {};
  try {
    const wallets = JSON.parse(cfg.wallets || '[]');
    if (!Array.isArray(wallets)) return [];
    return wallets
      .filter((w) => w && w.asset && w.network && w.address)
      .map((w) => ({
        asset: String(w.asset).trim(),
        network: String(w.network).trim(),
        address: String(w.address).trim(),
      }));
  } catch {
    return [];
  }
}

/** Find the configured deposit address for a given asset+network on a
 * gateway, or null if that combination isn't configured. */
export function findWallet(gateway, asset, network) {
  const wallets = listWallets(gateway);
  const a = String(asset || '').trim().toUpperCase();
  const n = String(network || '').trim().toUpperCase();
  return (
    wallets.find(
      (w) => w.asset.toUpperCase() === a && w.network.toUpperCase() === n,
    ) || null
  );
}
