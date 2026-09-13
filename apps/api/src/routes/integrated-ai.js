import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import convert from 'heic-convert';
import { PDFDocument } from 'pdf-lib';
import { ContentBlockType, stream, uploadImagesToPocketBase } from '../api/integrated-ai.js';
import { SystemPrompt } from '../constants/prompts.js';
import { uploadFiles } from '../middleware/file-upload.js';
import { integratedAiRateLimit } from '../middleware/integrated-ai-rate-limit.js';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import logger from '../utils/logger.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import {
	extractJsonFromText,
	processAiPlan,
	parseFlexibleDate,
	parseRelativeHandoverOffset,
	parseRelativeBookingOffset,
} from '../lib/planValidator.js';
import { isIntegrationConfigured, respondNotConfigured } from '../utils/integrationConfig.js';
import { resolveProviderForSection } from '../lib/aiProviders.js';

const router = Router();

/* Status is public (boolean only — never returns the key). Must stay ABOVE
 * pocketbaseAuth so the UI can detect setup without a failed 401 that was
 * incorrectly treated as "not configured". */
router.get('/plan-status', async (req, res) => {
	// Two-stage Estate AI pipeline: Gemini is the primary extractor, OpenAI is
	// the selective reviewer. "configured" is true when Gemini's key is set
	// (primary path) OR an admin-managed provider is active for add_property
	// (fallback path). The reviewer_configured flag tells the UI whether the
	// OpenAI review stage will run. No key value is ever returned.
	const resolved = await resolveProviderForSection('add_property', 'ANTHROPIC_API_KEY');
	const geminiConfigured = isIntegrationConfigured('GEMINI_API_KEY');
	const openaiConfigured = isIntegrationConfigured('OPENAI_API_KEY');
	const provider = geminiConfigured ? 'gemini' : (resolved?.provider || null);
	res.json({
		configured: geminiConfigured || !!resolved,
		provider,
		model:
			provider === 'gemini'
				? getGeminiModel()
				: provider === 'openai'
					? getOpenAiModel()
					: getPlanModel(),
		reviewer_configured: openaiConfigured,
	});
});

router.use(pocketbaseAuth);

/* ================================================================== */
/* Anthropic API key — secure server-side setup (Super Admin only)      */
/* ================================================================== */
/*
 * The Smart Payment Plan Reader calls the Anthropic Claude API using
 * ANTHROPIC_API_KEY. The key is a server-side secret — it must never be
 * shipped to the browser, never returned by any endpoint, and never written
 * to the logs. This route lets the Super Admin paste their own key from
 * inside the admin dashboard; it is written to apps/api/.env (persisted
 * across restarts) and also set on process.env so it takes effect
 * immediately without a restart.
 *
 * Security:
 *   - Auth required (pocketbaseAuth) + Super Admin / staff role check.
 *   - Only accepts the value; never reads it back. The status endpoint
 *     below returns a boolean `configured` only.
 *   - The key value is NEVER logged. Logs use only a masked prefix.
 *   - The key is masked in any error message.
 */

const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
const STAFF_ROLES = ['admin', 'editor', 'support', 'custom'];
const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';

function maskKey(value) {
	const v = String(value || '');
	if (!v) return '(empty)';
	if (v.length <= 12) return `${v.slice(0, 4)}…${v.slice(-2)}`;
	return `${v.slice(0, 7)}…${v.slice(-4)}`;
}

