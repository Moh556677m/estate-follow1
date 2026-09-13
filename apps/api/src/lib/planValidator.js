/**
 * Deterministic parser / validator for Smart Payment Plan Reader AI output.
 *
 * Runs AFTER the vision model returns JSON. It does NOT call any AI — it is a
 * pure, deterministic pass that:
 *   - normalizes dates (Arabic/English months, dash/slash/dot separators) → ISO
 *   - normalizes Arabic-Indic digits
 *   - detects relative dates ("1 Month from Booking Date", "3 months after
 *     handover") → relative_to + offset_months + due_date = null
 *   - validates percentage (0-100) and amount (>= 0)
 *   - removes duplicates (same number/date/amount/percentage)
 *   - preserves document order / chronological order
 *   - marks low-confidence / undated rows as "needs_review"
 *   - never invents a date — unclear dates become due_date = null
 *
 * This is the server-side mirror of apps/web/src/lib/paymentPlanSmart.js,
 * so the backend returns the FINAL structured installment list (not raw AI
 * text) and the frontend can render it directly.
 */

const MONTHS = {
	jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
	apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
	aug: 7, august: 7, sep: 8, sept: 8, september: 8,
	oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const AR_MONTHS = {
	يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5,
	يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9,
	اكتوبر: 10, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
	'كانون الثاني': 1, شباط: 2, آذار: 3, اذار: 3, نيسان: 4,
	أيار: 5, ايار: 5, حزيران: 6, تموز: 7, آب: 8,
	أيلول: 9, ايلول: 9, 'تشرين الأول': 10, 'تشرين الثاني': 11, 'كانون الأول': 12,
};

function normalizeDigits(s) {
	return String(s || '')
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function clampIso(y, m, d) {
	if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
	const dt = new Date(Date.UTC(y, m - 1, d));
	if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function monthIndex(name) {
	const k = String(name || '').toLowerCase().replace(/\./g, '');
	return MONTHS[k] != null ? MONTHS[k] : null;
}

/** Parse many date formats → YYYY-MM-DD or ''. Never invents. */
export function parseFlexibleDate(raw) {
	if (raw == null || raw === '') return '';
	if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
		return toIsoDate(raw);
	}
	let s = normalizeDigits(raw).trim();
	if (!s) return '';

	// ISO
	let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (m) return clampIso(+m[1], +m[2], +m[3]);

	// DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
	m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
	if (m) {
		const d = +m[1];
		const mo = +m[2];
		const y = +m[3];
		if (d <= 31 && mo <= 12) return clampIso(y, mo, d);
	}

	// "15 September 2027" / "Sep 15, 2027"
	m = s.match(/^(\d{1,2})\s+([A-Za-z\u0600-\u06FF]+)\s*,?\s*(\d{4})$/);
	if (m) {
		const mo = monthIndex(m[2]);
		if (mo != null) return clampIso(+m[3], mo + 1, +m[1]);
	}
	m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s*,?\s*(\d{4})$/);
	if (m) {
		const mo = monthIndex(m[1]);
		if (mo != null) return clampIso(+m[3], mo + 1, +m[2]);
	}

	// Arabic month names with dash/slash/dot/whitespace separators
	m = s.match(/^(\d{1,2})[\s\-/.]+([^\s\d\-/.]+)[\s\-/.]+(\d{4})$/);
	if (m && AR_MONTHS[m[2]] != null) return clampIso(+m[3], AR_MONTHS[m[2]], +m[1]);
	m = s.match(/(\d{1,2})\s+([^\s\d]+(?:\s+[^\s\d]+)?)\s+(\d{4})/);
	if (m && AR_MONTHS[m[2]] != null) return clampIso(+m[3], AR_MONTHS[m[2]], +m[1]);

	const t = Date.parse(s);
	if (!Number.isNaN(t)) return toIsoDate(new Date(t));
	return '';
}

function toIsoDate(dt) {
	const y = dt.getFullYear();
	const m = String(dt.getMonth() + 1).padStart(2, '0');
	const d = String(dt.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Detect "N months after handover" phrasing → month count or null. */
export function parseRelativeHandoverOffset(text) {
	if (text == null || text === '') return null;
	const s = normalizeDigits(text).trim();
	if (!s) return null;
	const patterns = [
		/(\d+)\s*(?:أشهر|اشهر|شهر|months?|month)\s*(?:بعد\s*)?(?:التسليم|الاستلام|handover)/i,
		/(?:بعد)\s*(\d+)\s*(?:أشهر|اشهر|شهر|months?|month)\s*(?:من\s*)?(?:التسليم|الاستلام|handover)?/i,
		/(\d+)\s*months?\s*(?:after|from|post)\s*handover/i,
		/after\s*handover\s*[+:-]?\s*(\d+)\s*months?/i,
	];
	for (const p of patterns) {
		const m = s.match(p);
		if (m) {
			const n = Number(m[1]);
			if (Number.isFinite(n) && n > 0) return n;
		}
	}
	return null;
}

/** Detect "N months from booking date" phrasing → month count or null. */
export function parseRelativeBookingOffset(text) {
	if (text == null || text === '') return null;
	const s = normalizeDigits(text).trim();
	if (!s) return null;
	const patterns = [
		/(\d+)\s*(?:months?|month)\s*(?:from|after|of)?\s*(?:booking\s*date|reservation\s*date|contract\s*date|purchase\s*date)/i,
		/(?:from|after)\s*booking\s*date\s*[+:-]?\s*(\d+)\s*months?/i,
		/(\d+)\s*(?:أشهر|اشهر|شهر)\s*(?:من|بعد|خلال)?\s*(?:تاريخ\s*)?(?:الحجز|الشراء|العقد)/i,
		/(?:من|بعد|خلال)\s*(?:تاريخ\s*)?(?:الحجز|الشراء|العقد)\s*[+:-]?\s*(\d+)\s*(?:أشهر|اشهر|شهر)/i,
		/(\d+)\s*(?:أشهر|اشهر|شهر)\s*(?:من|بعد)\s*(?:تاريخ\s*)?(?:الحجز|الشراء|العقد)/i,
	];
	for (const p of patterns) {
		const m = s.match(p);
		if (m) {
			const n = Number(m[1]);
			if (Number.isFinite(n) && n > 0) return n;
		}
	}
	return null;
}

const STAGE_MAP = {
	first_payment: 'first_payment',
	down_payment: 'first_payment',
	pre_handover: 'pre_handover',
	handover: 'handover',
	post_handover: 'post_handover',
};

export function mapPaymentStage(raw) {
	const s = String(raw || '').toLowerCase();
	if (STAGE_MAP[s]) return STAGE_MAP[s];
	if (/post[_\s-]?handover|after\s*handover|بعد\s*الاستلام|بعد\s*التسليم/.test(s)) return 'post_handover';
	if (/handover|on\s*handover|at\s*handover|عند\s*الاستلام|عند\s*التسليم/.test(s) && !/post|بعد|after/.test(s)) return 'handover';
	if (/down\s*payment|first\s*payment|first\s*installment|booking|reservation|deposit|دفعة\s*أولى|القسط\s*الأول|عربون|مقدم|حجزية/.test(s)) return 'first_payment';
	if (/construction|during|installment|milestone|أثناء|إنشاء|بناء|pre[_\s-]?handover/.test(s)) return 'pre_handover';
	return 'pre_handover';
}

const PAYMENT_TYPE_MAP = {
	down_payment: 'first_payment',
	installment: 'recurring_installment',
	bullet: 'bullet_payment',
	handover: 'handover_payment',
	post_handover: 'post_handover_installment',
	custom: 'custom_payment',
};

export function mapPaymentType(raw) {
	const k = String(raw || '').toLowerCase();
	if (PAYMENT_TYPE_MAP[k]) return PAYMENT_TYPE_MAP[k];
	if (Object.values(PAYMENT_TYPE_MAP).includes(k)) return k;
	return 'custom_payment';
}

function normalizeMoney(v) {
	if (v == null || v === '') return '';
	const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
	return Number.isFinite(n) ? String(n) : '';
}

function moneyNumber(v) {
	const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
	return Number.isFinite(n) ? n : 0;
}

function rowConfidence(row) {
	const hasAmt = row.amount != null && row.amount !== '';
	const hasPct = row.percentage != null && row.percentage !== '';
	const hasDate = !!row.due_date || !!row.relative;
	const hasName = !!row.name;
	const modelConf = String(row.confidence || '').toLowerCase();

	let score = 0;
	if (hasAmt || hasPct) score += 1;
	if (hasDate) score += 1;
	if (hasName) score += 0.5;

	let conf;
	if (modelConf === 'high' || modelConf === 'low' || modelConf === 'medium') {
		if (modelConf === 'low') conf = 'low';
		else if (score >= 2.5) conf = 'high';
		else if (score >= 1.5) conf = 'medium';
		else conf = 'low';
	} else if (score >= 2.5) conf = 'high';
	else if (score >= 1.5) conf = 'medium';
	else conf = 'low';
	return conf;
}

function dedupeKey(r) {
	return [
		r.number || '',
		r.due_date || '',
		r.relative ? `rel:${r.relative.offset_months}` : '',
		moneyNumber(r.amount) || '',
		r.percentage || '',
	].join('|');
}

/** Merge + dedupe rows across pages, preferring the more complete row. */
export function mergeBatches(batches) {
	const seen = new Map();
	const ordered = [];
	(batches || []).forEach((batch) => {
		(batch || []).forEach((r) => {
			const key = dedupeKey(r);
			if (seen.has(key)) {
				const prev = seen.get(key);
				const merged = { ...prev, ...r };
				if (!prev.amount && r.amount) merged.amount = r.amount;
				if (!prev.percentage && r.percentage) merged.percentage = r.percentage;
				if (!prev.due_date && r.due_date) merged.due_date = r.due_date;
				seen.set(key, merged);
				const idx = ordered.indexOf(prev);
				if (idx !== -1) ordered[idx] = merged;
				return;
			}
			seen.set(key, r);
			ordered.push(r);
		});
	});
	return ordered;
}

/** If a bullet and a recurring installment share a date, keep only the bullet. */
export function dedupeBulletsVsRecurring(rows) {
	if (!Array.isArray(rows) || rows.length < 2) return rows;
	const bulletDates = new Set();
	rows.forEach((r) => {
		if (r.is_bullet && r.due_date) bulletDates.add(r.due_date);
	});
	if (!bulletDates.size) return rows;
	return rows.filter((r) => {
		if (r.is_bullet) return true;
		if (!r.due_date) return true;
		return !bulletDates.has(r.due_date);
	});
}

/**
 * Normalize one raw AI row into the canonical installment shape.
 *
 * IMPORTANT: the AI determines the payment TYPE and PHASE itself from the
 * document context — this function does NOT impose fixed classification
 * rules. It only:
 *   - normalizes the date to ISO (or detects a relative timing)
 *   - normalizes the amount / percentage / currency
 *   - maps the AI's payment_type to the engine's persisted enum (storage
 *     format only — the AI's free-form "type" string is preserved in `name`)
 *   - keeps the AI's phase as-is (defaulting to pre_handover only when absent)
 */
export function normalizeRow(r) {
	const rawDue = r.due_date != null && r.due_date !== '' ? r.due_date : '';
	let due = parseFlexibleDate(rawDue);
	let relative = null;

	if (r.relative && typeof r.relative === 'object' && r.relative.offset_months != null) {
		const relTo = r.relative.to === 'booking_date' ? 'booking_date' : 'handover';
		relative = { to: relTo, offset_months: Number(r.relative.offset_months) || 0 };
		due = '';
	}

	if (!relative) {
		const relHand =
			parseRelativeHandoverOffset(rawDue) ??
			parseRelativeHandoverOffset(r.name) ??
			parseRelativeHandoverOffset(r.raw_label) ??
			parseRelativeHandoverOffset(r.note);
		if (relHand != null) {
			relative = { to: 'handover', offset_months: relHand };
			due = '';
		} else {
			const relBook =
				parseRelativeBookingOffset(rawDue) ??
				parseRelativeBookingOffset(r.name) ??
				parseRelativeBookingOffset(r.raw_label) ??
				parseRelativeBookingOffset(r.note);
			if (relBook != null) {
				relative = { to: 'booking_date', offset_months: relBook };
				due = '';
			}
		}
	}

	// The AI decides the phase from context. Only default when it gave none.
	// A handover-relative payment is naturally post-handover.
	let phase = String(r.phase || '').toLowerCase();
	if (phase && !['first_payment', 'pre_handover', 'handover', 'post_handover'].includes(phase)) {
		// Loose mapping for common synonyms the model may use — not a fixed rule,
		// just normalization to the engine's phase enum.
		phase = mapPaymentStage(phase);
	}
	if (!phase) phase = relative && relative.to === 'handover' ? 'post_handover' : 'pre_handover';

	// The AI decides the payment type from context. Preserve it; only map to the
	// persisted enum for storage. No fixed override based on phase.
	const payment_type = String(r.payment_type || r.type || 'installment').toLowerCase();

	const amount = normalizeMoney(r.amount);
	let percentage = r.percentage != null && r.percentage !== '' ? String(normalizeDigits(r.percentage)) : '';
	// Validate percentage 0-100
	const pctNum = Number(percentage);
	if (percentage !== '' && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)) {
		percentage = '';
	}

	const row = {
		number: r.number != null ? Number(r.number) || 0 : 0,
		name: r.name != null ? String(r.name) : (r.type ? String(r.type) : ''),
		raw_label: r.raw_label != null ? String(r.raw_label) : (r.name != null ? String(r.name) : ''),
		// Free-form type as determined by the AI from the document context.
		type: r.type != null ? String(r.type) : (r.name ? String(r.name) : ''),
		source_page: r.source_page != null && r.source_page !== '' ? Number(r.source_page) || null : null,
		amount,
		percentage,
		// Independent per-row date; empty when unknown — never invent / never copy.
		due_date: due || '',
		relative,
		relative_to: relative ? relative.to : null,
		offset_months: relative ? relative.offset_months : null,
		phase,
		payment_type,
		payment_type_persisted: mapPaymentType(payment_type),
		is_bullet: !!r.is_bullet,
		note: r.note || '',
		status: r.status === 'paid' ? 'paid' : 'unpaid',
		source: 'AI_IMPORT',
	};
	row.confidence = rowConfidence({ ...row, due_date: due, relative });
	// Needs review when: low confidence, no amount+percent, no date+relative,
	// or a raw date string was present but could not be parsed (corrupted date).
	row.needs_review =
		row.confidence === 'low' ||
		(!row.amount && !row.percentage) ||
		(!row.due_date && !row.relative) ||
		(!!String(rawDue || '').trim() && !row.due_date && !row.relative);
	return row;
}

/** Sum percentages / amounts and compare to total price. */
export function validatePlan(rows, totalPrice) {
	const price = moneyNumber(totalPrice);
	let sumPct = 0;
	let sumAmt = 0;
	rows.forEach((r) => {
		sumPct += Number(r.percentage || 0);
		sumAmt += moneyNumber(r.amount);
	});
	sumPct = Math.round(sumPct * 100) / 100;
	sumAmt = Math.round(sumAmt * 100) / 100;
	const pctDiff = Math.round((sumPct - 100) * 100) / 100;
	const amtDiff = price > 0 ? Math.round((sumAmt - price) * 100) / 100 : null;
	return {
		sumPct,
		sumAmt,
		price,
		pctOk: Math.abs(pctDiff) < 0.05,
		pctDiff,
		amtDiff,
		amtOk: amtDiff == null || Math.abs(amtDiff) < 0.5,
	};
}

/** Extract the outermost JSON object from model text (strips markdown fences). */
export function extractJsonFromText(text) {
	if (!text) return null;
	let s = String(text).trim();
	const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) s = fence[1].trim();
	const start = s.indexOf('{');
	const end = s.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return null;
	try {
		return JSON.parse(s.slice(start, end + 1));
	} catch {
		return null;
	}
}

/**
 * Full deterministic post-processing of raw AI JSON.
 * Returns { installments, currency, totalPrice, validation, needsReviewCount }.
 */
export function processAiPlan(raw, totalPrice = '') {
	let list = Array.isArray(raw?.installments) ? [...raw.installments] : [];

	let rows = list.map((r) => normalizeRow(r));
	rows = mergeBatches([rows]);
	rows = dedupeBulletsVsRecurring(rows);

	// Chronological order; undated rows sink to the bottom.
	rows.sort((a, b) => {
		if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
		if (a.due_date) return -1;
		if (b.due_date) return 1;
		return (a.number || 0) - (b.number || 0);
	});
	rows.forEach((r, i) => {
		r.number = i + 1;
	});

	const validation = validatePlan(rows, totalPrice);
	const needsReviewCount = rows.filter((r) => r.needs_review).length;

	return {
		installments: rows,
		currency: raw?.currency || null,
		totalPrice: raw?.total_price != null ? String(raw.total_price) : null,
		validation,
		needsReviewCount,
	};
}

export default {
	parseFlexibleDate,
	parseRelativeHandoverOffset,
	parseRelativeBookingOffset,
	mapPaymentStage,
	mapPaymentType,
	normalizeRow,
	mergeBatches,
	dedupeBulletsVsRecurring,
	validatePlan,
	processAiPlan,
};
