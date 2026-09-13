// One-shot AI document extractor built on the Integrated AI stream client.
// Sends extracted PDF text (and optional images) with a strict JSON-extraction
// prompt and parses the streamed assistant text into a JS object.
import { useCallback, useRef, useState } from 'react';
import { integratedAiClient } from '@/lib/safeIntegratedAiClient';
import {
  cacheKey,
  fileIdentity,
  getAiCache,
  setAiCache,
  textIdentity,
} from '@/lib/aiExtractCache';

const BASE_INSTRUCTION =
  'You are a document-data extraction engine for a property management platform. ' +
  'Read the provided document text and/or images (Arabic and/or English) and extract the requested fields. ' +
  'Return ONLY a single valid JSON object — no prose, no markdown fences, no commentary. ' +
  'For every field you cannot confidently read from the document, set its value to null. ' +
  'Use ISO date strings (YYYY-MM-DD) for dates. Use numbers (no currency symbols) for money. ' +
  'Do not invent data that is not in the document. Never invent installment or payment rows.';

const PROMPTS = {
  property: `${BASE_INSTRUCTION}
Extract these fields from a property document (title deed, SPA, or property contract):
{
  "country": "country name (full, as written in the document)",
  "area": "city / area / community as written",
  "building": "project or building name",
  "unit_number": "unit / apartment number",
  "type": "cash | installment | rented (infer from the document; installment if a payment plan is mentioned, rented if a lease/tenant is mentioned, otherwise cash)",
  "owner_name": "owner / buyer name",
  "total_price": "purchase / property price as a number",
  "property_size": "size in sqm or sqft as a string",
  "rooms": "bedrooms / rooms if present else null",
  "purchase_date": "YYYY-MM-DD or null",
  "handover_status": "under_construction | handover_completed",
  "expected_handover_date": "YYYY-MM-DD or null",
  "developer": "developer or seller name",
  "document_number": "title deed / contract number if present else null",
  "service_charge_amount": "service charge amount as number or null",
  "service_charge_frequency": "yearly | one_time | null",
  "source_file": "filename if known else null"
}`,

  installment: `${BASE_INSTRUCTION}
You are the Smart Payment Plan Reader. Search the ENTIRE document/images/text (Arabic and English) for any payment schedule — not a fixed table location.
Look for synonyms: Payment Plan, Installment, Down Payment, Booking, Reservation, During Construction, On Handover, Post Handover, Balance, Due Date, Percentage, Amount, جدول الدفع, قسط, أقساط, دفعة أولى, حجز, أثناء الإنشاء, عند الاستلام, بعد الاستلام, نسبة, مبلغ, استحقاق.
CRITICAL RULES:
- Create one object in "installments" for EVERY payment row (if 80 rows exist, return 80 objects — never summarize or skip).
- NEVER invent installments, dates, percentages, or amounts. Missing → null. Uncertain → set "needs_review": true.
- NEVER adjust percentages to force 100%. Report plan_*_pct exactly as written.
- Dates may appear as 15/09/2027, 15-09-2027, Sep 15 2027, 15 September 2027 — normalize to YYYY-MM-DD when confident; else null and put original in due_date_raw.
- Relative dates ("30 days from booking", "3 months after booking") → put the phrase in due_date_relative and leave due_date null (do not invent a calendar date).
- If the plan is described compactly without a full table (e.g. "20% down, then 1% monthly for 40 months, then 40% on handover"), fill schedule_rule AND still expand installments array with all generated rows when amounts/% allow; if total price unknown leave amounts null but keep percentages/count.
- Multiple images: merge in order into one installments list (image1 rows 1–20 + image2 21–40 = 40 rows).
Return ONLY JSON:
{
  "total_price": number|null,
  "down_payment": number|null,
  "plan_total": number|null,
  "installments_count": number|null,
  "plan_type": "type1|type2|type3|type4|type5"|null,
  "plan_down_pct": number|null,
  "plan_construction_pct": number|null,
  "plan_handover_pct": number|null,
  "plan_post_pct": number|null,
  "post_handover_years": number|null,
  "post_handover_months": number|null,
  "custom_stages": [{"name": string, "percentage": number, "due_date": "YYYY-MM-DD"|null}],
  "handover_status": "under_construction"|"handover_completed"|null,
  "expected_handover_date": "YYYY-MM-DD"|null,
  "currency": string|null,
  "needs_start_date": true|false,
  "schedule_rule": {
    "down_pct": number|null,
    "monthly_count": number|null,
    "monthly_pct": number|null,
    "monthly_amount": number|null,
    "frequency": "monthly"|"quarterly"|"semi_annual"|"yearly"|null,
    "handover_pct": number|null,
    "post_pct": number|null,
    "start_date": "YYYY-MM-DD"|null
  }|null,
  "installments": [
    {
      "number": 1,
      "name": string|null,
      "amount": number|null,
      "percent": number|null,
      "percentage": number|null,
      "due_date": "YYYY-MM-DD"|null,
      "due_date_relative": string|null,
      "due_date_raw": string|null,
      "phase": "pre_handover"|"handover"|"post_handover",
      "payment_type": "down_payment"|"installment"|"construction"|"handover"|"post_handover"|"other",
      "status": "unpaid",
      "notes": string|null,
      "needs_review": true|false
    }
  ]
}
status is always "unpaid". Do not invent rows that are not in the document or clearly implied by an explicit compact rule.`,

  rental: `${BASE_INSTRUCTION}
Extract the lease / rental contract details. Create one entry in "payments" for EVERY rent payment/check listed (not a summary count only).
Return:
{
  "tenant_name": "tenant name",
  "tenant_phone": "tenant phone (international format if available, else as written)",
  "tenant_email": "tenant email or null",
  "building": "building / project name",
  "unit_number": "unit number",
  "rent_amount": "annual or total contract rent as a number",
  "security_deposit": "security deposit amount as a number or null",
  "contract_start": "YYYY-MM-DD or null",
  "contract_end": "YYYY-MM-DD or null",
  "contract_number": "contract number or null",
  "num_checks": "number of payments / checks as an integer",
  "payments": [
    { "name": "payment label e.g. Check 1", "amount": number, "due_date": "YYYY-MM-DD or null", "status": "unpaid" }
  ]
}
If a due date is missing, use null.`,

  tenant: `${BASE_INSTRUCTION}
Extract identity details from a tenant passport, Emirates ID, residence visa, or national ID. Return:
{
  "tenant_name": "full name of the document holder",
  "tenant_phone": "phone number if present, else null",
  "tenant_email": "email if present, else null",
  "passport_number": "passport or ID number if present, else null",
  "nationality": "nationality if present, else null",
  "date_of_birth": "YYYY-MM-DD or null"
}
Do not invent contact details that are not printed on the document.`,

  property_full: `${BASE_INSTRUCTION}
You are filling a property-add draft. Merge all facts from the document(s) into ONE JSON object with this shape:
{
  "property": {
    "country": string|null,
    "area": string|null,
    "building": string|null,
    "unit_number": string|null,
    "type": "cash"|"installment"|"rented"|null,
    "owner_name": string|null,
    "total_price": number|null,
    "property_size": string|null,
    "rooms": string|null,
    "purchase_date": "YYYY-MM-DD"|null,
    "handover_status": "under_construction"|"handover_completed"|null,
    "expected_handover_date": "YYYY-MM-DD"|null,
    "developer": string|null,
    "document_number": string|null,
    "service_charge_amount": number|null,
    "service_charge_frequency": "yearly"|"one_time"|null
  },
  "payment_plan": {
    "total_price": number|null,
    "down_payment": number|null,
    "plan_total": number|null,
    "installments_count": number|null
  },
  "installments": [
    {
      "number": number|null,
      "name": string|null,
      "amount": number|null,
      "percent": number|null,
      "due_date": "YYYY-MM-DD"|null,
      "payment_type": "down_payment"|"installment"|"construction"|"handover"|"post_handover"|"other"|null,
      "status": "unpaid",
      "notes": string|null
    }
  ],
  "rental": {
    "tenant_name": string|null,
    "tenant_phone": string|null,
    "tenant_email": string|null,
    "rent_amount": number|null,
    "security_deposit": number|null,
    "contract_start": "YYYY-MM-DD"|null,
    "contract_end": "YYYY-MM-DD"|null,
    "contract_number": string|null,
    "building": string|null,
    "unit_number": string|null
  },
  "rental_payments": [
    { "name": string|null, "amount": number|null, "due_date": "YYYY-MM-DD"|null, "status": "unpaid" }
  ],
  "documents": [
    { "kind": "title_deed"|"spa"|"payment_plan"|"lease"|"other", "label": string|null }
  ],
  "warnings": ["string notes about conflicts or totals mismatch if any"]
}
Rules:
- Only include installments that appear in the document. If 80 rows exist, return 80 objects.
- For cash title deeds without a payment schedule, leave installments as [].
- For leases, fill rental + rental_payments; leave installments empty unless a purchase plan is also present.
- Never invent missing values.`,
};