/** Persist a KEY=value line into apps/api/.env (replace existing or append). */
function writeEnvKey(keyName, value) {
	let content = '';
	try {
		content = fs.readFileSync(ENV_PATH, 'utf8');
	} catch {
		content = '';
	}
	const lines = content.split('\n');
	const regex = new RegExp(`^\\s*${keyName}\\s*=`);
	let found = false;
	const next = lines.map((line) => {
		if (regex.test(line)) {
			found = true;
			return `${keyName}=${value}`;
		}
		return line;
	});
	if (!found) {
		next.push(`${keyName}=${value}`);
	}
	fs.writeFileSync(ENV_PATH, `${next.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

async function requireStaff(req) {
	const userId = req.pocketbaseUserId;
	if (!userId) {
		const e = new Error('PLAN_KEY_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	let record;
	try {
		record = await pocketbaseClient.collection('users').getOne(userId);
	} catch {
		const e = new Error('PLAN_KEY_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	const isSuper =
		!!record.is_super_admin ||
		String(record.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
	const isStaff = isSuper || STAFF_ROLES.includes(record.role);
	if (!isStaff) {
		const e = new Error('PLAN_KEY_FORBIDDEN');
		e.status = 403;
		throw e;
	}
	return record;
}

/* Authenticated status for staff — same boolean, but confirms the caller is
 * staff so the panel can trust it for the "configured" badge. */
router.get('/plan-key', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}
	res.json({
		configured: isIntegrationConfigured('ANTHROPIC_API_KEY'),
		model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
	});
});

/* Save the key. Body: { apiKey: string }. Never returns the key. */
router.post('/plan-key', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}

	const { apiKey } = req.body || {};
	const key = String(apiKey || '').trim();

	if (!key) {
		return res.status(422).json({ error: 'PLAN_KEY_EMPTY' });
	}
	// Anthropic keys start with sk-ant-. Accept anything non-empty that looks
	// like a key (>= 20 chars) but warn the UI for unusual shapes.
	if (key.length < 20) {
		return res.status(422).json({ error: 'PLAN_KEY_TOO_SHORT' });
	}

	try {
		writeEnvKey('ANTHROPIC_API_KEY', key);
	} catch (err) {
		logger.error('plan key: failed to write .env', { error: String(err?.message || err).slice(0, 160) });
		return res.status(500).json({ error: 'PLAN_KEY_WRITE_FAILED' });
	}

	// Apply in-memory so the running process uses it immediately.
	process.env.ANTHROPIC_API_KEY = key;

	logger.info('plan key: saved by admin', { mask: maskKey(key) });

	res.json({ configured: true, saved: true });
});

/* Remove the key (clears .env + process.env). */
router.delete('/plan-key', async (req, res) => {
	try {
		await requireStaff(req);
	} catch (err) {
		return res.status(err.status || 403).json({ error: err.message });
	}

	try {
		writeEnvKey('ANTHROPIC_API_KEY', '');
	} catch (err) {
		logger.error('plan key: failed to clear .env', { error: String(err?.message || err).slice(0, 160) });
		return res.status(500).json({ error: 'PLAN_KEY_WRITE_FAILED' });
	}
	process.env.ANTHROPIC_API_KEY = '';
	logger.info('plan key: cleared by admin');
	res.json({ configured: false, saved: true });
});

/** Convert HEIC/HEIF buffers to JPEG so vision + PocketBase always get a supported image. */
async function normalizeUploadImages(files = []) {
	const out = [];
	for (const file of files) {
		const mime = String(file.mimetype || '').toLowerCase();
		const name = String(file.originalname || '');
		const isHeic =
			mime.includes('heic') ||
			mime.includes('heif') ||
			/\.heic$/i.test(name) ||
			/\.heif$/i.test(name);
		// PDFs are handled by the dedicated plan-reader path (server-side render).
		if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
			continue;
		}
		if (isHeic && file.buffer) {
			try {
				// eslint-disable-next-line no-await-in-loop
				const jpegBuffer = Buffer.from(
					await convert({
						buffer: file.buffer,
						format: 'JPEG',
						quality: 0.9,
					}),
				);
				const safe = String(name || 'photo')
					.replace(/\.(heic|heif)$/i, '.jpg')
					.replace(/[^\w.-]+/g, '_')
					.slice(0, 80) || 'photo.jpg';
				out.push({
					...file,
					buffer: jpegBuffer,
					mimetype: 'image/jpeg',
					originalname: safe.endsWith('.jpg') ? safe : `${safe}.jpg`,
				});
			} catch {
				// If conversion fails, skip rather than crashing the whole batch
				continue;
			}
		} else {
			const safeName = String(name || `image-${out.length}.jpg`)
				.replace(/[^\w.-]+/g, '_')
				.slice(0, 80) || `image-${out.length}.jpg`;
			out.push({ ...file, originalname: safeName });
		}
	}
	return out;
}

router.post('/stream', integratedAiRateLimit, uploadFiles({
	maxCount: 12,
	maxSizeMB: 512,
	allowedMimeTypes: [
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/webp',
		'image/heic',
		'image/heif',
		'application/pdf',
	],
	fieldName: 'images',
}), async (req, res) => {
	const { message } = req.body;

	if (!message) {
		throw new Error('message is required');
	}

	if (typeof message !== 'string') {
		return res.status(400).json({ error: 'message must be a string' });
	}

	const parsedMessage = JSON.parse(message);

	if (req.files?.length > 0) {
		const normalized = await normalizeUploadImages(req.files);
		if (normalized.length > 0) {
			const imageUrls = await uploadImagesToPocketBase({ images: normalized });
			imageUrls.forEach((url) => {
				parsedMessage.push({ type: ContentBlockType.Image, image: url });
			});
		}
	}

	const sseStream = await stream({
		userId: req.pocketbaseUserId,
		systemPrompt: SystemPrompt,
		userMessage: parsedMessage,
	});

	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('X-Accel-Buffering', 'no');

	sseStream.pipe(res, { end: false });

	res.on('close', () => sseStream.destroy());
});

/* ================================================================== */
/* Smart Payment Plan Reader — real Anthropic Claude vision engine      */
/* ================================================================== */
/*
 * Full server-side pipeline (real AI, no static rules):
 *
 *   1. Receive uploaded files (PDF / images / HEIC / any image format, any
 *      size, any language) via multer with NO type/size restrictions.
 *   2. Store every ORIGINAL file in the `payment_plan_files` collection
 *      (public read) — the persistent record of what was uploaded, linked
 *      to the property.
 *   3. Document parsing:
 *        - PDF  → render EVERY page to a JPEG server-side (pdfjs + canvas).
 *        - image → HEIC→JPEG conversion, else pass through.
 *      Non-PDF/non-image files are skipped with a per-file error.
 *   4. Convert every page/analysis image to a base64 data block and send
 *      them DIRECTLY to the Anthropic Claude Messages API (vision) along
 *      with the extraction prompt. No intermediate public storage needed —
 *      the model reads the images inline. 200s timeout + one retry.
 *   5. The model searches the document itself for any payment plan table,
 *      determines each payment's type from context (no fixed code rules),
 *      and returns ONE valid JSON object.
 *   6. Parse the JSON and run a LIGHT deterministic pass (date normalization,
 *      dedupe, renumber, validation summary) that preserves the model's
 *      type/phase decisions.
 *   7. Return the final structured installment list. If no plan was found,
 *      return a clear PLAN_NO_PLAN error so the UI shows a friendly message.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Document extraction on Haiku is usually fast (a few seconds). Allow up to
// 90s for large multi-page PDFs, but no longer — a chat-like flow must fail
// fast with a clear message instead of making the user wait 3+ minutes.
const ANTHROPIC_TIMEOUT_MS = 90_000;
// Claude Messages API accepts only these image media types for base64 blocks.
const CLAUDE_IMAGE_MEDIA = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
// Claude hard limits per content block: 32MB for a PDF document, ~5MB for an
// image. We reject oversized files INSTANTLY with a clear message instead of
// uploading them to Claude and waiting for a 400 after a long round-trip.
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Anthropic enforces a HARD 100-page limit on each `document` (PDF) content
// block. Instead of rejecting larger PDFs, we split them into ≤100-page
// batches (via pdf-lib) and send each batch as its own document block in the
// same Claude request — so there is NO page limit on the user's side.
const MAX_PDF_PAGES = 100;
// Soft cap on total raw payload across all blocks. Raised so multi-batch
// PDFs (several ≤100-page document blocks) still fit in one request.
const MAX_TOTAL_IMAGE_BYTES = 100 * 1024 * 1024;

// ---- OpenAI (gpt-4o vision) — second supported extraction provider ----
// When the admin assigns the OpenAI provider to a section from the API Keys
// management panel, extraction routes here instead of Anthropic. OpenAI chat
// completions accept images as base64 data URLs; PDF document blocks are NOT
// supported by this endpoint (a clear PLAN_OPENAI_PDF_ONLY error is returned
// so the admin knows to keep PDF contracts on Anthropic Claude).
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TIMEOUT_MS = 90_000;

// ---- Google Gemini — third supported extraction provider ----
// When the admin assigns the Gemini provider to a section from the API Keys
// management panel, extraction routes here. Gemini's generateContent API
// accepts BOTH PDFs and images as inline_data base64 blocks (unlike OpenAI
// which is images-only), so Gemini fully supports PDF contracts. The API key
// is sent as a query param (?key=...) and is NEVER logged or returned — the
// diagnostic logs use a bare endpoint string and error bodies are scrubbed of
// any `key=` fragment.
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_TIMEOUT_MS = 90_000;

/**
 * Count the pages of a PDF from its raw buffer WITHOUT any native dependency.
 * Uses latin1 decoding so every byte maps 1:1 to a char (binary-safe). Tries
 * the page-tree `/Count` entries first (the root node holds the total), then
 * falls back to counting `/Type /Page` (not `/Pages`) objects. Returns 0 when
 * it cannot determine a count (e.g. encrypted/linearized oddities) — the
 * caller treats 0 as "unknown, allow through" so we never block a valid PDF
 * just because we failed to parse its structure.
 */
function countPdfPages(buffer) {
	try {
		const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
		if (!buf.length) return 0;
		const text = buf.toString('latin1');
		// Page-tree /Count entries. The root Pages node carries the total count;
		// take the max to be safe against nested kids.
		const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]) || 0);
		if (counts.length) return Math.max(...counts);
		// Fallback: count page objects. `[^s]` excludes `/Pages`.
		const pages = text.match(/\/Type\s*\/Page[^s]/g);
		return pages ? pages.length : 0;
	} catch {
		return 0;
	}
}

/**
 * Split a PDF buffer into batches of at most `maxPages` pages each, using
 * pdf-lib (pure JS, no native deps). Returns an array of PDF Buffers. A PDF
 * already within the limit is returned as a single-element array (the
 * original buffer, untouched). Encrypted/unparseable PDFs fall back to the
 * original buffer so the call still proceeds instead of failing.
 */
async function splitPdfIntoBatches(buffer, maxPages = MAX_PDF_PAGES) {
	const srcBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
	try {
		const src = await PDFDocument.load(srcBuf, { ignoreEncryption: true });
		const total = src.getPageCount();
		if (total <= maxPages) return [{ buffer: srcBuf, pages: total }];
		const batches = [];
		for (let start = 0; start < total; start += maxPages) {
			const end = Math.min(start + maxPages, total);
			const indices = Array.from({ length: end - start }, (_, i) => start + i);
			// eslint-disable-next-line no-await-in-loop
			const out = await PDFDocument.create();
			// eslint-disable-next-line no-await-in-loop
			const copied = await out.copyPages(src, indices);
			copied.forEach((p) => out.addPage(p));
			// eslint-disable-next-line no-await-in-loop
			const bytes = await out.save();
			batches.push({ buffer: Buffer.from(bytes), pages: end - start });
		}
		return batches;
	} catch {
		return [{ buffer: srcBuf, pages: 0 }];
	}
}

/**
 * Model used by the Smart Payment Plan Reader. Defaults to the faster Haiku
 * for speed (payment-plan documents are mostly text/tables), but is fully
 * server-adjustable via ANTHROPIC_PLAN_MODEL in apps/api/.env — switch to
 * claude-sonnet-4-6 for maximum accuracy on complex multi-page plans.
 */
function getPlanModel() {
	return (
		process.env.ANTHROPIC_PLAN_MODEL ||
		process.env.ANTHROPIC_MODEL ||
		'claude-haiku-4-5-20251001'
	);
}

/**
 * Model used when the active provider for a section is OpenAI. Defaults to
 * gpt-4o (vision-capable); server-adjustable via OPENAI_PLAN_MODEL or
 * OPENAI_MODEL in apps/api/.env.
 */
function getOpenAiModel() {
	return process.env.OPENAI_PLAN_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';
}

/**
 * Model used when the active provider for a section is Google Gemini.
 * Defaults to gemini-2.0-flash (vision + PDF capable, GA); server-adjustable
 * via GEMINI_PLAN_MODEL or GEMINI_MODEL in apps/api/.env.
 */
function getGeminiModel() {
	return process.env.GEMINI_PLAN_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
}

/** How long a "processing" job may go stale before the poller marks it failed. */
const PLAN_JOB_STALE_MS = 5 * 60 * 1000;

/** Safe user-facing messages for plan-reader error codes (no secrets). */
function planErrorMessages(code, extra = {}) {
	const map = {
		PLAN_NOT_CONFIGURED: {
			ar: 'لا يوجد مزوّد ذكاء اصطناعي مُعد لهذا القسم على الخادم.',
			en: 'No AI provider is configured for this section on the server.',
		},
		PLAN_FEATURE_DISABLED: {
			ar: 'تم إيقاف قارئ خطة الدفع الذكي. الذكاء الاصطناعي يعمل الآن فقط في قسم «إضافة عقار بالذكاء الاصطناعي». استخدم «بناء خطة الدفع» لإدخال الدفعات يدويًا.',
			en: 'The Smart Payment Plan Reader has been retired. AI now powers only the "AI Add Property" section. Use "Build payment plan" to enter payments manually.',
		},
		PLAN_NO_FILES: {
			ar: 'لم يُستلم أي ملف. أعد اختيار الملف ثم حاول مرة أخرى.',
			en: 'No file was received. Re-select the file and try again.',
		},
		PLAN_UNSUPPORTED_TYPE: {
			ar: 'نوع الملف غير مدعوم. ارفع PDF أو صورة (JPG/PNG/WebP/GIF/HEIC).',
			en: 'Unsupported file type. Upload a PDF or image (JPG/PNG/WebP/GIF/HEIC).',
		},
		PLAN_UPLOAD_ALL_FAILED: {
			ar: 'تعذر تخزين الملفات على الخادم. تحقق من الاتصال وحاول مرة أخرى.',
			en: 'Could not store the files on the server. Check your connection and try again.',
		},
		PLAN_PARSE_FAILED: {
			ar: extra.pageHint
				? `تعذر تحويل المستند لصور قابلة للقراءة. ${extra.pageHint}`
				: 'تعذر تحويل المستند (PDF/صورة) إلى صور للقراءة. تأكد أن الملف غير تالف.',
			en: extra.pageHint
				? `Could not convert the document into readable images. ${extra.pageHint}`
				: 'Could not convert the document (PDF/image) into images. Ensure the file is not corrupt.',
		},
		PLAN_AI_AUTH: {
			ar: 'مفتاح المزوّد النشط غير صالح أو مرفوض. حدّث المفتاح من لوحة إدارة مفاتيح API.',
			en: 'The active provider API key is invalid or rejected. Update the key from the API Keys management panel.',
		},
		PLAN_AI_TOO_LARGE: {
			ar: 'حجم الملف أكبر من حد خدمة الذكاء الاصطناعي (PDF حتى 32 ميجابايت، الصورة حتى 10 ميجابايت). قلّل حجم الملف أو عدد الصفحات ثم أعد المحاولة.',
			en: 'File exceeds the AI service limit (PDF up to 32MB, image up to 10MB). Reduce the file size or page count and retry.',
		},
		PLAN_AI_TOO_MANY_PAGES: {
			ar: 'عدد صفحات ملف الـ PDF يتجاوز حد خدمة الذكاء الاصطناعي (100 صفحة كحد أقصى). قسّم الملف إلى أجزاء أصغر أو ارفع الصفحات المتعلقة بخطة الدفع فقط ثم أعد المحاولة.',
			en: 'The PDF exceeds the AI service page limit (100 pages max). Split the file into smaller parts or upload only the payment-plan pages and retry.',
		},
		PLAN_AI_BAD_IMAGE: {
			ar: 'تعذّر على مزوّد الذكاء الاصطناعي قراءة الملف (تنسيق/ترميز غير صالح أو عدد صفحات كبير). أعد حفظ الملف كـ PDF أو JPG، أو قلّل عدد الصفحات، وحاول مجددًا.',
			en: 'The AI provider could not read the file (invalid format/encoding or too many pages). Re-save as PDF or JPG, or reduce the page count, and retry.',
		},
		PLAN_AI_TIMEOUT: {
			ar: 'انتهت مهلة تحليل المستند. استخدم ملفًا أصغر أو صفحات أقل ثم أعد المحاولة.',
			en: 'Document analysis timed out. Use a smaller file or fewer pages and retry.',
		},
		PLAN_AI_NETWORK: {
			ar: 'تعذر الاتصال بخدمة الذكاء الاصطناعي. تحقق من الشبكة وحاول لاحقًا.',
			en: 'Could not reach the AI service. Check the network and try later.',
		},
		PLAN_AI_EMPTY: {
			ar: 'لم يُرجع النموذج نتيجة صالحة. قد تكون جودة المسح منخفضة — جرّب صورة أوضح.',
			en: 'The model returned no usable result. Scan quality may be low — try a clearer image.',
		},
		PLAN_AI_NOT_FOUND: {
			ar: 'النموذج المحدد للمزوّد النشط غير متاح للحساب. راجع إعداد النموذج في الخادم.',
			en: 'The selected model for the active provider is not available for this account. Check the model setting on the server.',
		},
		PLAN_AI_PROXY: {
			ar: 'فشلت قراءة المستند عبر مزوّد الذكاء الاصطناعي. حاول مرة أخرى أو استخدم ملفًا أوضح.',
			en: 'The AI provider failed to read the document. Try again or use a clearer file.',
		},
		PLAN_NO_PLAN: {
			ar: 'لم يتم العثور على جدول خطة دفع في المستند.',
			en: 'No payment plan table was found in the document.',
		},
		PLAN_MISSING_MESSAGE: {
			ar: 'طلب التحليل غير مكتمل. حدّث الصفحة وحاول مرة أخرى.',
			en: 'Analysis request is incomplete. Refresh the page and try again.',
		},
		PLAN_OPENAI_PDF_ONLY: {
			ar: 'مزوّد OpenAI يدعم الصور فقط للاستخراج. لاستخراج ملفات PDF، بدّل القسم إلى Anthropic Claude أو Google Gemini من لوحة إدارة مفاتيح API.',
			en: 'The OpenAI provider supports images only for extraction. To extract PDF files, switch the section to Anthropic Claude or Google Gemini from the API Keys management panel.',
		},
		PLAN_PROVIDER_NOT_IMPLEMENTED: {
			ar: 'المزوّد المختار ليس لديه مسار استخراج منفّذ بعد. استخدم Anthropic Claude أو OpenAI أو Google Gemini.',
			en: 'The selected provider has no extraction call path implemented yet. Use Anthropic Claude, OpenAI, or Google Gemini.',
		},
		PLAN_EXTRACT_JOB_CREATE_FAILED: {
			ar: 'تعذر إنشاء مهمة الاستخراج. حاول مرة أخرى.',
			en: 'Could not create the extraction job. Try again.',
		},
		PLAN_BATCH_FAILED: {
			ar: 'فشلت معالجة إحدى دفعات المستند.',
			en: 'One of the document batches failed to process.',
		},
	};
	return map[code] || {
		ar: 'تعذر إكمال تحليل المستند. حاول مرة أخرى.',
		en: 'Could not complete document analysis. Try again.',
	};
}

function respondPlanError(res, status, code, extra = {}) {
	const msgs = planErrorMessages(code, extra);
	const detail = String(extra.detail || extra.pageHint || '')
		.replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-ant-…')
		.slice(0, 240);
	return res.status(status).json({
		error: code,
		detail: detail || undefined,
		userMessageAr: msgs.ar,
		userMessageEn: msgs.en,
		...Object.fromEntries(
			Object.entries(extra).filter(([k]) =>
				['totalFiles', 'failedFiles', 'pageErrors', 'uploadedCount', 'found'].includes(k),
			),
		),
	});
}

/** Detect real file kind from magic bytes (more reliable than browser MIME). */
function detectBufferKind(buffer, mime = '', name = '') {
	const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
	const m = String(mime || '').toLowerCase();
	const n = String(name || '').toLowerCase();
	if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return { kind: 'pdf', mediaType: 'application/pdf' };
	if (m === 'application/pdf' || /\.pdf$/i.test(n)) return { kind: 'pdf', mediaType: 'application/pdf' };
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
		return { kind: 'image', mediaType: 'image/jpeg' };
	}
	if (
		buf.length >= 8
		&& buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
	) {
		return { kind: 'image', mediaType: 'image/png' };
	}
	if (
		buf.length >= 12
		&& buf.toString('ascii', 0, 4) === 'RIFF'
		&& buf.toString('ascii', 8, 12) === 'WEBP'
	) {
		return { kind: 'image', mediaType: 'image/webp' };
	}
	if (buf.length >= 6 && buf.toString('ascii', 0, 4) === 'GIF8') {
		return { kind: 'image', mediaType: 'image/gif' };
	}
	if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
		const brand = buf.toString('ascii', 8, 12).toLowerCase();
		if (/^(heic|heif|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(brand)) {
			return { kind: 'image', mediaType: 'image/heic' };
		}
	}
	if (m.includes('heic') || m.includes('heif') || /\.heic$/i.test(n) || /\.heif$/i.test(n)) {
		return { kind: 'image', mediaType: 'image/heic' };
	}
	if (m.startsWith('image/')) {
		return { kind: 'image', mediaType: m === 'image/jpg' ? 'image/jpeg' : m };
	}
	return { kind: 'unknown', mediaType: m || 'application/octet-stream' };
}

/**
 * Pre-flight size check: returns the first file that exceeds Claude's
 * per-block limits, so the route can reject it INSTANTLY with a clear
 * PLAN_AI_TOO_LARGE message instead of base64-encoding it, uploading it to
 * Anthropic, and waiting for a slow 400. Returns null when all files fit.
 */
function findOversizedFile(files) {
	for (const file of files || []) {
		const name = String(file.originalname || '');
		const mime = String(file.mimetype || '').toLowerCase();
		const detected = detectBufferKind(file.buffer, mime, name);
		const buf = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer || []);
		// Images are still pre-flight checked against the per-image byte limit.
		// PDFs are no longer rejected here — large PDFs are split into
		// ≤100-page batches in prepareFileForClaude (pdf-lib), with each batch
		// size-checked individually, so there is no page limit on the user side.
		if (detected.kind === 'image' && buf.length > MAX_IMAGE_BYTES) {
			return { name: name || 'image', kind: 'image', bytes: buf.length, limit: MAX_IMAGE_BYTES, reason: 'bytes' };
		}
	}
	return null;
}

// Image re-encoding via @napi-rs/canvas was removed — images are now sent
// to Claude with their native media_type (jpeg/png/gif/webp), and PDFs are
// sent as `document` blocks. This drops the canvas/pdf-render dependency
// that failed with "Cannot read properties of undefined (reading 'createCanvas')".

const PlanExtractionSystemPrompt = `You are a payment-plan document extraction engine for real-estate documents in ANY language (Arabic, English, or any other).

The attached content (PDF documents and/or images) is ONE single document (a payment plan, sales-purchase agreement, contract, or brochure). Treat all attached pages/files as one continuous document — merge every page into ONE ordered list. Never analyse each page or file as a separate plan.

YOUR JOB:
1. Read the FULL document and search it yourself for ANY payment plan, installment schedule, or payment table — even if it is large, spans many pages, or is embedded inside a contract. Keep reading EVERY page until the end of the payment table (it may contain 85 or more installments).
2. If you find a payment plan, extract every payment/installment row in document order.
3. Determine each payment's TYPE YOURSELF from the document context — e.g. down payment / first installment / monthly installment / quarterly installment / semi-annual installment / handover payment / post-handover installment / balloon payment / service charge / admin fee / any other type the document describes. Do NOT follow a fixed category list — use whatever type the document itself states, in the document's own language and terms.
4. For each row capture: the installment number, a short name/label, the payment type (your own determination), the amount and/or percentage, the currency, the due date (YYYY-MM-DD) OR a relative timing if no absolute date exists, the phase/stage if mentioned, and any note.
5. RELATIVE DATES: phrases like "1 month from booking date", "12 months from booking date", "شهر من تاريخ الحجز", "3 months after handover", "3 أشهر بعد التسليم" → due_date=null and relative={"to":"booking_date"|"handover","offset_months":N}. Do NOT invent a date.
6. CRITICAL DATE RULE: each row must read its OWN due_date from THAT row only (YYYY-MM-DD). Never copy the first installment date onto later rows. Monthly schedules must increment month by month. If a row date is unclear, due_date=null.
7. Never invent any value that is not clearly present in the document — use null for anything unreadable.

If the document does NOT contain any payment plan or installment schedule, return exactly: {"found": false, "installments": []}

Return ONLY one valid JSON object (no prose, no markdown fences, no explanation):
{
  "found": true,
  "currency": "AED" or null,
  "total_price": 1234567 or null,
  "installments": [
    {
      "number": 1,
      "name": "Down Payment",
      "raw_label": "الدفعة الأولى",
      "type": "down payment",
      "payment_type": "down_payment",
      "phase": "first_payment",
      "amount": 70000,
      "percentage": 10,
      "currency": "AED",
      "due_date": "2026-05-25",
      "relative": null,
      "source_page": 1,
      "note": "",
      "confidence": "high"
    }
  ]
}

payment_type values you may use: down_payment, installment, bullet, handover, post_handover, fee, custom.
phase values you may use: first_payment, pre_handover, handover, post_handover.
confidence: high | medium | low.`;

/** SHA-256 of a buffer (hex) — duplicate detection. */
function sha256(buffer) {
	return crypto.createHash('sha256').update(buffer).digest('hex');
}

/* ---------- Stage 2: store the original file in payment_plan_files ---------- */
async function storeOriginalFile(file) {
	const name = String(file.originalname || '');
	const detected = detectBufferKind(file.buffer, file.mimetype, name);
	const kind = detected.kind === 'pdf' ? 'pdf' : 'image';
	const hash = sha256(file.buffer);
	const safeName = name || (kind === 'pdf' ? 'document.pdf' : 'image.jpg');
	// PocketBase file field only allows a fixed MIME list — normalize declared type.
	let uploadMime = detected.mediaType;
	if (kind === 'pdf') uploadMime = 'application/pdf';
	else if (!CLAUDE_IMAGE_MEDIA.has(uploadMime) && uploadMime !== 'image/heic' && uploadMime !== 'image/heif') {
		uploadMime = 'image/jpeg';
	}

	const formData = new FormData();
	// Uint8Array copy avoids Node Blob/Buffer edge cases that produce empty uploads.
	const bytes = new Uint8Array(file.buffer);
	const blob = new Blob([bytes], { type: uploadMime });
	formData.append('file', blob, safeName);
	formData.append('file_name', safeName);
	formData.append('kind', kind);
	formData.append('file_hash', hash);

	const record = await pocketbaseClient.collection('payment_plan_files').create(formData);
	logger.info('plan reader: storage upload', { kind, name: safeName, id: record.id, mime: uploadMime });
	return { record, kind, hash, name: safeName };
}

/* ---------- Stage 3: prepare each file as a Claude content block ---------- */
/*
 * PDFs are sent DIRECTLY to Claude as a `document` content block
 * (media_type: application/pdf, base64). Claude reads PDFs natively — no
 * server-side rendering to images is needed, which removes the dependency on
 * @napi-rs/canvas / pdfjs page rendering that was failing in this runtime.
 *
 * Images are sent as `image` content blocks with their native media_type
 * (jpeg/png/gif/webp). HEIC/HEIF are converted to JPEG first (Claude does
 * not accept HEIC).
 */
async function prepareFileForClaude(file) {
	const name = String(file.originalname || '');
	const mime = String(file.mimetype || '').toLowerCase();
	const detected = detectBufferKind(file.buffer, mime, name);

	if (detected.kind === 'unknown') {
		const err = new Error(`Unsupported file type: ${detected.mediaType || mime || name || 'unknown'}`);
		err.code = 'PLAN_UNSUPPORTED_TYPE';
		throw err;
	}

	if (detected.kind === 'pdf') {
		const buf = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
		// Split PDFs over 100 pages into ≤100-page batches (pdf-lib). Each
		// batch becomes its own `document` content block in the same Claude
		// request, so there is NO page limit on the user's side. A batch that
		// individually exceeds Claude's 32MB document limit is rejected with a
		// clear message instead of waiting for a slow 400.
		const batches = await splitPdfIntoBatches(buf, MAX_PDF_PAGES);
		const blocks = [];
		for (let i = 0; i < batches.length; i += 1) {
			const b = batches[i];
			if (b.buffer.length > MAX_PDF_BYTES) {
				const err = new Error(
					`PDF batch too large: ${(b.buffer.length / 1024 / 1024).toFixed(1)}MB exceeds the 32MB document limit`,
				);
				err.code = 'PLAN_AI_TOO_LARGE';
				throw err;
			}
			blocks.push({
				kind: 'document',
				mediaType: 'application/pdf',
				data: b.buffer,
				name: batches.length > 1
					? `${name || 'document'} (part ${i + 1}/${batches.length})`
					: (name || 'document.pdf'),
				text: '',
				pages: b.pages,
			});
		}
		logger.info('plan reader: PDF prepared as document block(s)', {
			name,
			batches: batches.length,
			totalBytes: buf.length,
		});
		return blocks;
	}

	// Image path. HEIC/HEIF → JPEG (Claude does not accept HEIC).
	let raster = file.buffer;
	let mediaType = detected.mediaType;
	if (detected.mediaType === 'image/heic' || detected.mediaType === 'image/heif') {
		try {
			raster = Buffer.from(await convert({ buffer: file.buffer, format: 'JPEG', quality: 0.9 }));
			mediaType = 'image/jpeg';
			logger.info('plan reader: image prepared (HEIC→JPEG)', { name });
		} catch (e) {
			logger.error('plan reader: HEIC conversion failed', { name, error: String(e?.message || e) });
			throw new Error('HEIC image conversion failed');
		}
	}

	// Normalize to a Claude-accepted image media type.
	if (!CLAUDE_IMAGE_MEDIA.has(mediaType)) {
		mediaType = 'image/jpeg';
	}
	const buf = Buffer.isBuffer(raster) ? raster : Buffer.from(raster);
	// Guard: if we claim jpeg, bytes must start with FF D8 FF; otherwise re-detect.
	if (mediaType === 'image/jpeg' && !(buf[0] === 0xff && buf[1] === 0xd8)) {
		const redetected = detectBufferKind(buf, mediaType, name);
		if (CLAUDE_IMAGE_MEDIA.has(redetected.mediaType)) {
			mediaType = redetected.mediaType;
		}
	}
	// Early guard: reject images above the per-image limit instantly with a
	// clear message, instead of uploading and waiting for Claude's 400.
	if (buf.length > MAX_IMAGE_BYTES) {
		const err = new Error(
			`Image too large: ${(buf.length / 1024 / 1024).toFixed(1)}MB exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024}MB limit`,
		);
		err.code = 'PLAN_AI_TOO_LARGE';
		throw err;
	}

	logger.info('plan reader: image prepared', { name, mime: mediaType, bytes: buf.length });
	return [{
		kind: 'image',
		mediaType,
		data: buf,
		name: name || 'image',
		text: '',
	}];
}

/* ---------- Stage 4: build Anthropic message content blocks ---------- */
function buildAnthropicContent({ promptText, items }) {
	const content = [];

	// Primary instruction text.
	content.push({ type: 'text', text: promptText || 'Extract the payment plan table from the attached document as JSON.' });

	// Media blocks (PDF documents + images) in upload order, base64-encoded.
	let totalBytes = 0;
	for (const item of items) {
		const buf = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data || []);
		if (!buf.length) continue;
		totalBytes += buf.length;
		if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
			logger.error('plan reader: total payload exceeds soft cap', { totalBytes, items: items.length });
			break;
		}
		if (item.kind === 'document') {
			content.push({
				type: 'document',
				source: {
					type: 'base64',
					media_type: item.mediaType || 'application/pdf',
					data: buf.toString('base64'),
				},
			});
		} else {
			content.push({
				type: 'image',
				source: {
					type: 'base64',
					media_type: item.mediaType || 'image/jpeg',
					data: buf.toString('base64'),
				},
			});
		}
	}

	return content;
}

/* ---------- Stage 5: call Anthropic Claude Messages API ---------- */
async function callAnthropicOnce({ content, signal, systemPrompt, apiKey, label = 'plan reader' }) {
	const model = getPlanModel();
	const resolvedKey = apiKey || process.env.ANTHROPIC_API_KEY;

	// ---- BEFORE the API call: safe diagnostic of exactly what is sent ----
	// Per content block: media_type, decoded byte size, and the first 20 chars
	// of the base64 payload (file magic bytes only — e.g. "JVBERi0" for PDF,
	// "/9j/4AAQ" for JPEG). This NEVER includes document content, the API key,
	// or user data — only enough to prove the block was prepared correctly.
	const mediaBlocks = content.filter((c) => c.type === 'image' || c.type === 'document');
	const blockDiagnostics = mediaBlocks.map((c) => {
		const b64 = String(c.source?.data || '');
		const buf = Buffer.from(b64, 'base64');
		return {
			type: c.type,
			media_type: c.source?.media_type,
			decodedBytes: buf.length,
			base64Prefix: b64.slice(0, 20),
		};
	});
	logger.info(`${label}: Anthropic request about to be sent`, {
		model,
		endpoint: ANTHROPIC_API_URL,
		blockCount: mediaBlocks.length,
		blocks: blockDiagnostics,
		keyConfigured: !!resolvedKey,
	});

	const response = await fetch(ANTHROPIC_API_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': resolvedKey,
			'anthropic-version': ANTHROPIC_VERSION,
		},
		body: JSON.stringify({
			model,
			max_tokens: 16000,
			system: systemPrompt || PlanExtractionSystemPrompt,
			messages: [{ role: 'user', content }],
		}),
		signal,
	});

	// ---- AFTER the API call: status + response (success OR Anthropic error) ----
	if (!response.ok) {
		const errorBody = await response.text().catch(() => '');
		// Capture the FULL rejection reason (masked of any key) so the real
		// cause of a 400 (too many pages, encrypted pdf, invalid base64, …) is
		// visible in the server log — not just the first 400 chars.
		const maskedBody = String(errorBody || '')
			.replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-ant-…')
			.slice(0, 1600);
		logger.error(`${label}: Anthropic API rejected the request`, {
			status: response.status,
			statusText: response.statusText,
			body: maskedBody,
			blocks: blockDiagnostics,
		});
		const err = new Error(
			`Anthropic API failed: ${response.status} ${response.statusText} ${errorBody.slice(0, 200)}`,
		);
		err.code = 'PLAN_AI_PROXY';
		err.proxyStatus = response.status;
		throw err;
	}

	const data = await response.json();
	// Claude returns content as an array of blocks; concatenate text blocks.
	const text = Array.isArray(data?.content)
		? data.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
		: '';
	// Log the SUCCESS response: status, model, stop_reason, token usage, and a
	// short preview of the extracted text. This is the model's OUTPUT (not the
	// document content, not the API key) and proves Anthropic actually replied.
	logger.info(`${label}: Anthropic API success`, {
		status: response.status,
		model: data?.model || model,
		stop_reason: data?.stop_reason || '',
		usage: data?.usage || null,
		contentLength: text.length,
		contentPreview: String(text).slice(0, 200),
	});
	return text;
}

/* ---------- Stage 5b: build OpenAI chat-completions content blocks ---------- */
/*
 * OpenAI's chat completions API accepts images as `image_url` blocks with a
 * base64 data URL. PDF `document` blocks are NOT accepted by this endpoint —
 * PDFs are counted and surfaced as a clear PLAN_OPENAI_PDF_ONLY error so the
 * admin knows to keep the section on Anthropic Claude for PDF contracts.
 */
function buildOpenAiContent({ promptText, items }) {
	const content = [{ type: 'text', text: promptText || 'Extract the data from the attached document as JSON.' }];
	let imageCount = 0;
	let pdfCount = 0;
	let totalBytes = 0;
	for (const item of items) {
		const buf = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data || []);
		if (!buf.length) continue;
		if (item.kind === 'document') {
			pdfCount += 1;
			continue;
		}
		totalBytes += buf.length;
		if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
			logger.error('plan reader: OpenAI total payload exceeds soft cap', { totalBytes, items: items.length });
			break;
		}
		const mediaType = item.mediaType || 'image/jpeg';
		content.push({
			type: 'image_url',
			image_url: { url: `data:${mediaType};base64,${buf.toString('base64')}` },
			_mediaType: mediaType,
			_bytes: buf.length,
		});
		imageCount += 1;
	}
	return { content, imageCount, pdfCount };
}

/* ---------- Stage 5c: call OpenAI Chat Completions API (vision) ---------- */
async function callOpenAiOnce({ content, signal, systemPrompt, apiKey, label = 'plan reader' }) {
	const model = getOpenAiModel();
	const resolvedKey = apiKey || process.env.OPENAI_API_KEY;

	// Strip internal diagnostic fields (_mediaType, _bytes) before sending.
	const cleanContent = content.map((c) => {
		if (c.type === 'image_url') return { type: 'image_url', image_url: c.image_url };
		return { type: 'text', text: c.text };
	});

	const imageBlocks = content.filter((c) => c.type === 'image_url');
	logger.info(`${label}: OpenAI request about to be sent`, {
		model,
		endpoint: OPENAI_API_URL,
		blockCount: imageBlocks.length,
		keyConfigured: !!resolvedKey,
	});

	const response = await fetch(OPENAI_API_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${resolvedKey}`,
		},
		body: JSON.stringify({
			model,
			max_tokens: 16000,
			messages: [
				{ role: 'system', content: systemPrompt || PropertyExtractionSystemPrompt },
				{ role: 'user', content: cleanContent },
			],
		}),
		signal,
	});

	if (!response.ok) {
		const errorBody = await response.text().catch(() => '');
		const maskedBody = String(errorBody || '')
			.replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-…')
			.slice(0, 1600);
		logger.error(`${label}: OpenAI API rejected the request`, {
			status: response.status,
			statusText: response.statusText,
			body: maskedBody,
		});
		const err = new Error(
			`OpenAI API failed: ${response.status} ${response.statusText} ${errorBody.slice(0, 200)}`,
		);
		err.code = 'PLAN_AI_PROXY';
		err.proxyStatus = response.status;
		throw err;
	}

	const data = await response.json();
	const text = data?.choices?.[0]?.message?.content || '';
	logger.info(`${label}: OpenAI API success`, {
		status: response.status,
		model: data?.model || model,
		usage: data?.usage || null,
		contentLength: text.length,
		contentPreview: String(text).slice(0, 200),
	});
	return text;
}

