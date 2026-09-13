import { Router } from 'express';
import {
	ContentBlockType,
	stream,
	uploadImagesToPocketBase,
} from '../api/integrated-ai.js';
import { EstateAiSystemPrompt } from '../constants/prompts.js';
import { uploadFiles } from '../middleware/file-upload.js';
import { integratedAiRateLimit } from '../middleware/integrated-ai-rate-limit.js';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import logger from '../utils/logger.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';

const router = Router();

router.use(pocketbaseAuth);

/**
 * Retrieve ONLY the authenticated user's account data from PocketBase.
 *
 * The API-side PocketBase client authenticates as the superuser, which
 * bypasses collection access rules. So isolation is enforced HERE by
 * explicitly filtering every query on the authenticated user id — never by
 * trusting the AI prompt. A user cannot read another user's properties,
 * payments, documents, reminders or notifications through Estate AI even if
 * they type another person's name or a property id they don't own.
 *
 * @param {string} userId
 * @returns {Promise<object>} portfolio context blob
 */
async function buildUserContext(userId) {
	if (!userId) return { enabled: false, portfolio: null };

	// Super Admin control settings (public read).
	let settings = null;
	try {
		const rows = await pocketbaseClient
			.collection('estate_ai_settings')
			.getFullList({ sort: 'created' });
		settings = rows[0] || null;
	} catch {
		settings = null;
	}

	const enabled = settings ? settings.enabled !== false : true;
	const readPerms = (settings && settings.read_permissions) || {};
	const perms = {
		properties: readPerms.properties !== false,
		documents: readPerms.documents !== false,
		rentals: readPerms.rentals !== false,
		installments: readPerms.installments !== false,
		payments: readPerms.payments !== false,
		reminders: readPerms.reminders !== false,
	};

	// Properties owned by this user only.
	let properties = [];
	if (perms.properties) {
		try {
			properties = await pocketbaseClient.collection('properties').getFullList({
				filter: pocketbaseClient.filter('owner = {:userId}', { userId }),
				sort: '-created',
			});
		} catch {
			properties = [];
		}
	}

	const propIds = properties.map((p) => p.id);

	// Payments for the user's properties only (filter via property relation).
	let payments = [];
	if (perms.payments && propIds.length) {
		try {
			payments = await pocketbaseClient.collection('payments').getFullList({
				filter: propIds
					.map((id) => `property = "${id}"`)
					.join(' || '),
				sort: 'due_date',
			});
		} catch {
			payments = [];
		}
	}

	// Fetch the authenticated user's own record so we can read the identity
	// document fields stored on it (passport / residence). The API client
	// authenticates as the superuser, so we scope explicitly by id.
	let userRecord = null;
	try {
		userRecord = await pocketbaseClient
			.collection('users')
			.getOne(userId);
	} catch {
		userRecord = null;
	}

	// Custom documents the owner added manually. The relation field on
	// owner_documents is `owner` (NOT `user`) — filtering by `user` silently
	// returned zero rows, which is why Estate AI reported "no documents".
	let customDocs = [];
	if (perms.documents) {
		try {
			customDocs = await pocketbaseClient
				.collection('owner_documents')
				.getFullList({
					filter: pocketbaseClient.filter('owner = {:userId}', { userId }),
					sort: '-created',
				});
		} catch {
			customDocs = [];
		}
	}

	// Unified documents list — mirrors EXACTLY what the Documents Center
	// aggregates, so the Estate AI counter and answers always match what the
	// owner sees on the "My Documents" page. Three sources, no duplicates:
	//   1) owner identity document (passport / residence) on the users record
	//   2) property-linked documents (title deed, lease, tenant doc, extras)
	//   3) custom documents in owner_documents
	const documents = [];
	if (perms.documents) {
		const hasIdentity =
			userRecord &&
			(userRecord.document_file ||
				userRecord.document_file_url ||
				userRecord.passport_file_url ||
				userRecord.residence_file_url);
		if (hasIdentity) {
			const dtype = String(
				userRecord.document_type || 'passport',
			).toLowerCase();
			documents.push({
				id: 'user-identity',
				source: 'identity',
				name:
					dtype === 'residence'
						? 'Residence Permit'
						: 'Passport',
				type: dtype === 'residence' ? 'residence' : 'passport',
				category: 'my_documents',
				property: null,
				has_file: true,
			});
		}

		properties.forEach((p) => {
			if (p.title_deed_pdf || p.title_deed_pdf_url) {
				documents.push({
					id: `prop-${p.id}-title_deed_pdf`,
					source: 'property',
					name: 'Title Deed',
					type: 'title_deed',
					category:
						p.type === 'installment' ? 'installment' : 'ownership',
					property: p.id,
					building: p.building,
					unit_number: p.unit_number,
					has_file: true,
				});
			}
			if (
				p.type === 'rented' &&
				(p.lease_contract || p.lease_contract_url)
			) {
				documents.push({
					id: `prop-${p.id}-lease_contract`,
					source: 'property',
					name: 'Lease Contract',
					type: 'lease',
					category: 'rental',
					property: p.id,
					building: p.building,
					unit_number: p.unit_number,
					has_file: true,
				});
			}
			if (
				p.type === 'rented' &&
				(p.tenant_document || p.tenant_document_url)
			) {
				documents.push({
					id: `prop-${p.id}-tenant_document`,
					source: 'property',
					name: 'Tenant Document',
					type: 'tenant_doc',
					category: 'tenant',
					property: p.id,
					building: p.building,
					unit_number: p.unit_number,
					has_file: true,
				});
			}
			let extra = p.additional_documents_urls;
			if (typeof extra === 'string') {
				try {
					extra = JSON.parse(extra);
				} catch {
					extra = null;
				}
			}
			if (Array.isArray(extra)) {
				extra.forEach((e, i) => {
					if (e && (e.url || e.name)) {
						documents.push({
							id: `prop-${p.id}-extra-${i}`,
							source: 'property',
							name: e.name || 'Additional Document',
							type: 'additional',
							category:
								p.type === 'rented'
									? 'rental'
									: p.type === 'installment'
										? 'installment'
										: 'ownership',
							property: p.id,
							building: p.building,
							unit_number: p.unit_number,
							has_file: !!e.url,
						});
					}
				});
			}
		});

		customDocs.forEach((d) => {
			documents.push({
				id: d.id,
				source: 'custom',
				name: d.name,
				type: d.category === 'my_documents' ? 'custom' : 'contract',
				category: d.category,
				property: d.property || null,
				has_file: !!(d.file || d.file_url),
			});
		});
	}

	// Manual reminders (property_alerts) owned by this user only.
	let reminders = [];
	if (perms.reminders) {
		try {
			reminders = await pocketbaseClient
				.collection('property_alerts')
				.getFullList({
					filter: pocketbaseClient.filter('owner = {:userId}', { userId }),
					sort: 'due_date',
				});
		} catch {
			reminders = [];
		}
	}

	// Notifications for this user only.
	let notifications = [];
	try {
		notifications = await pocketbaseClient
			.collection('notifications')
			.getFullList({
				filter: pocketbaseClient.filter('user = {:userId}', { userId }),
				sort: '-created',
			});
	} catch {
		notifications = [];
	}

	// Compact, AI-friendly portfolio summary.
	const nowIso = new Date().toISOString();
	const approved = properties.filter((p) => p.status === 'approved');
	const byType = {
		cash: approved.filter((p) => p.type === 'cash'),
		installment: approved.filter((p) => p.type === 'installment'),
		rented: approved.filter((p) => p.type === 'rented'),
	};

	const upcomingPayments = payments
		.filter((p) => p.status !== 'paid' && p.due_date)
		.map((p) => ({
			id: p.id,
			property: p.property,
			kind: p.kind,
			label: p.label,
			amount: p.amount,
			due_date: p.due_date,
			status: p.status,
		}))
		.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

	const portfolio = {
		generated_at: nowIso,
		currency_hint: 'amounts are stored as raw numbers in the property currency',
		permissions: perms,
		totals: {
			properties: approved.length,
			pending: properties.filter((p) => p.status === 'pending').length,
			changes_requested: properties.filter(
				(p) => p.status === 'changes_requested',
			).length,
			ready: byType.cash.length,
			under_construction: byType.installment.length,
			rented: byType.rented.length,
			documents: documents.length,
			reminders: reminders.length,
			unread_notifications: notifications.filter((n) => !n.read).length,
		},
		properties: approved.map((p) => ({
			id: p.id,
			building: p.building,
			unit_number: p.unit_number,
			area: p.area,
			country: p.country,
			type: p.type,
			status: p.status,
			total_price: p.total_price,
			down_payment: p.down_payment,
			rent_amount: p.rent_amount,
			security_deposit: p.security_deposit,
			contract_start_date: p.contract_start_date,
			contract_end_date: p.contract_end_date,
			tenant_name: p.tenant_name,
			tenant_phone: p.tenant_phone,
			tenant_email: p.tenant_email,
			handover_status: p.handover_status,
			expected_handover_date: p.expected_handover_date,
			has_title_deed: !!p.title_deed_pdf,
			has_lease_contract: !!p.lease_contract,
			has_tenant_document: !!p.tenant_document,
		})),
		payments: upcomingPayments,
		documents: documents,
		reminders: reminders.map((r) => ({
			id: r.id,
			title: r.title,
			type: r.alert_type || r.type,
			due_date: r.due_date,
			status: r.status,
			notes: r.notes,
			property: r.property,
		})),
	};

	return { enabled, settings, portfolio };
}