const SECTION_SCHEMAS = {
  property_info: {
    description:
      'Property identity only: country, city/area, tower/building name, unit number, size + unit, developer/company, purchase date.',
    json: `{
  "country": "country name as written (any language) or null",
  "area": "city / area / community or null",
  "building": "tower / building / project name (Tower|Building|برج|بناية) or null",
  "unit_number": "unit / apartment number or null",
  "property_size": "numeric size only as string/number or null",
  "property_size_unit": "sqm | sqft | null (m2/متر→sqm, ft2/قدم→sqft)",
  "developer": "developer / company / seller (Developer|Company|المطور|الشركة) or null",
  "purchase_date": "YYYY-MM-DD or null"
}`,
  },
  purchase_details: {
    description: 'Purchase price, purchase fees list, payment/financing method and durations only.',
    json: `{
  "total_price": number or null,
  "purchase_fees": [{"name": string, "amount": number, "type": "fixed"|"percent"}] or [],
  "payment_method": "full"|"company_installments"|"bank_installments"|null,
  "payment_duration_years": number or null,
  "payment_duration_months": number or null
}`,
  },
  payment_plan: {
    description:
      'Payment plan type, percentage breakdown, optional custom stages, and installment schedule only (not property identity). Infer plan_type from structure: type1=down+construction+handover (no post), type2=includes post-handover %, type3=construction-only style with down+construction+handover, type4=down+handover only, type5=named custom stages that do not match standard buckets. Never invent missing percentages or dates.',
    json: `{
  "total_price": number or null,
  "plan_type": "type1"|"type2"|"type3"|"type4"|"type5"|null,
  "plan_down_pct": number or null,
  "plan_construction_pct": number or null,
  "plan_handover_pct": number or null,
  "plan_post_pct": number or null,
  "post_handover_years": number or null,
  "post_handover_months": number or null,
  "custom_stages": [{"name": string, "percentage": number, "due_date": "YYYY-MM-DD or null"}] or [],
  "installments": [
    {
      "amount": number,
      "due_date": "YYYY-MM-DD or null",
      "phase": "pre_handover"|"handover"|"post_handover",
      "percentage": number or null,
      "note": string or null,
      "status": "unpaid"|"paid"|"overdue"
    }
  ]
}`,
  },
  handover: {
    description: 'Handover status and dates only.',
    json: `{
  "handover_status": "under_construction"|"handover_completed"|null,
  "expected_handover_date": "YYYY-MM-DD or null",
  "actual_handover_date": "YYYY-MM-DD or null"
}`,
  },
  service_fees: {
    description: 'Service / maintenance charges only.',
    json: `{
  "service_charge_amount": number or null,
  "service_charge_frequency": "none"|"one_time"|"yearly"|"semi_annual"|"quarterly"|"monthly"|"at_handover"|"custom"|null,
  "service_charge_value_type": "fixed"|"percent"|null,
  "service_charge_date": "YYYY-MM-DD or null",
  "service_charge_paid_status": "paid"|"unpaid"|"partial"|null,
  "service_charge_paid_in_installments": "yes"|"no"|null,
  "service_fee_rows": [{"amount": number, "due_date": "YYYY-MM-DD or null", "status": "paid"|"unpaid"}] or []
}`,
  },
  alerts: {
    description: 'Alert / reminder preferences only. Never touch property financial fields.',
    json: `{
  "alerts_enabled": true|false|null,
  "alerts_reminders": [30,14,7,3,1,0] subset or null,
  "alerts_custom_date": "YYYY-MM-DD or null"
}`,
  },
};