/* ---------- Stage 5d: build Google Gemini generateContent parts ---------- */
/*
 * Gemini's generateContent API accepts inline_data base64 blocks for BOTH
 * PDFs (application/pdf) and images (image/jpeg, image/png, image/webp,
 * image/gif). This builder converts the prepared content items into Gemini
 * `parts` — a text part carrying the prompt, followed by one inline_data part
 * per media item in upload order. Returns { parts, mediaBlockCount }.
 */
function buildGeminiContent({ promptText, items }) {
	const parts = [{ text: promptText || 'Extract the data from the attached document as JSON.' }];
	let mediaBlockCount = 0;
	let totalBytes = 0;
	for (const item of items) {
		const buf = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data || []);
		if (!buf.length) continue;
		totalBytes += buf.length;
		if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
			logger.error('plan reader: Gemini total payload exceeds soft cap', { totalBytes, items: items.length });
			break;
		}
		const mediaType = item.mediaType || (item.kind === 'document' ? 'application/pdf' : 'image/jpeg');
		parts.push({
			inline_data: { mime_type: mediaType, data: buf.toString('base64') },
		});
		mediaBlockCount += 1;
	}
	return { parts, mediaBlockCount };
}

/* ---------- Stage 5e: Gemini model discovery + availability check ---------- */
/*
 * Gemini model names are NOT stable across accounts/keys: a fixed model
 * string (e.g. gemini-2.0-flash) may be unavailable for the current key,
 * which surfaces as HTTP 404 "models/xxx is not found" → the user-facing
 * "النموذج المحدد للمزوّد النشط غير متاح للحساب" error and a rejected file
 * even though the file itself is perfectly valid.
 *
 * To avoid ever rejecting a valid file over a model-name mismatch, we
 * discover the models the CURRENT key can actually use (GET /v1beta/models),
 * keep only those that support generateContent, and auto-select / fall back
 * to one that supports PDF + image input and structured JSON output. The
 * availability check runs before the first generateContent call; if the
 * chosen model 404s at call time we refresh the list and retry once with a
 * different available model — the user never sees "model not available" as
 * long as ANY usable model exists for the key.
 *
 * The API key is sent as ?key=... and is NEVER logged. Discovery logs use
 * only model names, counts, and a bare endpoint string.
 */
let geminiModelsCache = { at: 0, models: null };
const GEMINI_MODELS_TTL_MS = 60_000;

// Vision + PDF + JSON-capable Gemini model families. Models whose name matches
// one of these patterns support multimodal input (PDF/images) and structured
// JSON output via generationConfig.responseMimeType.
const GEMINI_VISION_MODEL_PATTERN = /^gemini-(2|1\.5|1\.0)/i;

/**
 * List the models the current key can use that support generateContent.
 * Cached for a short window so we don't list on every batch. Returns an array
 * of { name, displayName, methods }. Returns [] when the list cannot be
 * retrieved (the caller then falls back to the configured model name and lets
 * the real call surface any error).
 */
