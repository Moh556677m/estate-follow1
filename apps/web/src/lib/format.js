export const formatCurrency = (amount, { currency = 'USD', locale = 'en-US', ...options } = {}) => {
	const n = Number(String(amount ?? 0).replace(/,/g, ''));
	const hasFraction = Number.isFinite(n) && Math.abs(n % 1) > 1e-9;
	return n.toLocaleString(locale || 'en-US', {
		style: 'currency',
		currency,
		maximumFractionDigits: hasFraction ? 2 : 0,
		minimumFractionDigits: 0,
		...options,
	});
};

export const formatNumber = (value, { locale = 'en-US', ...options } = {}) => {
	const n = Number(String(value ?? 0).replace(/,/g, ''));
	const hasFraction = Number.isFinite(n) && Math.abs(n % 1) > 1e-9;
	return n.toLocaleString(locale || 'en-US', {
		maximumFractionDigits: hasFraction ? 2 : 0,
		minimumFractionDigits: 0,
		...options,
	});
};

export const formatDate = (date, { locale, ...options } = {}) => {
	if (!date) return '';

	const parsed = new Date(date);

	if (Number.isNaN(parsed.getTime())) return '';

	return parsed.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', ...options });
};

export const truncate = (text, max = 120) => {
	if (!text) return '';

	return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
};

export const slugify = (text) =>
	String(text || '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s_-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