/**
 * Build the full Estate AI system prompt: the role/rules text plus the live
 * account context scoped to the authenticated user + UI language.
 */
async function buildSystemPrompt(userId, uiLanguage = 'ar') {
	const { enabled, settings, portfolio } = await buildUserContext(userId);

	const writePerms = (settings && settings.write_permissions) || {};
	const featurePerms = (settings && settings.feature_permissions) || {};
	const lang = String(uiLanguage || 'ar').toLowerCase().slice(0, 8) || 'ar';

	const outOfScopeAr =
		'يمكنني مساعدتك فقط في المعلومات والعمليات المرتبطة بحسابك داخل Estate Follow. لتغيير بيانات الحساب الأساسية استخدم الملف الشخصي أو الأمان أو الإعدادات.';
	const outOfScopeEn =
		'I can only help with information and actions linked to your Estate Follow account. To change core account details, use Profile, Security, or Settings.';

	const contextBlock = `
=== LIVE ACCOUNT CONTEXT (source of truth — scoped to user ${userId || 'unknown'} only) ===
UI language code: ${lang}
Respond entirely in language "${lang}". Architecture supports any future site language code the same way.
Estate AI enabled: ${enabled}
Feature permissions: ${JSON.stringify(featurePerms)}
Write permissions: ${JSON.stringify(writePerms)}

PORTFOLIO SUMMARY:
${JSON.stringify(portfolio, null, 1)}
=== END ACCOUNT CONTEXT ===

RUNTIME RULES:
- Answer ONLY using the LIVE ACCOUNT CONTEXT. Real records only.
- Never invent numbers, dates, names, statuses or documents. Missing → say not recorded (AR: هذه المعلومة غير مسجلة في حسابك حاليًا. / EN: This information is not recorded in your account yet.).
- Never reference another user's data.
- Outside portfolio scope → reply: ${lang === 'en' ? outOfScopeEn : outOfScopeAr}
- Core account fields (name, email, password, login phone, nationality, identity docs, permissions, account type, verification) are FORBIDDEN. Redirect to Profile / Security / Settings.
- Reports: compute from portfolio (rented count, non-rented, under construction, upcoming installments, overdue payments, contracts ending soon, per-property rental reports). Only include existing fields.
- Ambiguous property match → list options; do not auto-pick.
- The "documents" list in PORTFOLIO SUMMARY is the COMPLETE set of the user's documents — it already merges three sources: the identity document on their profile (passport/residence, source "identity"), property-linked documents (title deed / lease / tenant doc / additional, source "property"), and custom documents they added (source "custom"). When asked "show my documents", "how many documents do I have", or to list them, use THIS list directly: state the exact count and name each document with its source and linked property (building/unit) when relevant. Never say "no documents" when the list is non-empty.
- Document request → open_document action with file_name (and file_url if present in context) or say not found.
- Edits → include old_value and new_value in action data; user must confirm.
- Visible reply: natural prose only. No ##, no ** markdown, no [[ACTION]] text in the human message. Machine action blocks only as specified in the system role.
- Cite sources briefly when stating facts.
`;

	return `${EstateAiSystemPrompt}\n${contextBlock}`;
}