async function listGeminiModels(apiKey) {
	if (!apiKey) return [];
	const now = Date.now();
	if (geminiModelsCache.models && now - geminiModelsCache.at < GEMINI_MODELS_TTL_MS) {
		return geminiModelsCache.models;
	}
	try {
		const res = await fetch(`${GEMINI_API_BASE}?key=${apiKey}&pageSize=200`, {
			headers: { 'content-type': 'application/json' },
		});
		if (!res.ok) {
			logger.error('gemini model discovery: list models failed', {
				status: res.status,
				statusText: res.statusText,
				endpoint: GEMINI_API_BASE,
			});
			return [];
		}
		const data = await res.json();
		const rows = Array.isArray(data?.models) ? data.models : [];
		const supported = rows
			.filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
			.map((m) => {
				const name = String(m.name || '').replace(/^models\//, '');
				return { name, displayName: m.displayName || name, methods: m.supportedGenerationMethods };
			});
		geminiModelsCache = { at: now, models: supported };
		logger.info('gemini model discovery: available generateContent models', {
			count: supported.length,
			models: supported.map((m) => m.name),
		});
		return supported;
	} catch (e) {
		logger.error('gemini model discovery: error', { message: String(e?.message || e).slice(0, 160) });
		return [];
	}
}

/**
 * Resolve which Gemini model to use for THIS key. Returns
 * { requestedModel, selectedModel, fallbackUsed, available }.
 *
 * - requestedModel = the configured/default model (getGeminiModel()).
 * - If the key's available list includes requestedModel → use it (no fallback).
 * - Otherwise pick the best available vision-capable model (prefer "flash"
 *   for speed, then "pro", then any generateContent model) and set
 *   fallbackUsed = true.
 * - If the list could not be retrieved (empty), return requestedModel with
 *   fallbackUsed=false and let the actual call surface the real error.
 */
async function resolveGeminiModel(apiKey) {
	const requestedModel = getGeminiModel();
	const available = await listGeminiModels(apiKey);
	if (available.length === 0) {
		return { requestedModel, selectedModel: requestedModel, fallbackUsed: false, available: [] };
	}
	const names = available.map((m) => m.name);
	if (names.includes(requestedModel)) {
		return { requestedModel, selectedModel: requestedModel, fallbackUsed: false, available };
	}
	const vision = available.filter((m) => GEMINI_VISION_MODEL_PATTERN.test(m.name));
	const pool = vision.length > 0 ? vision : available;
	const flash = pool.find((m) => /flash/i.test(m.name));
	const pro = pool.find((m) => /pro/i.test(m.name));
	const pick = flash || pro || pool[0];
	logger.info('gemini model discovery: requested model unavailable — using fallback', {
		requested_model: requestedModel,
		selected_model: pick.name,
		fallback_used: true,
		available_count: available.length,
	});
	return { requestedModel, selectedModel: pick.name, fallbackUsed: true, available };
}

/* ---------- Stage 5f: call Google Gemini generateContent API ---------- */
async function callGeminiOnce({ parts, signal, systemPrompt, apiKey, label = 'plan reader' }) {
	const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
	// Model availability check: resolve a model the current key can actually
	// use, falling back automatically if the configured model is unavailable.
	const { requestedModel, selectedModel, fallbackUsed } = await resolveGeminiModel(resolvedKey);
	let model = selectedModel;
	let attemptedFallback = fallbackUsed;

	const body = {
		contents: [{ role: 'user', parts }],
		// responseMimeType: application_json enforces structured JSON output
		// (supported by all generateContent vision models) so the extraction
		// is always parseable JSON.
		generationConfig: { maxOutputTokens: 16000, temperature: 0, responseMimeType: 'application/json' },
	};
	if (systemPrompt) {
		body.systemInstruction = { parts: [{ text: systemPrompt }] };
	}

	// Diagnostic log BEFORE the call — endpoint base + model selection only
	// (never the key). The key is sent as ?key=... and must never appear in
	// logs or responses.
	const mediaBlocks = parts.filter((p) => p.inline_data).map((p, i) => ({
		index: i,
		mime_type: p.inline_data.mime_type,
		base64Length: p.inline_data.data ? p.inline_data.data.length : 0,
	}));
	logger.info(`${label}: Gemini request about to be sent`, {
		requested_model: requestedModel,
		selected_model: model,
		fallback_used: attemptedFallback,
		endpoint: GEMINI_API_BASE,
		blockCount: mediaBlocks.length,
		blocks: mediaBlocks,
		keyConfigured: !!resolvedKey,
	});

	// First attempt with the selected model. On HTTP 404 (model not found for
	// this account), refresh the model list and retry ONCE with a different
	// available model — the user must never see "model not available" when
	// another usable model exists.
	let response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${resolvedKey}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal,
	});

	if (response.status === 404) {
		geminiModelsCache = { at: 0, models: null };
		const available = await listGeminiModels(resolvedKey);
		const alt =
			available.find((m) => m.name !== model && GEMINI_VISION_MODEL_PATTERN.test(m.name)) ||
			available.find((m) => m.name !== model);
		if (alt) {
			const prevModel = model;
			model = alt.name;
			attemptedFallback = true;
			logger.info(`${label}: Gemini model 404 — retrying with fallback model`, {
				requested_model: requestedModel,
				selected_model: model,
				previous_model: prevModel,
				fallback_used: true,
				provider_error_code: 404,
			});
			response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${resolvedKey}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				signal,
			});
		} else {
			logger.error(`${label}: Gemini model 404 and no fallback model available`, {
				requested_model: requestedModel,
				selected_model: model,
				provider_error_code: 404,
				available_count: available.length,
			});
		}
	}

	if (!response.ok) {
		const errorBody = await response.text().catch(() => '');
		// Scrub any accidental `key=...` fragment from the body before logging
		// or surfacing it. Gemini error bodies do not normally echo the key,
		// but this is a defense-in-depth guarantee.
		const maskedBody = String(errorBody || '')
			.replace(/key=[^&"\s]+/g, 'key=…')
			.slice(0, 1600);
		logger.error(`${label}: Gemini API rejected the request`, {
			requested_model: requestedModel,
			selected_model: model,
			fallback_used: attemptedFallback,
			status: response.status,
			statusText: response.statusText,
			provider_error_code: response.status,
			body: maskedBody,
		});
		const err = new Error(
			`Gemini API failed: ${response.status} ${response.statusText} ${String(errorBody || '').replace(/key=[^&"\s]+/g, 'key=…').slice(0, 200)}`,
		);
		err.code = 'PLAN_AI_PROXY';
		err.proxyStatus = response.status;
		throw err;
	}

	const data = await response.json();
	const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
	const text = candidates
		.flatMap((c) => (Array.isArray(c?.content?.parts) ? c.content.parts : []))
		.map((p) => p?.text || '')
		.join('');
	logger.info(`${label}: Gemini API success`, {
		status: response.status,
		requested_model: requestedModel,
		selected_model: data?.modelVersion || model,
		fallback_used: attemptedFallback,
		usage: data?.usageMetadata || null,
		contentLength: text.length,
		contentPreview: String(text).slice(0, 200),
	});
	return text;
}

function classifyPlanAiError(err) {
	const msg = String(err?.message || err || '');
	if (err?.code === 'PLAN_AI_PROXY') {
		const st = Number(err.proxyStatus) || 0;
		if (st === 401 || st === 403) return 'PLAN_AI_AUTH';
		if (st === 404) return 'PLAN_AI_NOT_FOUND';
		if (st === 413 || st === 429) return 'PLAN_AI_TOO_LARGE';
		if (st === 400 && /image|media_type|base64|invalid|could not process|unsupported/i.test(msg)) {
			return 'PLAN_AI_BAD_IMAGE';
		}
		if (st === 400) return 'PLAN_AI_BAD_IMAGE';
		return 'PLAN_AI_PROXY';
	}
	if (/abort|timeout|TimeoutError|ABORT_ERR/i.test(msg)) return 'PLAN_AI_TIMEOUT';
	if (/ECONN|fetch failed|network|socket|ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'PLAN_AI_NETWORK';
	return 'PLAN_AI_PROXY';
}

/**
 * Shared extraction engine — the single place where the ACTIVE provider for a
 * section is resolved and called. Resolution is LIVE: every call reads the
 * ai_provider_keys collection fresh from PocketBase (no caching), so an admin
 * change to the provider, its enabled flag, or its section assignment takes
 * effect on the very next extraction request — no restart, no redeploy.
 *
 * Routing:
 *   - provider "claude"  → Anthropic Messages API (PDFs + images).
 *   - provider "openai"  → OpenAI Chat Completions vision API (images only;
 *                          PDFs surface a clear PLAN_OPENAI_PDF_ONLY error).
 *   - any other provider → PLAN_PROVIDER_NOT_IMPLEMENTED (never silently
 *                          pretends to call a provider it cannot reach).
 *
 * The secret key is read from process.env[resolved.env_var] at call time —
 * never hardcoded, never sent to the browser. Returns the model's raw text
 * or a structured error code + detail.
 */
async function runModelExtraction({
	section,
	fallbackEnv,
	contentItems,
	promptText,
	systemPrompt,
	label,
	jobId,
	extraLog = {},
	forceProvider = null,
	forceEnvVar = null,
	excludeProviders = [],
}) {
	// forceProvider lets a caller pin the extraction to a specific provider
	// (e.g. Gemini as the primary Estate AI extractor) instead of resolving
	// the admin-managed active provider. If the forced provider's key is not
	// configured, we fall through to normal resolution so the flow still works.
	//
	// excludeProviders lets a caller forbid certain providers for THIS call.
	// Estate AI's document-reader path excludes 'openai' because OpenAI is the
	// final JSON REVIEWER only — PDFs/images are never sent to it. So when the
	// forced provider (Gemini) is unavailable, the reader falls back to Claude
	// (Anthropic, which supports PDFs + images), never to OpenAI. This makes
	// PLAN_OPENAI_PDF_ONLY unreachable from the extraction path: OpenAI is
	// simply never chosen as the document reader.
	const excluded = Array.isArray(excludeProviders) ? excludeProviders : [];
	let resolved = null;
	if (forceProvider && !excluded.includes(forceProvider)) {
		const envVar = forceEnvVar
			|| (forceProvider === 'gemini' ? 'GEMINI_API_KEY'
				: forceProvider === 'openai' ? 'OPENAI_API_KEY'
					: 'ANTHROPIC_API_KEY');
		if (isIntegrationConfigured(envVar)) {
			resolved = { env_var: envVar, provider: forceProvider, name: '', id: null };
		}
	}
	if (!resolved) {
		resolved = await resolveProviderForSection(section, fallbackEnv);
	}
	// If the resolved provider is excluded for this call (e.g. OpenAI for the
	// document-reader path), fall back to the legacy env (Anthropic Claude),
	// which supports both PDFs and images. Only return not-configured when no
	// permitted reader is available.
	if (resolved && excluded.includes(resolved.provider)) {
		logger.info(`${label}: resolved provider '${resolved.provider}' is excluded for this call; falling back to ${fallbackEnv || '(none)'}`, {
			jobId: jobId || '',
			section,
			excluded,
		});
		if (fallbackEnv && isIntegrationConfigured(fallbackEnv)) {
			resolved = { env_var: fallbackEnv, provider: 'claude', name: '', id: null };
		} else {
			resolved = null;
		}
	}
	if (!resolved) {
		return { ok: false, code: 'PLAN_NOT_CONFIGURED', detail: '' };
	}
	const apiKey = process.env[resolved.env_var];
	const provider = resolved.provider || 'claude';
	const baseLog = {
		jobId: jobId || '',
		section,
		provider,
		envVar: resolved.env_var,
		keyConfigured: !!apiKey,
		...extraLog,
	};

	let content;
	let callOnce;
	let timeoutMs;
	let diagnosticBlocks;
	let mediaBlockCount;

	if (provider === 'openai') {
		const built = buildOpenAiContent({ promptText, items: contentItems });
		if (built.imageCount === 0) {
			logger.error(`${label}: OpenAI provider received PDF-only input`, {
				...baseLog,
				pdfCount: built.pdfCount,
			});
			return {
				ok: false,
				code: 'PLAN_OPENAI_PDF_ONLY',
				detail: `OpenAI vision supports images only (${built.pdfCount} PDF file(s) could not be sent)`,
			};
		}
		content = built.content;
		callOnce = (signal) => callOpenAiOnce({ content, signal, systemPrompt, apiKey, label });
		timeoutMs = OPENAI_TIMEOUT_MS;
		diagnosticBlocks = content
			.filter((c) => c.type === 'image_url')
			.map((c, i) => ({ index: i, type: 'image_url', media_type: c._mediaType, bytes: c._bytes }));
		mediaBlockCount = built.imageCount;
	} else if (provider === 'claude') {
		content = buildAnthropicContent({ promptText, items: contentItems });
		callOnce = (signal) => callAnthropicOnce({ content, signal, systemPrompt, apiKey, label });
		timeoutMs = ANTHROPIC_TIMEOUT_MS;
		diagnosticBlocks = content
			.filter((c) => c.type === 'image' || c.type === 'document')
			.map((c, i) => ({
				index: i,
				type: c.type,
				media_type: c.source?.media_type,
				base64Length: c.source?.data ? c.source.data.length : 0,
				pages: c.type === 'document' ? countPdfPages(Buffer.from(c.source.data, 'base64')) : null,
			}));
		mediaBlockCount = content.filter((c) => c.type === 'image' || c.type === 'document').length;
	} else if (provider === 'gemini') {
		const built = buildGeminiContent({ promptText, items: contentItems });
		content = built.parts;
		callOnce = (signal) => callGeminiOnce({ parts: content, signal, systemPrompt, apiKey, label });
		timeoutMs = GEMINI_TIMEOUT_MS;
		diagnosticBlocks = content
			.filter((p) => p.inline_data)
			.map((p, i) => ({
				index: i,
				type: 'inline_data',
				media_type: p.inline_data.mime_type,
				base64Length: p.inline_data.data ? p.inline_data.data.length : 0,
			}));
		mediaBlockCount = built.mediaBlockCount;
	} else {
		logger.error(`${label}: provider has no extraction call path`, baseLog);
		return {
			ok: false,
			code: 'PLAN_PROVIDER_NOT_IMPLEMENTED',
			detail: `Provider '${provider}' has no extraction call path implemented`,
		};
	}

	if (mediaBlockCount === 0) {
		return { ok: false, code: 'PLAN_PARSE_FAILED', detail: 'No media blocks built for model' };
	}

	logger.info(`${label}: model request`, {
		...baseLog,
		model: provider === 'openai' ? getOpenAiModel() : provider === 'gemini' ? getGeminiModel() : getPlanModel(),
		blocks: diagnosticBlocks,
		promptChars: promptText.length,
	});

	let modelText = '';
	let lastCode = 'PLAN_AI_PROXY';
	let lastDetail = '';
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			modelText = await callOnce(controller.signal);
			clearTimeout(timer);
			logger.info(`${label}: model response`, { ...baseLog, attempt, contentLen: modelText.length });
			if (!modelText || !modelText.trim()) {
				logger.error(`${label}: model returned empty content`, { ...baseLog, attempt });
				lastCode = 'PLAN_AI_EMPTY';
				lastDetail = 'empty model content';
				break;
			}
			lastCode = null;
			lastDetail = '';
			break;
		} catch (e) {
			clearTimeout(timer);
			const code = classifyPlanAiError(e);
			lastCode = code;
			lastDetail = String(e?.message || e)
				.replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-…')
				.slice(0, 240);
			logger.error(`${label}: attempt ${attempt} failed`, { ...baseLog, code, message: lastDetail });
			const retryable =
				code === 'PLAN_AI_TIMEOUT' ||
				code === 'PLAN_AI_NETWORK' ||
				e?.retryable === true ||
				(code === 'PLAN_AI_PROXY' && /502|503|504|429/.test(e?.proxyStatus || ''));
			if (attempt === 2 || !retryable) break;
		}
	}
	if (lastCode) {
		return { ok: false, code: lastCode, detail: lastDetail };
	}
	return { ok: true, text: modelText, provider };
}

/* ================================================================== */
/* Smart Payment Plan Reader — async job queue (polling endpoints)     */
/* ================================================================== */
/*
 * The heavy Claude call runs in the background (runPlanJob, below) and
 * writes its result into the `payment_plan_jobs` PocketBase collection.
 * The UI polls these lightweight endpoints instead of holding the original
 * upload request open — so a 504 gateway timeout can never cut off an
 * in-flight analysis, and the result survives a dropped connection or a
 * page reload (the client simply re-polls and picks it up).
 */

/** Return the owner's current pending/processing job (for resume), or null. */
router.get('/plan-jobs/active', async (req, res) => {
	try {
		const existing = await pocketbaseClient
			.collection('payment_plan_jobs')
			.getFirstListItem(
				`owner = "${req.pocketbaseUserId}" && (status = "pending" || status = "processing")`,
				{ sort: '-created' },
			);
		return res.json({
			jobId: existing.id,
			status: existing.status,
			stage: existing.stage || '',
			progress: existing.progress || 0,
		});
	} catch {
		return res.json({ jobId: null });
	}
});