const SECTION_SAFETY =
  'SECURITY (mandatory): Work ONLY for the current signed-in owner and ONLY the open form section. ' +
  'Never request passport, national ID, passwords, card numbers, or unnecessary PII. ' +
  'Never reference or invent another user account, property, or document. ' +
  'Never guess missing facts — use null. If nothing found say so via empty fields. ' +
  'Do not propose changes outside this section unless the user clearly asks AND it is still within section schema (still refuse cross-section). ' +
  'Explanatory questions get mode=answer with a short plain reply and empty fields — never mutate data for Q&A.';

function buildSectionExtractPrompt(section, pdfText, language, currentValues) {
  const schema = SECTION_SCHEMAS[section];
  if (!schema) throw new Error(`Unknown section: ${section}`);
  return `${BASE_INSTRUCTION}
${SECTION_SAFETY}
You extract data for ONE form section only: "${section}".
Section scope: ${schema.description}
UI language hint: ${language || 'ar'}.
Return ONLY valid JSON of this shape:
{
  "mode": "extract",
  "fields": ${schema.json},
  "answer": null
}
If the user message is a pure help/definition question with no data to fill, return:
{ "mode": "answer", "fields": {}, "answer": "short helpful explanation in the user language" }
Map synonyms across Arabic/English/other (Tower/Building/برج/بناية, Developer/Company/المطور/الشركة, City/Area/مدينة/منطقة, m2/sqm/متر, ft2/sqft/قدم).
Money: always plain numbers — "300 ألف"=300000, "1.5m"=1500000, "مليون ونص"=1500000, no commas/symbols.
Only include keys that are confidently present. Omit or null unknown keys.
Do not invent installment rows. Do not fill other sections' fields.
Current section values (do not echo unless extracting replacements): ${JSON.stringify(currentValues || {})}

SOURCE TEXT / USER INPUT:
${pdfText || '(see attached images if any)'}`;
}