// Portfolio summary endpoint (used by the UI for the quick portfolio card).
router.get('/context', async (req, res) => {
	const ctx = await buildUserContext(req.pocketbaseUserId);
	res.json({
		enabled: ctx.enabled,
		settings: ctx.settings,
		portfolio: ctx.portfolio,
	});
});

router.post(
	'/stream',
	integratedAiRateLimit,
	uploadFiles({
		allowedMimeTypes: [
			'image/jpeg',
			'image/png',
			'image/webp',
		],
		fieldName: 'images',
		maxSizeMB: 512,
	}),
	async (req, res) => {
		const { message, language } = req.body;

		if (!message) {
			throw new Error('message is required');
		}
		if (typeof message !== 'string') {
			return res.status(400).json({ error: 'message must be a string' });
		}

		const parsedMessage = JSON.parse(message);
		const uiLanguage =
			typeof language === 'string' && language.trim()
				? language.trim().slice(0, 8)
				: 'ar';

		if (req.files?.length > 0) {
			const imageUrls = await uploadImagesToPocketBase({ images: req.files });
			imageUrls.forEach((url) => {
				parsedMessage.push({ type: ContentBlockType.Image, image: url });
			});
		}

		const systemPrompt = await buildSystemPrompt(
			req.pocketbaseUserId,
			uiLanguage,
		);

		const sseStream = await stream({
			userId: req.pocketbaseUserId,
			systemPrompt,
			userMessage: parsedMessage,
		});

		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('X-Accel-Buffering', 'no');

		sseStream.pipe(res, { end: false });

		res.on('close', () => sseStream.destroy());
	},
);