/** Poll one job. Marks a stale "processing" job as failed (timeout). */
router.get('/plan-jobs/:id', async (req, res) => {
	const { id } = req.params;
	if (!id) return res.status(422).json({ error: 'id required' });

	let job;
	try {
		job = await pocketbaseClient.collection('payment_plan_jobs').getOne(id);
	} catch {
		return res.status(404).json({ error: 'PLAN_JOB_NOT_FOUND' });
	}

	if (String(job.owner || '') !== req.pocketbaseUserId) {
		return res.status(403).json({ error: 'PLAN_JOB_FORBIDDEN' });
	}

	// Stale detection: if a job has been "processing" with no update for too
	// long, the background work was likely killed (process restart). Mark it
	// failed so the user can retry instead of waiting forever.
	if (job.status === 'pending' || job.status === 'processing') {
		try {
			const updatedMs = new Date(job.updated).getTime();
			if (Number.isFinite(updatedMs) && Date.now() - updatedMs > PLAN_JOB_STALE_MS) {
				const msgs = planErrorMessages('PLAN_AI_TIMEOUT');
				await pocketbaseClient.collection('payment_plan_jobs').update(id, {
					status: 'failed',
					error_code: 'PLAN_AI_TIMEOUT',
					error_message_ar: msgs.ar,
					error_message_en: msgs.en,
					completed_at: new Date().toISOString(),
				});
				job.status = 'failed';
				job.error_code = 'PLAN_AI_TIMEOUT';
				job.error_message_ar = msgs.ar;
				job.error_message_en = msgs.en;
			}
		} catch {
			/* ignore stale-update failure */
		}
	}

	const result = job.result || {};
	return res.json({
		id: job.id,
		status: job.status,
		stage: job.stage || '',
		progress: job.progress || 0,
		error_code: job.error_code || '',
		error_message_ar: job.error_message_ar || '',
		error_message_en: job.error_message_en || '',
		completed_at: job.completed_at || '',
		result,
	});
});

/**
 * Background processing for one plan-analysis job. Runs fire-and-forget
 * (NOT awaited by the request handler) and writes every stage + the final
 * result into the job record in PocketBase. Because the result is persisted
 * before the UI is notified, a dropped connection never loses a paid-for
 * extraction — the client simply re-polls and picks it up.
 */
async function runPlanJob(jobId, files, parsedMessage) {
	const updateJob = async (patch) => {
		try {
			await pocketbaseClient.collection('payment_plan_jobs').update(jobId, patch);
		} catch (err) {
			logger.error('plan job: update failed', {
				jobId,
				error: String(err?.message || err).slice(0, 160),
			});
		}
	};

	const failJob = async (code, extra = {}) => {
		const msgs = planErrorMessages(code, extra);
		await updateJob({
			status: 'failed',
			error_code: code,
			error_message_ar: msgs.ar,
			error_message_en: msgs.en,
			completed_at: new Date().toISOString(),
		});
	};

	try {
		await updateJob({ status: 'processing', stage: 'upload', progress: 10 });

		const totalFiles = files.length;

		// ---- Stage 2: best-effort store (never blocks analysis) ----
		const workFiles = [];
		const failedFiles = [];
		for (const file of files) {
			const fallbackName = file.originalname || `file-${workFiles.length + 1}`;
			let stored = null;
			try {
				// eslint-disable-next-line no-await-in-loop
				stored = await storeOriginalFile(file);
			} catch (err) {
				const errMsg = String(err?.message || err).slice(0, 160);
				logger.error('plan reader: storage upload failed (analysis continues)', {
					jobId,
					name: fallbackName,
					error: errMsg,
				});
				failedFiles.push({ name: fallbackName, error: errMsg, stage: 'storage' });
				stored = {
					name: fallbackName,
					hash: file.buffer ? sha256(file.buffer) : '',
					kind: detectBufferKind(file.buffer, file.mimetype, fallbackName).kind === 'pdf' ? 'pdf' : 'image',
				};
			}
			workFiles.push({ file, stored });
		}
		await updateJob({ stage: 'read', progress: 25, total_files: totalFiles });

		// ---- Stage 3: prepare files as Claude content blocks ----
		// PDFs → document blocks (base64, application/pdf); images → image
		// blocks (base64, native media_type). No canvas / page rendering.
		const contentItems = [];
		const pageErrors = [];
		let unsupportedCount = 0;
		let tooLargeCount = 0;
		for (const { file, stored } of workFiles) {
			try {
				// eslint-disable-next-line no-await-in-loop
				const items = await prepareFileForClaude(file);
				items.forEach((it) => contentItems.push(it));
			} catch (err) {
				if (err?.code === 'PLAN_UNSUPPORTED_TYPE') unsupportedCount += 1;
				if (err?.code === 'PLAN_AI_TOO_LARGE') tooLargeCount += 1;
				pageErrors.push(`${stored.name}: ${String(err?.message || err).slice(0, 160)}`);
				logger.error('plan reader: file preparation failed', {
					jobId,
					name: stored.name,
					error: String(err?.message || err),
				});
			}
		}
		if (contentItems.length === 0) {
			const code = tooLargeCount > 0
				? 'PLAN_AI_TOO_LARGE'
				: unsupportedCount === workFiles.length ? 'PLAN_UNSUPPORTED_TYPE' : 'PLAN_PARSE_FAILED';
			await failJob(code, {
				pageHint: pageErrors[0] || '',
				detail: pageErrors.join(' | ').slice(0, 240),
			});
			return;
		}
		await updateJob({ stage: 'extract', progress: 40 });

		// ---- Stage 4 + 5: build content blocks + call Anthropic Claude ----
		const promptText = (parsedMessage || [])
			.filter((b) => b && (b.type === ContentBlockType.Text || b.type === 'text'))
			.map((b) => b.text)
			.join('\n');

		const extraction = await runModelExtraction({
			section: 'plan_reader',
			fallbackEnv: 'ANTHROPIC_API_KEY',
			contentItems,
			promptText,
			systemPrompt: PlanExtractionSystemPrompt,
			label: 'plan reader',
			jobId,
		});
		await updateJob({ progress: 75 });
		if (!extraction.ok) {
			await failJob(extraction.code, { detail: extraction.detail });
			return;
		}
		const modelText = extraction.text;

		// ---- Stage 6: parse JSON + light deterministic pass ----
		const raw = extractJsonFromText(modelText);
		const jsonValid = !!raw;
		const installmentCount = Array.isArray(raw?.installments) ? raw.installments.length : 0;
		logger.info('plan reader: JSON parse', { jobId, jsonValid, installmentCount, found: raw?.found });
		if (!jsonValid) {
			logger.error('plan reader: JSON parsing failed — no JSON object found', {
				jobId,
				contentPreview: String(modelText).slice(0, 300),
			});
			await failJob('PLAN_AI_EMPTY', { detail: 'Model response was not valid JSON' });
			return;
		}

		// Read the total price hint from the prompt (passed by the client).
		let totalPriceHint = '';
		try {
			const txt = (parsedMessage || [])
				.filter((b) => b && (b.type === ContentBlockType.Text || b.type === 'text'))
				.map((b) => b.text)
				.join('\n');
			const m = txt.match(/total price[^:]*:\s*([0-9.,]+)/i);
			if (m) totalPriceHint = m[1].replace(/,/g, '');
		} catch {
			/* ignore */
		}

		const sourceFiles = workFiles.map(({ stored }) => ({ name: stored.name, hash: stored.hash }));

		// The model explicitly says no plan was found → completed but empty.
		if (raw?.found === false || !Array.isArray(raw.installments) || raw.installments.length === 0) {
			logger.info('plan reader: no payment plan found in document', { jobId });
			await updateJob({
				status: 'completed',
				stage: 'ready',
				progress: 100,
				completed_at: new Date().toISOString(),
				result: {
					installments: [],
					found: false,
					currency: raw?.currency || null,
					totalPrice: raw?.total_price != null ? String(raw.total_price) : null,
					validation: { sumPct: 0, sumAmt: 0, price: 0, pctOk: false, pctDiff: 0, amtDiff: null, amtOk: true },
					needsReviewCount: 0,
					sourceFiles,
					uploadedCount: contentItems.length,
					totalFiles,
					failedFiles,
					pageErrors,
				},
			});
			return;
		}

		const processed = processAiPlan(raw, totalPriceHint);
		logger.info('plan reader: light validation', {
			jobId,
			rows: processed.installments.length,
			needsReview: processed.needsReviewCount,
			sumPct: processed.validation.sumPct,
		});

		// ---- Stage 7: persist the final structured installment list ----
		await updateJob({
			status: 'completed',
			stage: 'ready',
			progress: 100,
			completed_at: new Date().toISOString(),
			result: {
				installments: processed.installments,
				found: true,
				currency: processed.currency,
				totalPrice: processed.totalPrice,
				validation: processed.validation,
				needsReviewCount: processed.needsReviewCount,
				sourceFiles,
				uploadedCount: contentItems.length,
				totalFiles,
				failedFiles,
				pageErrors,
			},
		});
	} catch (err) {
		logger.error('plan job: unexpected failure', {
			jobId,
			error: String(err?.message || err).slice(0, 240),
		});
		await failJob('PLAN_AI_PROXY', { detail: String(err?.message || err).slice(0, 160) });
	}
}

router.post(
	'/analyze-plan',
	integratedAiRateLimit,
	uploadFiles({
		// Any number of files, any size, any type (PDF or image in any
		// language/format). The user explicitly asked for no upload limits.
		maxCount: 200,
		maxSizeMB: 2048,
		fieldName: 'images',
		allowAny: true,
	}),
	async (req, res) => {
		// Plan Reader AI retired — Estate AI now powers ONLY the add_property
		// section (/extract-property). This endpoint never calls any AI API
		// and never consumes a provider key; it returns a clear, localized
		// "feature retired" message so legacy callers fail gracefully. The
		// conditional return below always fires; the legacy body after it is
		// inert dead code kept to avoid a large diff.
		const planResolved = null;
		if (!planResolved) {
			return respondPlanError(res, 410, 'PLAN_FEATURE_DISABLED');
		}

		const { message } = req.body;

		if (!message) {
			return respondPlanError(res, 422, 'PLAN_MISSING_MESSAGE');
		}
		if (typeof message !== 'string') {
			return respondPlanError(res, 422, 'PLAN_MISSING_MESSAGE', { detail: 'message must be a string' });
		}

		let parsedMessage;
		try {
			parsedMessage = JSON.parse(message);
		} catch {
			return respondPlanError(res, 422, 'PLAN_MISSING_MESSAGE', { detail: 'message JSON invalid' });
		}
		const totalFiles = req.files?.length || 0;
		if (totalFiles === 0) {
			return respondPlanError(res, 422, 'PLAN_NO_FILES');
		}

		// Pre-flight: reject oversized images instantly before creating a job
		// and firing a paid Claude call that would just 400. PDFs are batched
		// into ≤100-page document blocks in prepareFileForClaude (no page limit).
		const oversized = findOversizedFile(req.files || []);
		if (oversized) {
			return respondPlanError(res, 413, 'PLAN_AI_TOO_LARGE', {
				detail: `${oversized.name}: ${(oversized.bytes / 1024 / 1024).toFixed(1)}MB`,
			});
		}

		// ---- Duplicate prevention: one active job per owner ----
		// If the user already has a pending/processing job (e.g. they clicked
		// "Analyze" again, or reloaded the page), hand back the same job id
		// instead of starting a second paid Claude call.
		try {
			const existing = await pocketbaseClient
				.collection('payment_plan_jobs')
				.getFirstListItem(
					`owner = "${req.pocketbaseUserId}" && (status = "pending" || status = "processing")`,
					{ sort: '-created' },
				);
			if (existing) {
				return res.json({
					jobId: existing.id,
					status: existing.status,
					alreadyRunning: true,
				});
			}
		} catch {
			/* no active job — continue */
		}

		const fileHashes = (req.files || []).map((f) => (f.buffer ? sha256(f.buffer) : ''));

		// ---- Create the job record, then fire background processing ----
		let job;
		try {
			job = await pocketbaseClient.collection('payment_plan_jobs').create({
				owner: req.pocketbaseUserId,
				status: 'pending',
				stage: 'upload',
				progress: 5,
				total_files: totalFiles,
				file_hashes: fileHashes,
				result: {},
			});
		} catch (err) {
			logger.error('plan job: create failed', {
				error: String(err?.message || err).slice(0, 200),
			});
			return respondPlanError(res, 500, 'PLAN_JOB_CREATE_FAILED');
		}

		// Fire-and-forget: the heavy Claude call runs in the background and
		// writes its result to the job record. We return the job id NOW so the
		// gateway never times out, and the client polls /plan-jobs/:id.
		runPlanJob(job.id, req.files, parsedMessage).catch((err) => {
			logger.error('plan job: background crashed', {
				jobId: job.id,
				error: String(err?.message || err).slice(0, 200),
			});
		});

		return res.json({ jobId: job.id, status: 'pending' });
	},
);

/* ================================================================== */
/* AI Property Creator — extract property data from any contract       */
/* ================================================================== */
/*
 * Powers the new chat-based "add property via AI" flow in the AI tab.
 * Sends the uploaded contract (PDF / image, any language) directly to the
 * same Anthropic Claude engine used by the Smart Payment Plan Reader.
 *
 * PRIVACY IS ENFORCED IN THE PROMPT: Claude is instructed to extract ONLY
 * the allowed property/financial fields and to NEVER extract or echo buyer
 * name, nationality, passport, email, phone, contract number, contract date,
 * mortgage status, or parking count. The forbidden fields are not returned.
 *
 * DATES: Claude returns each date EITHER as an absolute ISO date (read from
 * the document) OR as a relative reference ({to:"booking_date"|"handover",
 * offset_months:N}). It does NOT compute relative dates — the frontend
 * computes the real calendar date mathematically from a start point. If the
 * start point is missing, the frontend asks the user for it.
 *
 * If the document has no installment schedule (e.g. an Oqood title deed),
 * schedule.found = false so the UI asks the user to upload a payment plan
 * separately instead of inventing one.
 */

const PropertyExtractionSystemPrompt = `You are a real-estate contract extraction engine for documents in ANY language (Arabic, English, or any other).

The attached content (PDF documents and/or images) is ONE single document — a Sales-Purchase Agreement (SPA), Oqood title deed, Sales Offer, land contract, lease, or any similar real-estate document. Treat all attached pages/files as one continuous document.

=== ALLOWED FIELDS — extract these ONLY ===
Property:
- project / building name
- unit number
- property type (studio / apartment / villa / townhouse / office / shop / land / etc. — use the document's own term)
- area value AND its unit (sqft or sqm — never mix; keep exactly what the document states)
- region / community / area name
- total price (the final price the buyer pays). If a discount is shown, also return original_price, discounted_price, and discount_percentage (the percentage off the original price — stated in the document or clearly derivable; null if no discount).
- expected delivery / handover date (absolute ISO date if stated, OR a relative reference to booking date)

Fees (each with name, amount, and due date if stated):
- DLD / land department registration fee (Dubai Land Department fee, Oqood fee, or any government registration fee)
- admin fee, booking fee, service charge, or any other one-off fee

Installment schedule (ONLY if a payment plan / installment table exists in the document):
- every installment row: number, name/label, percentage, amount, and due date
- due date: absolute ISO date (YYYY-MM-DD) if the row has one, OR a relative reference {to:"booking_date"|"handover", offset_months:N} for phrases like "1 month from booking date", "3 months after handover", "شهر من تاريخ الحجز", "3 أشهر بعد التسليم"

=== FORBIDDEN FIELDS — NEVER extract, store, or echo these ===
- buyer name, nationality, passport number, email, phone, any contact detail
- contract number, contract date, signing date
- mortgage status / mortgage details
- number of parking spaces
- any other personal data not listed in ALLOWED FIELDS above
If a field is forbidden, omit it entirely. Do not include it as null.

=== START POINTS (for relative date computation only — NOT stored as property fields) ===
If the document states a booking date or a handover/delivery date explicitly, return it in start_points so the frontend can compute relative installment dates. These are computation inputs only.

=== NO SCHEDULE CASE ===
If the document contains property data but NO installment/payment schedule table, set schedule.found = false and schedule.installments = []. Do NOT invent any installment. (Example: an Oqood title deed usually has no payment plan.)

Return ONLY one valid JSON object (no prose, no markdown fences, no explanation):
{
  "document_type": "SPA" | "Oqood" | "Sales Offer" | "Lease" | "Land Contract" | "Other" | null,
  "property": {
    "building": "...",
    "unit_number": "...",
    "property_type": "...",
    "area_value": 1234,
    "area_unit": "sqm" | "sqft",
    "community": "...",
    "total_price": 1234567,
    "original_price": 1300000,
    "discounted_price": 1234567,
    "discount_percentage": 5,
    "expected_delivery_date": "2027-12-01",
    "delivery_date_relative": { "to": "booking_date", "offset_months": 36 }
  },
  "fees": [
    { "name": "Booking Fee", "amount": 5000, "due_date": "2026-05-25", "due_date_relative": null }
  ],
  "schedule": {
    "found": true,
    "currency": "AED",
    "installments": [
      { "number": 1, "name": "Down Payment", "percentage": 10, "amount": 70000, "due_date": "2026-05-25", "due_date_relative": null }
    ]
  },
  "start_points": {
    "booking_date": "2026-05-25",
    "handover_date": "2027-12-01"
  }
}

Use null for any allowed field that is not present in the document. Never invent values.`;