function buildSectionChatPrompt(section, userText, language, currentValues) {
  const schema = SECTION_SCHEMAS[section];
  if (!schema) throw new Error(`Unknown section: ${section}`);
  return `${BASE_INSTRUCTION}
${SECTION_SAFETY}
Section: "${section}" — ${schema.description}
UI language: ${language || 'ar'}. Reply language = user language.
Decide:
A) User asks what a field means / how the section works (no data to fill) → mode "answer", helpful 1-3 sentences, fields {}.
B) User provides ANY property facts / amounts / names to fill → mode "extract" with fields filled. Prefer extract whenever numbers or place names appear.
Money parsing (mandatory): convert natural language to plain numbers (no commas, no currency symbols):
- "300 ألف" / "300 الف" / "300k" → 300000
- "1.2 مليون" / "1.2m" → 1200000
- "مليون ونص" → 1500000
- "2 مليون و250 ألف" → 2250000
- "12 ألف" → 12000
- "450k" → 450000
Size units: متر/m2/sqm → property_size_unit "sqm"; قدم/sqft/ft → "sqft".
Infer country ONLY when city/context is unambiguous (e.g. القاهرة→Egypt, دبي→UAE); otherwise leave country null.
Return ONLY JSON:
{
  "mode": "extract"|"answer",
  "fields": ${schema.json},
  "answer": "string or null"
}
Current values: ${JSON.stringify(currentValues || {})}

USER:
${userText}`;
}

function stripFences(text) {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  return text.trim();
}

function extractJson(rawText) {
  const cleaned = stripFences(rawText);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('NO_JSON');
  }
  const jsonStr = cleaned.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

async function streamExtract(promptText, images = []) {
  const response = await integratedAiClient.stream('/integrated-ai/stream', {
    body: {
      message: [
        {
          text: promptText,
          type: 'text',
        },
      ],
    },
    images: Array.isArray(images) ? images : [],
  });

  if (!response?.body?.getReader) {
    throw new Error('NO_STREAM');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      if (!event || !String(event).trim()) continue;
      let eventData = '';
      const lines = String(event).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) eventData += line.slice(6);
      }
      if (!eventData) continue;
      try {
        const parsed = JSON.parse(eventData);
        if (parsed.type === 'error') throw new Error(parsed.data?.content || 'AI error');
        if (parsed.type === 'content') fullText += parsed.data?.content || '';
      } catch (parseErr) {
        if (parseErr?.message && parseErr.message !== 'NO_JSON') {
          if (/AI error|verify your email|NO_STREAM/i.test(parseErr.message) || parseErr.status) {
            throw parseErr;
          }
        }
      }
    }
  }

  return extractJson(fullText);
}

/**
 * Hook for one-shot AI document extraction.
 */