/* ================================================================== */
/* Send a payment-reminder email to a tenant (via Resend)               */
/* ================================================================== */
/*
 * Estate AI proposes a `send_tenant_email` action; the user confirms in the
 * UI, which calls this endpoint. Security is enforced HERE, server-side, not
 * in the prompt:
 *   1. The property MUST be owned by the authenticated user (owner field
 *      equals req.pocketbaseUserId). A user can never email a tenant of a
 *      property they do not own.
 *   2. The recipient address MUST match the tenant_email stored on that
 *      property — the caller cannot redirect the email to an arbitrary
 *      address. The AI may only pre-fill from the live account context.
 *   3. The Resend API key (RESEND_API_KEY) is a server secret read from
 *      process.env; it never reaches the browser.
 *
 * The email is sent from notifications@estatefollow.com (the verified
 * notifications sender) via the Resend API.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const NOTIFICATIONS_FROM = 'notifications@estatefollow.com';
const BRAND_NAME = 'Estate Follow';

router.post('/send-tenant-email', async (req, res) => {
	const {
		property_id,
		to_email,
		to_name,
		subject,
		message,
		payment_label,
		due_date,
		amount,
	} = req.body || {};

	if (!property_id) {
		return res.status(422).json({ error: 'property_id is required' });
	}
	if (!to_email || !String(to_email).trim()) {
		return res.status(422).json({ error: 'to_email is required' });
	}

	// ---- Server-side ownership + tenant verification ----
	let property;
	try {
		property = await pocketbaseClient
			.collection('properties')
			.getOne(property_id);
	} catch {
		return res.status(404).json({ error: 'PROPERTY_NOT_FOUND' });
	}

	if (String(property.owner || '') !== req.pocketbaseUserId) {
		// Never reveal whether the property exists for another user.
		return res.status(404).json({ error: 'PROPERTY_NOT_FOUND' });
	}

	const storedTenantEmail = String(property.tenant_email || '').trim().toLowerCase();
	const requestedEmail = String(to_email).trim().toLowerCase();
	if (!storedTenantEmail || storedTenantEmail !== requestedEmail) {
		return res.status(403).json({
			error: 'TENANT_EMAIL_MISMATCH',
			message:
				'The recipient must match the tenant email recorded on this property.',
		});
	}

	// ---- Build the email body (bilingual, branded) ----
	const tenantName = String(to_name || property.tenant_name || '').trim();
	const propLabel = String(property.building || property.area || property.id || '');
	const subjectLine = String(subject || '').trim() || `تذكير بموعد دفع — ${BRAND_NAME}`;
	const noteText = String(message || '').trim();

	const amountStr =
		amount != null && amount !== '' ? String(amount) : '';
	const dueStr = String(due_date || '');

	const arBlock = `
<div dir="rtl" style="font-family:IBM Plex Sans Arabic,Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
  <h2 style="margin:0 0 12px;color:#16a34a">${BRAND_NAME}</h2>
  <p style="font-size:16px;line-height:1.7">عزيزي${tenantName ? ` ${tenantName}` : ''}،</p>
  <p style="font-size:16px;line-height:1.7">هذه رسالة تذكير من مالك العقار <b>${propLabel}</b> بخصوص موعد دفع مستحق${payment_label ? ` (${payment_label})` : ''}.${dueStr ? ` تاريخ الاستحقاق: <b dir="ltr">${dueStr}</b>.` : ''}${amountStr ? ` المبلغ: <b dir="ltr">${amountStr}</b>.` : ''}</p>
  ${noteText ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:15px;line-height:1.7">${noteText}</div>` : ''}
  <p style="font-size:13px;color:#64748b;margin-top:20px">تم إرسال هذه الرسالة عبر منصة ${BRAND_NAME}.</p>
</div>`;

	const enBlock = `
<div dir="ltr" style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a;border-top:1px solid #e2e8f0;margin-top:20px">
  <p style="font-size:15px;line-height:1.6">Dear${tenantName ? ` ${tenantName}` : ''},</p>
  <p style="font-size:15px;line-height:1.6">This is a payment reminder from the owner of <b>${propLabel}</b>${payment_label ? ` regarding <b>${payment_label}</b>` : ''}.${dueStr ? ` Due date: <b>${dueStr}</b>.` : ''}${amountStr ? ` Amount: <b>${amountStr}</b>.` : ''}</p>
  ${noteText ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:15px;line-height:1.6">${noteText}</div>` : ''}
  <p style="font-size:13px;color:#64748b;margin-top:20px">Sent via ${BRAND_NAME}.</p>
</div>`;

	const html = `${arBlock}${enBlock}`;
	const text = `${subjectLine}\n\nProperty: ${propLabel}${payment_label ? `\nPayment: ${payment_label}` : ''}${dueStr ? `\nDue: ${dueStr}` : ''}${amountStr ? `\nAmount: ${amountStr}` : ''}${noteText ? `\n\n${noteText}` : ''}`;

	// ---- Send via Resend ----
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey || String(apiKey).trim() === '') {
		return res.status(503).json({
			error: 'RESEND_NOT_CONFIGURED',
			message: 'Email delivery is not configured on the server.',
		});
	}

	const fromStr = `${BRAND_NAME} <${NOTIFICATIONS_FROM}>`;
	const toStr = tenantName ? `${tenantName} <${requestedEmail}>` : requestedEmail;

	let resendRes;
	try {
		resendRes = await fetch(RESEND_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from: fromStr,
				to: [toStr],
				subject: subjectLine,
				html,
				text,
			}),
		});
	} catch (err) {
		logger.error('estate-ai: tenant email send threw', {
			error: String(err?.message || err).slice(0, 200),
		});
		return res.status(502).json({
			error: 'EMAIL_SEND_FAILED',
			message: 'Could not reach the email service.',
		});
	}

	if (!resendRes.ok) {
		const body = await resendRes.text().catch(() => '');
		logger.error('estate-ai: Resend rejected the email', {
			status: resendRes.status,
			statusText: resendRes.statusText,
			body: String(body).slice(0, 300),
		});
		return res.status(502).json({
			error: 'EMAIL_SEND_FAILED',
			message: `Resend rejected the email: ${resendRes.status} ${resendRes.statusText}`,
		});
	}

	// ---- Audit log (best-effort) ----
	try {
		await pocketbaseClient.collection('estate_ai_audit_log').create({
			user: req.pocketbaseUserId,
			action: 'send_tenant_email',
			entity: 'properties',
			entity_id: property_id,
			property: propLabel,
			new_value: {
				to: requestedEmail,
				tenant_name: tenantName,
				subject: subjectLine,
				payment_label,
				due_date: dueStr,
				amount: amountStr,
			},
			source: 'Estate AI',
		});
	} catch {
		/* audit must never block */
	}

	return res.json({ ok: true, sent_to: requestedEmail });
});

export default router;