/* ================================================================== */
/* Rental / Lease extraction — Estate AI "للإيجار" path                */
/* ================================================================== */
/*
 * Powers the "للإيجار" (Rented) branch of the AI Property Creator. The
 * uploaded files (lease contract, annex, cheques, receipts, any related
 * document, PDF or image) are treated as ONE single lease. Claude extracts
 * the property data, the lease contract data, and every payment/cheque row
 * with a strict no-fabrication policy: payment_status is "paid" ONLY when
 * the document states clearly the payment was made/collected, otherwise
 * "unpaid". Dates are returned as YYYY-MM-DD. Missing fields are null.
 */

const RentalExtractionSystemPrompt = `You are a real-estate LEASE / rental contract extraction engine for documents in ANY language (Arabic, English, or any other).

The attached content (PDF documents and/or images) is ONE single lease agreement plus any related documents (lease contract, annex/addendum, cheques, receipts, payment schedule, or any document related to the same rental). Treat ALL attached pages/files as ONE continuous lease — merge every page into ONE result. Never analyse each page or file as a separate lease.

YOUR JOB — extract ONLY the following, in the document's own language and terms:

1. PROPERTY DATA:
- project_name (project / building / compound name)
- developer_or_company (the landlord / developer / management company / owner company named in the lease)
- property_type (studio / apartment / villa / townhouse / office / shop / land / etc. — use the document's own term)
- unit_number
- building_name
- country
- city
- area_name (community / district / region / neighbourhood)
- property_area (numeric area value) AND area_unit ("sqm" or "sqft" — exactly as the document states; never mix)
- plot_number (land plot number — only if present, otherwise null)

2. LEASE CONTRACT DATA:
- tenant_name (the tenant's full name as written in the lease)
- tenant_phone (the tenant's phone number, only if stated in the lease or on an attached ID/passport page, otherwise null)
- tenant_email (the tenant's email address, only if stated, otherwise null)
- tenant_nationality (the tenant's nationality, only if stated in the lease or on an attached passport/ID page, otherwise null)
- contract_start_date (YYYY-MM-DD)
- contract_end_date (YYYY-MM-DD)
- contract_duration (free text exactly as stated, e.g. "12 months", "1 year", "11 months")
- annual_rent (numeric annual rent amount)
- total_rent (numeric total rent for the whole contract term, if stated)
- currency (e.g. "AED", "SAR", "USD")
- security_deposit (numeric deposit amount, if stated)
- management_fee (numeric building/management fee, if stated)
- other_fees (array of {name, amount, currency} for any other fee mentioned — service charge, agency fee, municipality fee, etc.; empty array if none)

3. PAYMENTS / CHEQUES — extract EVERY payment row in document order:
- payment_number (sequential 1,2,3…)
- payment_type (the document's own term — e.g. "cheque", "cash", "bank transfer", "deposit", "monthly rent", "quarterly rent")
- amount (numeric)
- currency
- due_date (YYYY-MM-DD) — the date the payment is due/payable as stated on the cheque or schedule
- cheque_number (only if a cheque number is printed/stated, otherwise null)
- bank_name (only if a bank name is stated for the cheque, otherwise null)
- payment_status — STRICT RULE:
    * "paid" ONLY when the document clearly states or proves the payment was made / collected / cleared / deposited / encashed. Examples: a stamped "received" receipt, "paid" mark, bank clearance note, "collected" wording.
    * "unpaid" when there is NO clear evidence the payment was made. A cheque that is merely listed in a schedule with no paid/cleared marking is "unpaid".
    * NEVER guess. When unsure, use "unpaid".
- notes (any short note on the row, otherwise "")

=== DATE RULE ===
Every date must be returned as YYYY-MM-DD (ISO). If a date is not clearly present, use null. Never invent a date.

=== MISSING DATA RULE ===
Use null for any field not present in the document. Never invent or estimate any value. Never copy one row's date/amount onto another row.

=== NO PAYMENTS CASE ===
If the document contains lease data but NO payment/cheque schedule, return payments: [].

Return ONLY one valid JSON object (no prose, no markdown fences, no explanation):
{
  "document_type": "Lease" | "Other" | null,
  "property": {
    "project_name": "...",
    "developer_or_company": "...",
    "property_type": "...",
    "unit_number": "...",
    "building_name": "...",
    "country": "...",
    "city": "...",
    "area_name": "...",
    "property_area": 1234,
    "area_unit": "sqm",
    "plot_number": null
  },
  "lease": {
    "tenant_name": "...",
    "tenant_phone": null,
    "tenant_email": null,
    "tenant_nationality": null,
    "contract_start_date": "2026-01-01",
    "contract_end_date": "2027-01-01",
    "contract_duration": "12 months",
    "annual_rent": 120000,
    "total_rent": 120000,
    "currency": "AED",
    "security_deposit": 12000,
    "management_fee": null,
    "other_fees": []
  },
  "payments": [
    {
      "payment_number": 1,
      "payment_type": "cheque",
      "amount": 30000,
      "currency": "AED",
      "due_date": "2026-01-01",
      "cheque_number": "123456",
      "bank_name": "Emirates NBD",
      "payment_status": "unpaid",
      "notes": ""
    }
  ]
}`;

/* ================================================================== */
/* Multi-batch helpers — split large PDFs into ≤100-page Claude calls  */
/* ================================================================== */
/*
 * Anthropic Claude enforces a HARD 100-page limit PER API request — across
 * ALL document blocks in that request, not per block. The previous code
 * split a long PDF into ≤100-page document blocks but sent them all in ONE
 * request, so a 200-page PDF (two 100-page blocks) still hit
 * "A maximum of 100 PDF pages may be provided".
 *
 * The fix: group the prepared content items into REQUEST batches where each
 * batch carries at most 100 PDF pages total, send each batch as a SEPARATE
 * Claude request, then merge every batch's JSON result into one final
 * extraction. No field is ever fabricated — a value is only taken from a
 * batch where Claude actually found it.
 */

/** Normalize a date field on a row/property object to ISO + relative form. */
function normalizeExtractionDateField(row, dateKey, relKey) {
	const out = { ...row };
	const rawDue = row[dateKey] != null ? row[dateKey] : '';
	const due = parseFlexibleDate(rawDue);
	if (row[relKey] && typeof row[relKey] === 'object' && row[relKey].offset_months != null) {
		out[relKey] = {
			to: row[relKey].to === 'booking_date' ? 'booking_date' : 'handover',
			offset_months: Number(row[relKey].offset_months) || 0,
		};
		out[dateKey] = null;
		return out;
	}
	if (due) {
		out[dateKey] = due;
		out[relKey] = null;
		return out;
	}
	const relHand = parseRelativeHandoverOffset(rawDue);
	if (relHand != null) {
		out[relKey] = { to: 'handover', offset_months: relHand };
		out[dateKey] = null;
		return out;
	}
	const relBook = parseRelativeBookingOffset(rawDue);
	if (relBook != null) {
		out[relKey] = { to: 'booking_date', offset_months: relBook };
		out[dateKey] = null;
		return out;
	}
	out[dateKey] = null;
	out[relKey] = null;
	return out;
}

/** Group prepared content items into request batches of ≤100 PDF pages each. */
function groupContentIntoRequestBatches(contentItems) {
	const batches = [];
	let current = { items: [], pages: 0, hasDocument: false, hasImage: false };
	for (const item of contentItems) {
		// Use the accurate pdf-lib page count attached at prepare time instead
		// of the regex-based counter (which returns 0 for some valid PDFs and
		// would cause a multi-batch PDF to never split).
		const pages = item.kind === 'document' ? (item.pages || 0) : 0;
		// Start a new batch when a document item would push the running total
		// over 100 pages. Images carry 0 pages and ride along with the current
		// batch (they do not count toward the PDF page limit).
		if (item.kind === 'document' && current.pages + pages > 100 && current.items.length > 0) {
			batches.push(current);
			current = { items: [], pages: 0, hasDocument: false, hasImage: false };
		}
		current.items.push(item);
		current.pages += pages;
		if (item.kind === 'document') current.hasDocument = true;
		else current.hasImage = true;
	}
	if (current.items.length > 0) batches.push(current);
	return batches;
}

/** Build a human-readable label per batch with global page ranges. */
function buildBatchLabels(batches, ar) {
	const labels = [];
	let pageCursor = 0;
	batches.forEach((b, i) => {
		const start = b.pages > 0 ? pageCursor + 1 : 0;
		const end = b.pages > 0 ? pageCursor + b.pages : 0;
		pageCursor += b.pages;
		if (b.pages > 0) {
			labels.push(
				ar
					? `جاري معالجة الصفحات ${start}-${end} (دفعة ${i + 1}/${batches.length})`
					: `Processing pages ${start}-${end} (batch ${i + 1}/${batches.length})`,
			);
		} else if (b.hasDocument) {
			labels.push(
				ar
					? `جاري معالجة المستند (دفعة ${i + 1}/${batches.length})`
					: `Processing document (batch ${i + 1}/${batches.length})`,
			);
		} else {
			labels.push(
				ar
					? `جاري معالجة الصور (دفعة ${i + 1}/${batches.length})`
					: `Processing images (batch ${i + 1}/${batches.length})`,
			);
		}
	});
	return labels;
}

const MERGE_PROPERTY_FIELDS = [
	'building', 'unit_number', 'property_type', 'area_value', 'area_unit',
	'community', 'total_price', 'original_price', 'discounted_price',
	'discount_percentage', 'expected_delivery_date', 'delivery_date_relative',
];

/**
 * Merge per-batch JSON results into one extraction WITHOUT fabricating any
 * field. For each property field the first non-null value found across
 * batches (in order) wins. Fees and installment rows are concatenated in
 * batch order; installments are then renumbered sequentially so the merged
 * schedule is a single coherent list. start_points take the first non-null
 * booking/handover date. schedule.found is true if ANY batch found rows.
 */
function mergeBatchResults(batchResults) {
	const merged = {
		document_type: null,
		property: {},
		fees: [],
		schedule: { found: false, currency: null, installments: [] },
		start_points: {},
	};
	for (const key of MERGE_PROPERTY_FIELDS) merged.property[key] = null;

	for (const r of batchResults) {
		if (!r) continue;
		if (r.document_type && !merged.document_type) merged.document_type = r.document_type;
		const p = r.property || {};
		for (const key of MERGE_PROPERTY_FIELDS) {
			if (merged.property[key] == null && p[key] != null && p[key] !== '') {
				merged.property[key] = p[key];
			}
		}
		if (Array.isArray(r.fees)) merged.fees.push(...r.fees);
		const s = r.schedule || {};
		if (s.found !== false && Array.isArray(s.installments) && s.installments.length > 0) {
			merged.schedule.found = true;
		}
		if (s.currency && !merged.schedule.currency) merged.schedule.currency = s.currency;
		if (Array.isArray(s.installments)) merged.schedule.installments.push(...s.installments);
		const sp = r.start_points || {};
		if (sp.booking_date && !merged.start_points.booking_date) merged.start_points.booking_date = sp.booking_date;
		if (sp.handover_date && !merged.start_points.handover_date) merged.start_points.handover_date = sp.handover_date;
	}
	// Renumber installments sequentially across all batches.
	merged.schedule.installments = merged.schedule.installments.map((row, i) => ({
		...row,
		number: i + 1,
	}));
	return merged;
}

/* ---------- Rental merge: combine per-batch lease results ---------- */
/*
 * Same no-fabrication principle as mergeBatchResults, but for the rental
 * shape: property fields + lease fields take the first non-null value across
 * batches; payment/cheque rows are concatenated in batch order, then
 * de-duplicated (same payment_number + amount + due_date + cheque_number),
 * then renumbered sequentially. other_fees are concatenated and de-duplicated
 * by name. Dates are normalized to ISO in runExtractJob after the merge.
 */
const MERGE_RENTAL_PROPERTY_FIELDS = [
	'project_name', 'developer_or_company', 'property_type', 'unit_number',
	'building_name', 'country', 'city', 'area_name', 'property_area',
	'area_unit', 'plot_number',
];
const MERGE_RENTAL_LEASE_FIELDS = [
	'tenant_name', 'tenant_phone', 'tenant_email', 'tenant_nationality',
	'contract_start_date', 'contract_end_date', 'contract_duration',
	'annual_rent', 'total_rent', 'currency', 'security_deposit', 'management_fee',
];

