// Currency-per-country system.
//
// Admin sets a default currency (and optionally more than one allowed
// currency) per country in `country_currency_settings` — managed directly
// through PocketBase (no dedicated Express route needed), exactly the same
// pattern SubscriptionManagementPanel.jsx already uses for `plans`: the
// collection's own rules (see 1792100000_country_currency_settings.js)
// already restrict writes to Super Admin, reads to any authenticated user.
//
// An empty/unconfigured country ALWAYS falls back to the plan's existing
// base price/currency — this feature is additive, never a behavior change
// for a country the admin hasn't touched.

import pb from '@/lib/pocketbaseClient';

export async function listCountryCurrencySettings() {
	try {
		return await pb.collection('country_currency_settings').getFullList({ sort: 'country' });
	} catch {
		return [];
	}
}

export async function upsertCountryCurrencySetting({ id, country, defaultCurrency, currencies }) {
	const def = String(defaultCurrency || '').trim().toUpperCase().slice(0, 10);
	const list =
		Array.isArray(currencies) && currencies.length > 0
			? Array.from(new Set(currencies.map((c) => String(c).trim().toUpperCase()).filter(Boolean)))
			: def
				? [def]
				: [];
	const payload = {
		country: String(country || '').trim().toUpperCase().slice(0, 10),
		default_currency: def,
		currencies: list,
	};
	if (id) return pb.collection('country_currency_settings').update(id, payload);
	return pb.collection('country_currency_settings').create(payload);
}

export async function deleteCountryCurrencySetting(id) {
	return pb.collection('country_currency_settings').delete(id);
}

// Resolve which currency applies for `country` (an ISO-3166 alpha-2 code —
// the same format already stored in `users.nationality` and used by
// payment_gateways.allowed_countries) given the admin-configured
// `settingsList` (from listCountryCurrencySettings()). Falls back to
// `fallbackCurrency` (the plan's/global base currency) when the country has
// no configured row.
export function resolveCurrencyForCountry(settingsList, country, fallbackCurrency) {
	const code = String(country || '').trim().toUpperCase();
	if (!code || !Array.isArray(settingsList)) return fallbackCurrency;
	const row = settingsList.find((r) => String(r.country || '').toUpperCase() === code);
	return (row && row.default_currency) || fallbackCurrency;
}

// Every currency allowed for `country` (for a currency picker on the
// checkout page), including the fallback when the country isn't configured.
export function allowedCurrenciesForCountry(settingsList, country, fallbackCurrency) {
	const code = String(country || '').trim().toUpperCase();
	const row = Array.isArray(settingsList)
		? settingsList.find((r) => String(r.country || '').toUpperCase() === code)
		: null;
	if (row && Array.isArray(row.currencies) && row.currencies.length > 0) return row.currencies;
	return fallbackCurrency ? [fallbackCurrency] : [];
}

// Resolve the { price, discountPrice, currency } to charge for `plan` in
// `currency` — an admin-configured per-currency override in
// plan.currency_prices (shape: { [CURRENCY]: { price, discount_price } }) if
// present, otherwise the plan's own base price/discount_price/currency
// unchanged (so a plan/country the admin never touched behaves exactly as
// before this feature existed).
export function resolvePlanPriceForCurrency(plan, currency) {
	const base = {
		price: Number(plan?.price || 0) || 0,
		discountPrice: Number(plan?.discount_price || 0) || 0,
		currency: String(plan?.currency || 'USD'),
	};
	if (!plan || !currency) return base;
	const code = String(currency).trim().toUpperCase();
	if (code === base.currency.toUpperCase()) return base;
	const overrides = plan.currency_prices && typeof plan.currency_prices === 'object' ? plan.currency_prices : {};
	const override = overrides[code];
	if (!override) return base; // no override configured for this currency — keep the base
	return {
		price: Number(override.price || 0) || base.price,
		discountPrice: Number(override.discount_price || 0) || 0,
		currency: code,
	};
}