export function useAiExtractor() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState(null);
  const inflightRef = useRef(0);

  const extract = useCallback(async (type, pdfText, images = []) => {
    if (!PROMPTS[type]) throw new Error(`Unknown extraction type: ${type}`);
    const imgIds = (Array.isArray(images) ? images : [])
      .map((f) => fileIdentity(f))
      .join('+');
    const key = cacheKey(['extract', type, textIdentity(pdfText), imgIds]);
    const hit = getAiCache(key);
    if (hit) return hit;

    inflightRef.current += 1;
    setIsExtracting(true);
    setError(null);
    try {
      const prompt = `${PROMPTS[type]}\n\nDOCUMENT TEXT:\n${pdfText || '(see attached images if any)'}`;
      // Images already held as File objects — stream once, never re-read disk.
      const result = await streamExtract(prompt, images);
      setAiCache(key, result);
      return result;
    } catch (err) {
      const message = err?.message || 'Extraction failed';
      setError(message);
      throw err;
    } finally {
      inflightRef.current = Math.max(0, inflightRef.current - 1);
      if (inflightRef.current === 0) setIsExtracting(false);
    }
  }, []);

  const extractSection = useCallback(async (section, pdfText, images = [], opts = {}) => {
    if (!SECTION_SCHEMAS[section]) throw new Error(`Unknown section: ${section}`);
    const imgIds = (Array.isArray(images) ? images : [])
      .map((f) => fileIdentity(f))
      .join('+');
    const key = cacheKey([
      'section',
      section,
      opts.language || 'ar',
      textIdentity(pdfText),
      imgIds,
    ]);
    const hit = getAiCache(key);
    if (hit) return hit;

    inflightRef.current += 1;
    setIsExtracting(true);
    setError(null);
    try {
      const prompt = buildSectionExtractPrompt(
        section,
        pdfText,
        opts.language || 'ar',
        opts.currentValues,
      );
      const raw = await streamExtract(prompt, images);
      let result;
      if (raw && raw.fields && typeof raw.fields === 'object') result = raw;
      else if (raw && raw.mode === 'answer') result = raw;
      else result = { mode: 'extract', fields: raw || {}, answer: null };
      setAiCache(key, result);
      return result;
    } catch (err) {
      const message = err?.message || 'Extraction failed';
      setError(message);
      throw err;
    } finally {
      inflightRef.current = Math.max(0, inflightRef.current - 1);
      if (inflightRef.current === 0) setIsExtracting(false);
    }
  }, []);

  const sectionChat = useCallback(async (section, userText, opts = {}) => {
    if (!SECTION_SCHEMAS[section]) throw new Error(`Unknown section: ${section}`);
    inflightRef.current += 1;
    setIsExtracting(true);
    setError(null);
    try {
      const prompt = buildSectionChatPrompt(
        section,
        userText,
        opts.language || 'ar',
        opts.currentValues,
      );
      const raw = await streamExtract(prompt, []);
      if (raw && (raw.mode === 'answer' || raw.mode === 'extract')) {
        return {
          mode: raw.mode,
          fields: raw.fields && typeof raw.fields === 'object' ? raw.fields : {},
          answer: raw.answer || null,
        };
      }
      return { mode: 'extract', fields: raw || {}, answer: null };
    } catch (err) {
      const message = err?.message || 'Chat failed';
      setError(message);
      throw err;
    } finally {
      inflightRef.current = Math.max(0, inflightRef.current - 1);
      if (inflightRef.current === 0) setIsExtracting(false);
    }
  }, []);

  const chatAboutDraft = useCallback(async (userQuestion, context) => {
    setIsExtracting(true);
    setError(null);
    try {
      const prompt =
        'You are a property-document assistant for ONE property draft the owner is currently adding. ' +
        'Scope is ONLY the current user and this draft. Never reference or modify other properties. ' +
        'Answer in the same language as the user question. Be concise and practical. ' +
        'If asked to extract or list installments, use only data present in CONTEXT. Do not invent numbers.\n\n' +
        `CONTEXT (JSON):\n${JSON.stringify(context || {}, null, 2)}\n\n` +
        `USER QUESTION:\n${userQuestion}`;
      const response = await integratedAiClient.stream('/integrated-ai/stream', {
        body: {
          message: [{ text: prompt, type: 'text' }],
        },
        images: [],
      });
      if (!response?.body?.getReader) throw new Error('NO_STREAM');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
          if (!event || !String(event).trim()) continue;
          let eventData = '';
          for (const line of String(event).split('\n')) {
            if (line.startsWith('data: ')) eventData += line.slice(6);
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            if (parsed.type === 'error') throw new Error(parsed.data?.content || 'AI error');
            if (parsed.type === 'content') fullText += parsed.data?.content || '';
          } catch (parseErr) {
            if (/AI error|verify your email|NO_STREAM/i.test(parseErr?.message || '')) throw parseErr;
          }
        }
      }
      return fullText.trim();
    } catch (err) {
      setError(err?.message || 'Chat failed');
      throw err;
    } finally {
      setIsExtracting(false);
    }
  }, []);

  return {
    extract,
    extractSection,
    sectionChat,
    chatAboutDraft,
    isExtracting,
    error,
    setError,
  };
}

export default useAiExtractor;