function mergeRentalBatchResults(batchResults) {
	const merged = {
		document_type: null,
		property: {},
		lease: { other_fees: [] },
		payments: [],
	};
	for (const key of MERGE_RENTAL_PROPERTY_FIELDS) merged.property[key] = null;
	for (const key of MERGE_RENTAL_LEASE_FIELDS) merged.lease[key] = null;

	for (const r of batchResults) {
		if (!r) continue;
		if (r.document_type && !merged.document_type) merged.document_type = r.document_type;
		const p = r.property || {};
		for (const key of MERGE_RENTAL_PROPERTY_FIELDS) {
			if (merged.property[key] == null && p[key] != null && p[key] !== '') {
				merged.property[key] = p[key];
			}
		}
		const l = r.lease || {};
		for (const key of MERGE_RENTAL_LEASE_FIELDS) {
			if (merged.lease[key] == null && l[key] != null && l[key] !== '') {
				merged.lease[key] = l[key];
			}
		}
		if (Array.isArray(l.other_fees)) {
			for (const f of l.other_fees) {
				if (f && f.name && !merged.lease.other_fees.some((x) => x.name === f.name)) {
					merged.lease.other_fees.push({ name: f.name, amount: f.amount ?? null, currency: f.currency || null });
				}
			}
		}
		if (Array.isArray(r.payments)) merged.payments.push(...r.payments);
	}

	// De-duplicate payments by (payment_number + amount + due_date + cheque_number),
	// then renumber sequentially so the merged list is one coherent schedule.
	const seen = new Set();
	const unique = [];
	for (const row of merged.payments) {
		const key = `${row.payment_number ?? ''}|${row.amount ?? ''}|${row.due_date ?? ''}|${row.cheque_number ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(row);
	}
	merged.payments = unique.map((row, i) => ({
		payment_number: i + 1,
		payment_type: row.payment_type || '',
		amount: row.amount != null && row.amount !== '' ? Number(row.amount) : null,
		currency: row.currency || merged.lease.currency || null,
		due_date: row.due_date || null,
		cheque_number: row.cheque_number || null,
		bank_name: row.bank_name || null,
		payment_status: row.payment_status === 'paid' ? 'paid' : 'unpaid',
		notes: row.notes || '',
	}));
	return merged;
}

/** Normalize a rental date field (string or null) to ISO YYYY-MM-DD or null. */
function normalizeRentalDate(value) {
	if (!value) return null;
	const iso = parseFlexibleDate(value);
	return iso || null;
}

/* ---------- Polling endpoints for the extract job queue ---------- */

router.get('/extract-jobs/active', async (req, res) => {
	try {
		const existing = await pocketbaseClient
			.collection('property_extract_jobs')
			.getFirstListItem(
				`owner = "${req.pocketbaseUserId}" && (status = "pending" || status = "processing")`,
				{ sort: '-created' },
			);
		return res.json({
			jobId: existing.id,
			status: existing.status,
			stage: existing.stage || '',
			progress: existing.progress || 0,
			batch_current: existing.batch_current || 0,
			batch_total: existing.batch_total || 0,
			batch_labels: existing.batch_labels || [],
		});
	} catch {
		return res.json({ jobId: null });
	}
});

router.get('/extract-jobs/:id', async (req, res) => {
	const { id } = req.params;
	if (!id) return res.status(422).json({ error: 'id required' });

	let job;
	try {
		job = await pocketbaseClient.collection('property_extract_jobs').getOne(id);
	} catch {
		return res.status(404).json({ error: 'PLAN_EXTRACT_JOB_NOT_FOUND' });
	}
	if (String(job.owner || '') !== req.pocketbaseUserId) {
		return res.status(403).json({ error: 'PLAN_EXTRACT_JOB_FORBIDDEN' });
	}

	// Stale detection: a "processing" job with no update for too long was
	// likely killed (process restart). Mark it failed so the user can retry.
	if (job.status === 'pending' || job.status === 'processing') {
		try {
			const updatedMs = new Date(job.updated).getTime();
			if (Number.isFinite(updatedMs) && Date.now() - updatedMs > PLAN_JOB_STALE_MS) {
				const msgs = planErrorMessages('PLAN_AI_TIMEOUT');
				await pocketbaseClient.collection('property_extract_jobs').update(id, {
					status: 'failed',
					error_code: 'PLAN_AI_TIMEOUT',
					error_message_ar: msgs.ar,
					error_message_en: msgs.en,
					completed_at: new Date().toISOString(),
				});
				job.status = 'failed';
				job.error_code = 'PLAN_AI_TIMEOUT';
				job.error_message_ar = msgs.ar;
				job.error_message_en = msgs.en;
			}
		} catch {
			/* ignore stale-update failure */
		}
	}

	const result = job.result || {};
	return res.json({
		id: job.id,
		status: job.status,
		stage: job.stage || '',
		progress: job.progress || 0,
		batch_current: job.batch_current || 0,
		batch_total: job.batch_total || 0,
		batch_labels: job.batch_labels || [],
		error_code: job.error_code || '',
		error_message_ar: job.error_message_ar || '',
		error_message_en: job.error_message_en || '',
		completed_at: job.completed_at || '',
		result,
	});
});

/* ================================================================== */
/* Stage 6+7: Programmatic validation + selective OpenAI review        */
/* ================================================================== */
/*
 * After Gemini extracts and the per-batch results are merged, the pipeline
 * runs a deterministic VALIDATION pass (arithmetic, date order, duplicates,
 * sanity ranges) and then an OPTIONAL, SELECTIVE OpenAI review.
 *
 * OpenAI never re-reads the document. It receives ONLY:
 *   1. the merged Gemini extraction (JSON),
 *   2. the validation issues,
 *   3. the list of low-confidence fields.
 * It returns corrections ONLY where the provided data itself gives clear,
 * unambiguous evidence (internal consistency). It never guesses, never
 * invents values, and never touches a field that is not flagged. If
 * OPENAI_API_KEY is not configured, the review is skipped gracefully and the
 * extraction still proceeds to preview — validation issues are still
 * surfaced to the user.
 *
 * The OPENAI_API_KEY is read from process.env on the backend only and is
 * never sent to the browser, never printed in logs (callOpenAiOnce logs only
 * a keyConfigured boolean + bare endpoint), and never echoed in API
 * responses (error bodies are scrubbed of sk-... fragments).
 */

const ReviewSystemPrompt = `You are a real-estate data REVIEW engine. Another AI (Gemini) extracted data from a real-estate document (sale-purchase agreement, title deed, sales offer, or lease). You also receive PROGRAMMATIC VALIDATION ISSUES and a list of LOW-CONFIDENCE FIELDS.

You do NOT see the original document. Reason ONLY from the provided JSON data and the validation issues (internal consistency, arithmetic, date logic, duplicates).

YOUR JOB: review ONLY the flagged / suspicious fields and return corrections ONLY where the provided data itself gives clear, unambiguous evidence — e.g. installment percentages that do not sum to 100, a discounted price higher than the original, a contract end date not after the start, a duplicate payment row, or an arithmetic mismatch between sums and totals.

STRICT RULES:
- NEVER guess. NEVER invent values.
- If evidence is insufficient, set status = "uncertain", corrected_value = null, and needs_review = true so the human reviewer is asked to confirm that field.
- If you correct a field, set status = "corrected" and needs_review = false.
- If a flagged field is actually fine, set status = "keep" and needs_review = false.
- Do NOT change any field that is not flagged and has no internal contradiction.
- For dates, only correct obvious format / order errors derivable from the data itself.
- Never output or infer personal data (names, passport, phone, email, contract number).
- Keep values in the same type and units as the input.
- "path" uses dot notation, with numeric segments for array indices (e.g. "schedule.installments.2.amount", "payments.1.due_date").

Return ONLY one valid JSON object (no prose, no markdown fences):
{
  "overall_confidence": "high" | "medium" | "low",
  "fields": [
    { "path": "property.total_price", "status": "corrected" | "keep" | "uncertain", "original_value": <value>, "corrected_value": <value or null>, "needs_review": true | false, "confidence": "high" | "medium" | "low", "reason_en": "...", "reason_ar": "..." }
  ],
  "notes_en": "...",
  "notes_ar": "..."
}`;

/** Build the text-only user message sent to OpenAI (no files, no images). */
function buildReviewUserMessage({ geminiResult, issues, lowFields, isRental, ar }) {
	const payload = {
		mode: isRental ? 'rental' : 'purchase',
		gemini_extraction: geminiResult,
		validation_issues: issues,
		low_confidence_fields: lowFields,
	};
	return `${ar ? 'راجع الحقول المشكوك فيها فقط بناءً على البيانات وقواعد التحقق. لا تخمن أي قيمة.' : 'Review ONLY the suspicious fields based on the provided data and validation rules. Do not guess any value.'}\n\nJSON_DATA:\n${JSON.stringify(payload)}`;
}

/**
 * Deterministic validation of the merged extraction. Returns
 * { issues, lowConfidenceFields }. Each issue carries a severity
 * (high | medium | low), bilingual reason, and the offending value.
 * lowConfidenceFields is the set of field paths with high/medium severity
 * — these are the only fields OpenAI is asked to review.
 */
function validateExtraction(merged, isRental) {
	const issues = [];
	const low = new Set();
	const addIssue = (field, severity, reasonEn, reasonAr, value) => {
		issues.push({ field, severity, reason_en: reasonEn, reason_ar: reasonAr, value });
		if (severity === 'high' || severity === 'medium') low.add(field);
	};
	const num = (v) => {
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	};

	if (isRental) {
		const lease = merged.lease || {};
		const payments = Array.isArray(merged.payments) ? merged.payments : [];
		const prop = merged.property || {};

		const area = num(prop.property_area);
		if (area != null && area <= 0) addIssue('property.property_area', 'medium', 'Area value is not positive.', 'قيمة المساحة غير موجبة.', prop.property_area);

		const annual = num(lease.annual_rent);
		if (annual != null && annual <= 0) addIssue('lease.annual_rent', 'high', 'Annual rent is not positive.', 'الإيجار السنوي غير موجب.', lease.annual_rent);

		if (lease.contract_start_date && lease.contract_end_date) {
			const s = parseFlexibleDate(lease.contract_start_date);
			const e = parseFlexibleDate(lease.contract_end_date);
			if (s && e && new Date(s) >= new Date(e)) addIssue('lease.contract_end_date', 'high', 'Contract end date is not after the start date.', 'تاريخ نهاية العقد ليس بعد تاريخ البداية.', lease.contract_end_date);
		}

		const sumAmt = payments.reduce((a, r) => a + (num(r.amount) || 0), 0);
		const totalRent = num(lease.total_rent);
		if (sumAmt > 0 && totalRent != null && totalRent > 0) {
			const pct = Math.abs(sumAmt - totalRent) / totalRent;
			if (pct > 0.05) addIssue('lease.total_rent', 'medium', `Payments sum (${sumAmt}) differs from total rent (${totalRent}) by more than 5%.`, `مجموع الدفعات (${sumAmt}) يختلف عن الإيجار الإجمالي (${totalRent}) بأكثر من 5٪.`, totalRent);
		}

		const seen = new Set();
		payments.forEach((r, i) => {
			const key = `${r.amount}|${r.due_date}|${r.cheque_number}`;
			if (seen.has(key)) addIssue(`payments.${i}`, 'medium', 'Duplicate payment row detected.', 'تم اكتشاف صف دفع مكرر.', r);
			else seen.add(key);
			if (r.due_date && !parseFlexibleDate(r.due_date)) addIssue(`payments.${i}.due_date`, 'low', 'Unparseable due date.', 'تاريخ استحقاق غير مفهوم.', r.due_date);
		});
	} else {
		const prop = merged.property || {};
		const fees = Array.isArray(merged.fees) ? merged.fees : [];
		const inst = Array.isArray(merged.schedule?.installments) ? merged.schedule.installments : [];

		const total = num(prop.total_price);
		if (total != null && total <= 0) addIssue('property.total_price', 'high', 'Total price is not positive.', 'السعر الإجمالي غير موجب.', prop.total_price);

		const area = num(prop.area_value);
		if (area != null && area <= 0) addIssue('property.area_value', 'medium', 'Area value is not positive.', 'قيمة المساحة غير موجبة.', prop.area_value);

		const orig = num(prop.original_price);
		const disc = num(prop.discounted_price);
		if (orig != null && orig > 0 && disc != null) {
			if (disc > orig) addIssue('property.discounted_price', 'high', 'Discounted price is higher than the original price.', 'السعر بعد الخصم أعلى من السعر الأصلي.', prop.discounted_price);
			const statedPct = num(prop.discount_percentage);
			if (statedPct != null) {
				const actualPct = ((orig - disc) / orig) * 100;
				if (Math.abs(statedPct - actualPct) > 1) addIssue('property.discount_percentage', 'medium', `Discount percentage (${statedPct}) does not match (original - discounted) / original (${actualPct.toFixed(2)}).`, `نسبة الخصم (${statedPct}) لا تطابق المحسوب (${actualPct.toFixed(2)}).`, prop.discount_percentage);
			}
		}

		const pcts = inst.map((r) => num(r.percentage)).filter((n) => n != null && n > 0);
		if (pcts.length > 0) {
			const sum = pcts.reduce((a, b) => a + b, 0);
			if (Math.abs(sum - 100) > 2) addIssue('schedule.installments', 'medium', `Installment percentages sum to ${sum}% (expected ~100%).`, `مجموع نسب الأقساط ${sum}٪ (المتوقع ~100٪).`, sum);
		}

		const amts = inst.map((r) => num(r.amount)).filter((n) => n != null && n > 0);
		if (amts.length > 0 && total != null && total > 0) {
			const sum = amts.reduce((a, b) => a + b, 0);
			const pct = Math.abs(sum - total) / total;
			if (pct > 0.05) addIssue('schedule.installments', 'medium', `Installment amounts sum (${sum}) differs from total price (${total}) by more than 5%.`, `مجموع مبالغ الأقساط (${sum}) يختلف عن السعر الإجمالي (${total}) بأكثر من 5٪.`, sum);
		}

		fees.forEach((f, i) => {
			const a = num(f.amount);
			if (a != null && a < 0) addIssue(`fees.${i}.amount`, 'low', 'Negative fee amount.', 'رسوم سالبة.', f.amount);
		});

		if (prop.expected_delivery_date && !parseFlexibleDate(prop.expected_delivery_date)) addIssue('property.expected_delivery_date', 'low', 'Unparseable delivery date.', 'تاريخ تسليم غير مفهوم.', prop.expected_delivery_date);
	}

	return { issues, lowConfidenceFields: Array.from(low) };
}

/** Parse a numeric array index from a dot-path segment, or null. */
function matchIndex(seg) {
	return /^\d+$/.test(String(seg)) ? Number(seg) : null;
}

/** Read a value at a dotted path (e.g. "schedule.installments.2.amount"). */
function getByPath(obj, dottedPath) {
	const parts = String(dottedPath || '').split('.').filter(Boolean);
	let cur = obj;
	for (const p of parts) {
		const idx = matchIndex(p);
		if (idx != null) cur = Array.isArray(cur) ? cur[idx] : undefined;
		else cur = cur && typeof cur === 'object' ? cur[p] : undefined;
		if (cur == null) return undefined;
	}
	return cur;
}

/** Set a value at a dotted path. Returns true if an existing field was overwritten. */
function setByPath(obj, dottedPath, value) {
	const parts = String(dottedPath || '').split('.').filter(Boolean);
	if (!parts.length) return false;
	let cur = obj;
	for (let i = 0; i < parts.length - 1; i += 1) {
		const p = parts[i];
		const idx = matchIndex(p);
		if (idx != null) cur = Array.isArray(cur) ? cur[idx] : null;
		else cur = cur && typeof cur === 'object' ? cur[p] : null;
		if (cur == null) return false;
	}
	const last = parts[parts.length - 1];
	const idx = matchIndex(last);
	if (idx != null) {
		if (Array.isArray(cur) && cur[idx] != null) { cur[idx] = value; return true; }
		return false;
	}
	if (cur && typeof cur === 'object' && last in cur) { cur[last] = value; return true; }
	return false;
}

/** Apply only the "corrected" fields onto the merged extraction (in place). */
function applyReviewCorrections(merged, review) {
	const fields = Array.isArray(review?.fields) ? review.fields : [];
	const applied = [];
	for (const f of fields) {
		if (f.status !== 'corrected') continue;
		if (f.corrected_value == null || f.corrected_value === '') continue;
		const original = getByPath(merged, f.path);
		const ok = setByPath(merged, f.path, f.corrected_value);
		if (ok) applied.push({
			path: f.path,
			original_value: original,
			corrected_value: f.corrected_value,
			confidence: f.confidence || 'medium',
			reason_en: f.reason_en || '',
			reason_ar: f.reason_ar || '',
		});
	}
	return applied;
}

/**
 * Call OpenAI (text-only — NO files, NO images) to review the flagged fields.
 * Returns { ok, skipped, review, reason }. skipped=true means the review did
 * not run (key missing, nothing flagged, or non-fatal failure) — the caller
 * proceeds to preview with validation issues still surfaced. The OPENAI key
 * is read from process.env only and never returned.
 */
async function runOpenAiReview({ geminiResult, validation, isRental, jobId, ar }) {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey || !isIntegrationConfigured('OPENAI_API_KEY')) {
		return { ok: false, skipped: true, reason: 'OPENAI_API_KEY not configured' };
	}
	const issues = validation?.issues || [];
	const lowFields = validation?.lowConfidenceFields || [];
	if (issues.length === 0 && lowFields.length === 0) {
		return {
			ok: true,
			skipped: true,
			reason: 'no flagged fields',
			review: {
				overall_confidence: 'high',
				fields: [],
				notes_en: 'No issues flagged; review not needed.',
				notes_ar: 'لا توجد مشكلات؛ لا حاجة للمراجعة.',
			},
		};
	}

	const userText = buildReviewUserMessage({ geminiResult, issues, lowFields, isRental, ar });
	const content = [{ type: 'text', text: userText }];

	let text = '';
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
		try {
			// eslint-disable-next-line no-await-in-loop
			text = await callOpenAiOnce({ content, signal: controller.signal, systemPrompt: ReviewSystemPrompt, apiKey, label: 'openai review' });
			clearTimeout(timer);
			break;
		} catch (e) {
			clearTimeout(timer);
			const code = classifyPlanAiError(e);
			logger.error('openai review: attempt failed', { jobId, attempt, code, message: String(e?.message || e).slice(0, 160) });
			const retryable = code === 'PLAN_AI_TIMEOUT' || code === 'PLAN_AI_NETWORK'
				|| (code === 'PLAN_AI_PROXY' && /502|503|504|429/.test(e?.proxyStatus || ''));
			if (attempt === 2 || !retryable) {
				return { ok: false, skipped: true, reason: `OpenAI review unavailable (${code})` };
			}
		}
	}
	if (!text || !text.trim()) {
		return { ok: false, skipped: true, reason: 'OpenAI review returned empty content' };
	}
	const parsed = extractJsonFromText(text);
	if (!parsed) {
		logger.error('openai review: JSON parse failed', { jobId, preview: String(text).slice(0, 300) });
		return { ok: false, skipped: true, reason: 'OpenAI review returned non-JSON' };
	}
	return { ok: true, skipped: false, review: parsed };
}

/**
 * Run validation + selective OpenAI review on the merged extraction, apply
 * any corrections in place, and return the review block to attach to the job
 * result. Non-fatal: a skipped/failed review still returns a block (with
 * validation issues) so the preview can surface them.
 */
async function validateAndReview(merged, isRental, jobId, ar, updateJob) {
	try {
		await updateJob({
			stage: ar ? 'مراجعة وتدقيق البيانات…' : 'Validating & reviewing…',
			progress: 90,
		});
	} catch {
		/* ignore progress update failure */
	}
	const validation = validateExtraction(merged, isRental);
	const reviewResult = await runOpenAiReview({ geminiResult: merged, validation, isRental, jobId, ar });
	const skipped = !reviewResult.ok || reviewResult.skipped;
	const review = reviewResult.review || null;
	let applied = [];
	if (!skipped && review) {
		applied = applyReviewCorrections(merged, review);
	}
	// Collect the fields OpenAI flagged as uncertain (needs_review=true) so the
	// preview UI can prompt the human reviewer to confirm them. These are NOT
	// auto-corrected — only surfaced.
	const allFields = Array.isArray(review?.fields) ? review.fields : [];
	const needsReviewFields = allFields.filter(
		(f) => f && (f.needs_review === true || f.status === 'uncertain'),
	);
	return {
		performed: !skipped,
		skipped: !!skipped,
		skip_reason: skipped ? (reviewResult.reason || '') : '',
		overall_confidence: review?.overall_confidence || (skipped ? 'unknown' : 'high'),
		applied,
		fields: allFields,
		needs_review_fields: needsReviewFields,
		notes_en: review?.notes_en || '',
		notes_ar: review?.notes_ar || '',
		validation_issues: validation.issues || [],
	};
}

/* ---------- Background multi-batch extraction runner ---------- */

async function runExtractJob(jobId, files, parsedMessage, lang, purchaseType = '') {
	const ar = lang === 'ar';
	const isRental = purchaseType === 'rented';
	const updateJob = async (patch) => {
		try {
			await pocketbaseClient.collection('property_extract_jobs').update(jobId, patch);
		} catch (err) {
			logger.error('extract job: update failed', {
				jobId,
				error: String(err?.message || err).slice(0, 160),
			});
		}
	};
	const failJob = async (code, extra = {}) => {
		const msgs = planErrorMessages(code, extra);
		await updateJob({
			status: 'failed',
			error_code: code,
			error_message_ar: msgs.ar,
			error_message_en: msgs.en,
			completed_at: new Date().toISOString(),
		});
	};

	try {
		await updateJob({
			status: 'processing',
			stage: ar ? 'تجهيز الملفات…' : 'Preparing files…',
			progress: 5,
			batch_current: 0,
		});

		// ---- Prepare every uploaded file as a Claude content block ----
		const contentItems = [];
		const pageErrors = [];
		let unsupportedCount = 0;
		let tooLargeCount = 0;
		for (const file of files) {
			try {
				// eslint-disable-next-line no-await-in-loop
				const items = await prepareFileForClaude(file);
				items.forEach((it) => contentItems.push(it));
			} catch (err) {
				if (err?.code === 'PLAN_UNSUPPORTED_TYPE') unsupportedCount += 1;
				if (err?.code === 'PLAN_AI_TOO_LARGE') tooLargeCount += 1;
				pageErrors.push(`${file.originalname || 'file'}: ${String(err?.message || err).slice(0, 160)}`);
			}
		}
		if (contentItems.length === 0) {
			const code = tooLargeCount > 0
				? 'PLAN_AI_TOO_LARGE'
				: unsupportedCount === files.length ? 'PLAN_UNSUPPORTED_TYPE' : 'PLAN_PARSE_FAILED';
			await failJob(code, { detail: pageErrors.join(' | ').slice(0, 240) });
			return;
		}

		// ---- Group into ≤100-page request batches ----
		const batches = groupContentIntoRequestBatches(contentItems);
		const batchLabels = buildBatchLabels(batches, ar);
		await updateJob({
			batch_total: batches.length,
			batch_labels: batchLabels,
			stage: batchLabels[0] || (ar ? 'بدء المعالجة' : 'Starting'),
			progress: 10,
			batch_current: 1,
		});

		const basePromptText = (parsedMessage || [])
			.filter((b) => b && (b.type === ContentBlockType.Text || b.type === 'text'))
			.map((b) => b.text)
			.join('\n');

		// ---- Send each batch as a SEPARATE Claude request ----
		// `runModelExtraction` already retries a single batch twice internally on
		// a transient error (timeout/network/502/503/504/429) before it ever
		// reports failure here — see its own retry loop. So a batch reaching
		// `!extraction.ok` below has already exhausted that retry.
		//
		// If that happens on the FIRST batch, there is nothing usable yet and
		// the job fails as before. If it happens on a LATER batch after earlier
		// batches already succeeded, the previously-read pages are not
		// discarded: `partialInfo` is recorded and the loop stops early, and the
		// merge/save code below (unchanged otherwise) completes the job with
		// whatever pages WERE read, flagged `partial: true` so the UI can warn
		// the user exactly which page range could not be read instead of losing
		// everything already extracted.
		const batchResults = [];
		let partialInfo = null;
		for (let i = 0; i < batches.length; i += 1) {
			const batch = batches[i];
			const label = batchLabels[i] || `batch ${i + 1}/${batches.length}`;
			await updateJob({
				stage: label,
				batch_current: i + 1,
				progress: 10 + Math.round((i / batches.length) * 80),
			});

			// Per-batch context note: tell Claude this is one page range of a
			// single multi-page document, so it returns null for fields not in
			// these pages and only the rows visible here. The note + system prompt
			// differ for the rental/lease path (للإيجار) vs the purchase path.
			const batchNote = isRental
				? (ar
					? 'هذه الدفعة هي جزء (نطاق صفحات) من مستند إيجار واحد متعدد الصفحات (عقد إيجار + ملحقات + شيكات + إيصالات). استخرج الحقول المسموحة الموجودة في هذه الصفحات فقط؛ استخدم null لأي حقل غير موجود. لا تختلق أي بيانات. بالنسبة لجدول الدفعات/الشيكات، استخرج فقط الصفوف الظاهرة في هذه الدفعة. حالة الدفع paid فقط عند وجود دليل صريح، وإلا unpaid.'
					: 'This batch is a portion (page range) of a single multi-page LEASE document (lease contract + annex + cheques + receipts). Extract ONLY the allowed fields that appear in these pages; use null for any field not present. Do NOT invent any data. For the payment/cheque schedule, extract only the rows visible in this batch. payment_status is "paid" only with explicit evidence, otherwise "unpaid".')
				: (ar
					? 'هذه الدفعة هي جزء (نطاق صفحات) من مستند عقاري واحد متعدد الصفحات. استخرج الحقول المسموحة الموجودة في هذه الصفحات فقط؛ استخدم null لأي حقل غير موجود فيها. لا تختلق أي بيانات. بالنسبة لجدول الأقساط، استخرج فقط الصفوف الظاهرة في هذه الدفعة.'
					: 'This batch is a portion (page range) of a single multi-page real-estate document. Extract ONLY the allowed fields that appear in these pages; use null for any field not present here. Do NOT invent any data. For the installment schedule, extract only the rows visible in this batch.');
			const batchPrompt = `${batchNote}\n\n${basePromptText}`;

			// Gemini is the PRIMARY document reader for Estate AI. If
			// GEMINI_API_KEY is not configured, the reader falls back to Anthropic
			// Claude (which supports PDFs + images) — NEVER to OpenAI. OpenAI is
			// reserved for the final JSON REVIEW stage (text-only, no files), so
			// excludeProviders:['openai'] guarantees PDFs/images are never routed
			// to OpenAI and PLAN_OPENAI_PDF_ONLY can never block extraction.
			// eslint-disable-next-line no-await-in-loop
			const extraction = await runModelExtraction({
				section: 'add_property',
				fallbackEnv: 'ANTHROPIC_API_KEY',
				contentItems: batch.items,
				promptText: batchPrompt,
				systemPrompt: isRental ? RentalExtractionSystemPrompt : PropertyExtractionSystemPrompt,
				label: `${isRental ? 'rental' : 'property'} extract batch ${i + 1}/${batches.length}`,
				extraLog: { jobId, batch: `${i + 1}/${batches.length}`, mode: isRental ? 'rental' : 'purchase' },
				forceProvider: 'gemini',
				forceEnvVar: 'GEMINI_API_KEY',
				excludeProviders: ['openai'],
			});
			if (!extraction.ok) {
				if (i > 0 && batchResults.length > 0) {
					partialInfo = {
						failed_batch_index: i + 1,
						batch_total: batches.length,
						failed_batch_label: label,
						reason_code: extraction.code,
					};
					break;
				}
				await failJob(extraction.code, { detail: extraction.detail });
				return;
			}
			// eslint-disable-next-line no-await-in-loop
			const raw = extractJsonFromText(extraction.text);
			if (!raw) {
				logger.error('property extract batch: JSON parse failed', {
					jobId,
					batch: i + 1,
					preview: String(extraction.text).slice(0, 300),
				});
				if (i > 0 && batchResults.length > 0) {
					partialInfo = {
						failed_batch_index: i + 1,
						batch_total: batches.length,
						failed_batch_label: label,
						reason_code: 'PLAN_AI_EMPTY',
					};
					break;
				}
				await failJob('PLAN_AI_EMPTY', { detail: `Batch ${i + 1} response was not valid JSON` });
				return;
			}
			batchResults.push(raw);
			await updateJob({ progress: 10 + Math.round(((i + 1) / batches.length) * 80) });
		}

		// ---- Merge all batch results into one extraction ----
		// Rental (للإيجار) uses a lease-shaped result; purchase uses the
		// property/fees/schedule shape. Both merge without fabricating fields.
		if (isRental) {
			const merged = mergeRentalBatchResults(batchResults);

			// ---- Programmatic validation + selective OpenAI review ----
			const reviewBlock = await validateAndReview(merged, true, jobId, ar, updateJob);

			const property = merged.property || {};
			const lease = merged.lease || {};
			lease.contract_start_date = normalizeRentalDate(lease.contract_start_date);
			lease.contract_end_date = normalizeRentalDate(lease.contract_end_date);
			const payments = (merged.payments || []).map((row) => ({
				...row,
				due_date: normalizeRentalDate(row.due_date),
			}));

			await updateJob({
				status: 'completed',
				stage: ar ? 'تم' : 'Done',
				progress: 100,
				completed_at: new Date().toISOString(),
				result: {
					mode: 'rental',
					document_type: merged.document_type || null,
					property,
					lease,
					payments,
					page_errors: pageErrors,
					batch_count: batches.length,
					review: reviewBlock,
					partial: !!partialInfo,
					partial_info: partialInfo,
				},
			});
			return;
		}

		const merged = mergeBatchResults(batchResults);

		// ---- Programmatic validation + selective OpenAI review ----
		const reviewBlock = await validateAndReview(merged, false, jobId, ar, updateJob);

		const property = merged.property || {};
		if (property.expected_delivery_date != null || property.delivery_date_relative) {
			const np = normalizeExtractionDateField(property, 'expected_delivery_date', 'delivery_date_relative');
			property.expected_delivery_date = np.expected_delivery_date;
			property.delivery_date_relative = np.delivery_date_relative;
		}
		const fees = Array.isArray(merged.fees)
			? merged.fees.map((f) => normalizeExtractionDateField(f, 'due_date', 'due_date_relative'))
			: [];
		const installments = Array.isArray(merged.schedule.installments)
			? merged.schedule.installments.map((r) => normalizeExtractionDateField(r, 'due_date', 'due_date_relative'))
			: [];

		await updateJob({
			status: 'completed',
			stage: ar ? 'تم' : 'Done',
			progress: 100,
			completed_at: new Date().toISOString(),
			result: {
				document_type: merged.document_type || null,
				property,
				fees,
				schedule: {
					found: merged.schedule.found && installments.length > 0,
					currency: merged.schedule.currency || null,
					installments,
				},
				start_points: merged.start_points || {},
				page_errors: pageErrors,
				batch_count: batches.length,
				review: reviewBlock,
				partial: !!partialInfo,
				partial_info: partialInfo,
			},
		});
	} catch (err) {
		logger.error('extract job: unexpected failure', {
			jobId,
			error: String(err?.message || err).slice(0, 240),
		});
		await failJob('PLAN_AI_PROXY', { detail: String(err?.message || err).slice(0, 160) });
	}
}

router.post(
	'/extract-property',
	integratedAiRateLimit,
	uploadFiles({
		maxCount: 200,
		maxSizeMB: 2048,
		fieldName: 'images',
		allowAny: true,
	}),
	async (req, res) => {
		// Multi-batch async extraction: this endpoint creates a durable job and
		// fires the (possibly multi-request) Claude processing in the
		// background, then returns { jobId } immediately so the gateway never
		// times out. The UI polls /extract-jobs/:id for per-batch progress and
		// the final merged result.
		const { message, lang, purchaseType } = req.body;
		if (!message) {
			return respondPlanError(res, 422, 'PLAN_MISSING_MESSAGE');
		}
		let parsedMessage;
		try {
			parsedMessage = JSON.parse(message);
		} catch {
			return respondPlanError(res, 422, 'PLAN_MISSING_MESSAGE', { detail: 'message JSON invalid' });
		}

		const totalFiles = req.files?.length || 0;
		if (totalFiles === 0) {
			return respondPlanError(res, 422, 'PLAN_NO_FILES');
		}

		// Pre-flight: reject only oversized images. PDFs are split into
		// ≤100-page batches and sent as separate Claude requests, so there is
		// no page limit on the user's side.
		const oversized = findOversizedFile(req.files || []);
		if (oversized) {
			return respondPlanError(res, 413, 'PLAN_AI_TOO_LARGE', {
				detail: `${oversized.name}: ${(oversized.bytes / 1024 / 1024).toFixed(1)}MB`,
			});
		}

		// Upfront provider check so an unconfigured section returns the calm
		// not-configured state instead of creating a job that just fails.
		const resolved = await resolveProviderForSection('add_property', 'ANTHROPIC_API_KEY');
		if (!resolved) {
			return respondNotConfigured(res, {
				integration: 'AI Provider',
				envKeys: 'ANTHROPIC_API_KEY',
			});
		}

		// ---- Duplicate prevention: one active extract job per owner ----
		try {
			const existing = await pocketbaseClient
				.collection('property_extract_jobs')
				.getFirstListItem(
					`owner = "${req.pocketbaseUserId}" && (status = "pending" || status = "processing")`,
					{ sort: '-created' },
				);
			if (existing) {
				return res.json({
					jobId: existing.id,
					status: existing.status,
					alreadyRunning: true,
				});
			}
		} catch {
			/* no active job — continue */
		}

		const fileHashes = (req.files || []).map((f) => (f.buffer ? sha256(f.buffer) : ''));

		let job;
		try {
			job = await pocketbaseClient.collection('property_extract_jobs').create({
				owner: req.pocketbaseUserId,
				status: 'pending',
				stage: 'upload',
				progress: 3,
				total_files: totalFiles,
				file_hashes: fileHashes,
				batch_total: 0,
				batch_current: 0,
				batch_labels: [],
				result: {},
			});
		} catch (err) {
			logger.error('extract job: create failed', {
				error: String(err?.message || err).slice(0, 200),
			});
			return respondPlanError(res, 500, 'PLAN_EXTRACT_JOB_CREATE_FAILED');
		}

		runExtractJob(job.id, req.files, parsedMessage, lang || 'ar', String(purchaseType || '')).catch((err) => {
			logger.error('extract job: background crashed', {
				jobId: job.id,
				error: String(err?.message || err).slice(0, 200),
			});
		});

		return res.json({ jobId: job.id, status: 'pending' });
	},
);

export default router;
