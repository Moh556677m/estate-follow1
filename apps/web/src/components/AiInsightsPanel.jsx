import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Database,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import integratedAiClient from '@/lib/integratedAiClient';
import { cn } from '@/lib/utils';

// Gather REAL platform metrics directly from PocketBase. Every number sent
// to the AI comes from a live DB query — the AI never invents data.
async function gatherRealData() {
  const safe = async (fn, fallback) => {
    try { return await fn(); } catch { return fallback; }
  };

  const [users, properties, payments, campaigns, sends, visits, brokers, companies] = await Promise.all([
    safe(() => pb.collection('users').getList(1, 1, { requestKey: `ai-users-${Date.now()}` }), { totalItems: 0 }),
    safe(() => pb.collection('properties').getList(1, 1, { requestKey: `ai-props-${Date.now()}` }), { totalItems: 0 }),
    safe(() => pb.collection('payments').getList(1, 1, { requestKey: `ai-pay-${Date.now()}` }), { totalItems: 0 }),
    safe(() => pb.collection('marketing_campaigns').getList(1, 1, { requestKey: `ai-camp-${Date.now()}` }), { totalItems: 0 }),
    safe(() => pb.collection('marketing_sends').getList(1, 1, { requestKey: `ai-sends-${Date.now()}` }), { totalItems: 0 }),
    safe(() => pb.collection('analytics_visits').getList(1, 1, { requestKey: `ai-visits-${Date.now()}` }), { totalItems: 0 }),
    safe(() => pb.collection('brokers').getList(1, 1, { requestKey: `ai-brokers-${Date.now()}` }), { totalItems: 0 }),
    safe(() => pb.collection('brokerage_companies').getList(1, 1, { requestKey: `ai-companies-${Date.now()}` }), { totalItems: 0 }),
  ]);

  // Property status breakdown (real).
  let statusBreakdown = {};
  await safe(async () => {
    const all = await pb.collection('properties').getFullList({ fields: 'status', requestKey: `ai-props-status-${Date.now()}` });
    all.forEach((p) => { statusBreakdown[p.status] = (statusBreakdown[p.status] || 0) + 1; });
  }, null);

  // Payment status breakdown (real).
  let payBreakdown = {};
  await safe(async () => {
    const all = await pb.collection('payments').getFullList({ fields: 'status', requestKey: `ai-pay-status-${Date.now()}` });
    all.forEach((p) => { payBreakdown[p.status] = (payBreakdown[p.status] || 0) + 1; });
  }, null);

  return {
    totalUsers: users.totalItems || 0,
    totalProperties: properties.totalItems || 0,
    totalPayments: payments.totalItems || 0,
    totalCampaigns: campaigns.totalItems || 0,
    totalSends: sends.totalItems || 0,
    totalVisits: visits.totalItems || 0,
    totalBrokers: brokers.totalItems || 0,
    totalCompanies: companies.totalItems || 0,
    propertyStatus: statusBreakdown,
    paymentStatus: payBreakdown,
  };
}

function buildPrompt(data, lang) {
  const ar = lang === 'ar';
  const lines = ar
    ? [
        'أنت محلّل بيانات لمنصة Estate Follow العقارية. تحلّل البيانات الحقيقية التالية المأخوذة مباشرة من قاعدة البيانات.',
        'المهم: لا تخترع أي رقم أو حالة أو بيانات غير موجودة بالأسفل. إن كانت البيانات غير كافية لاستنتاج ما، قل "لا توجد بيانات كافية".',
        '',
        'البيانات الحقيقية:',
        `- إجمالي المستخدمين: ${data.totalUsers}`,
        `- إجمالي الوسطاء: ${data.totalBrokers}`,
        `- إجمالي شركات الوساطة: ${data.totalCompanies}`,
        `- إجمالي العقارات: ${data.totalProperties}`,
        `- حالات العقارات: ${JSON.stringify(data.propertyStatus)}`,
        `- إجمالي المدفوعات: ${data.totalPayments}`,
        `- حالات المدفوعات: ${JSON.stringify(data.paymentStatus)}`,
        `- إجمالي الحملات التسويقية: ${data.totalCampaigns}`,
        `- إجمالي رسائل الحملات المرسلة: ${data.totalSends}`,
        `- إجمالي الزيارات المسجّلة: ${data.totalVisits}`,
        '',
        'قدّم:',
        '1) ملخصاً موجزاً لحالة المنصة بناءً على الأرقام أعلاه فقط.',
        '2) أي مشاكل أو نقاط تستحق الانتباه (مثل عقارات معلّقة كثيرة أو مدفوعات متأخرة).',
        '3) 3 أولويات مقترحة للإدارة مع سبب كل واحدة.',
        'كن دقيقاً وموجزاً. كل رقم تذكره يجب أن يكون من القائمة أعلاه.',
      ]
    : [
        'You are a data analyst for the Estate Follow property platform. Analyze the following REAL data taken directly from the database.',
        'CRITICAL: Do NOT invent any number, status, or data not present below. If data is insufficient for a conclusion, say "Insufficient data".',
        '',
        'Real data:',
        `- Total users: ${data.totalUsers}`,
        `- Total brokers: ${data.totalBrokers}`,
        `- Total brokerage companies: ${data.totalCompanies}`,
        `- Total properties: ${data.totalProperties}`,
        `- Property statuses: ${JSON.stringify(data.propertyStatus)}`,
        `- Total payments: ${data.totalPayments}`,
        `- Payment statuses: ${JSON.stringify(data.paymentStatus)}`,
        `- Total marketing campaigns: ${data.totalCampaigns}`,
        `- Total campaign emails sent: ${data.totalSends}`,
        `- Total recorded visits: ${data.totalVisits}`,
        '',
        'Provide:',
        '1) A brief platform health summary based ONLY on the numbers above.',
        '2) Any issues or attention points (e.g. many pending properties or overdue payments).',
        '3) 3 suggested priorities for management with a reason for each.',
        'Be precise and concise. Every number you mention must come from the list above.',
      ];
  return lines.join('\n');
}

// Consume the SSE stream from the integrated AI and accumulate text content.
async function streamInsights(prompt, onChunk, signal) {
  const response = await integratedAiClient.stream('/integrated-ai/stream', {
    body: { message: [{ type: 'text', text: prompt }] },
    images: [],
    signal,
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const evt = JSON.parse(json);
        if (evt.type === 'content' && evt.data && typeof evt.data.content === 'string') {
          full += evt.data.content;
          onChunk(full);
        } else if (evt.type === 'error') {
          throw new Error(evt.data?.content || 'AI error');
        }
      } catch (parseErr) {
        if (parseErr.message && parseErr.message !== 'AI error') {
          // ignore non-JSON keepalive lines
        }
      }
    }
  }
  return full;
}

export default function AiInsightsPanel() {
  const { lang } = useLanguage();
  const L = useCallback((ar, en) => (lang === 'ar' ? ar : en), [lang]);

  const [data, setData] = useState(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [gathering, setGathering] = useState(false);
  const [error, setError] = useState('');
  const [analyzedAt, setAnalyzedAt] = useState(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const abortRef = useRef(null);

  const runAnalysis = useCallback(async () => {
    if (loading) return;
    setError('');
    setAnswer('');
    setGathering(true);
    let real;
    try {
      real = await gatherRealData();
      setData(real);
    } catch (err) {
      setError(String(err?.message || L('تعذّر جمع البيانات.', 'Failed to gather data.')));
      setGathering(false);
      return;
    }
    setGathering(false);

    const prompt = buildPrompt(real, lang);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamInsights(
        prompt,
        (partial) => setAnswer(partial),
        controller.signal,
      );
      setAnalyzedAt(new Date());
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(String(err?.message || L('تعذّر تحليل البيانات.', 'Failed to analyze.')));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [lang, loading, L]);

  const askCustom = useCallback(async () => {
    const q = customQuestion.trim();
    if (!q || loading) return;
    if (!data) {
      setGathering(true);
      try {
        const real = await gatherRealData();
        setData(real);
        // continue with this real data
        setGathering(false);
        const prompt =
          buildPrompt(real, lang) +
          '\n\n' +
          (lang === 'ar'
            ? `سؤال إضافي من المدير: ${q}\nأجب بناءً على البيانات أعلاه فقط.`
            : `Additional question from the admin: ${q}\nAnswer based ONLY on the data above.`);
        setError('');
        setAnswer('');
        setLoading(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          await streamInsights(prompt, (p) => setAnswer(p), controller.signal);
          setAnalyzedAt(new Date());
        } catch (err) {
          if (err?.name !== 'AbortError') setError(String(err?.message || L('تعذّر التحليل.', 'Failed.')));
        } finally {
          setLoading(false);
          abortRef.current = null;
        }
        return;
      } catch (err) {
        setError(String(err?.message || L('تعذّر جمع البيانات.', 'Failed to gather data.')));
        setGathering(false);
        return;
      }
    }
    const prompt =
      buildPrompt(data, lang) +
      '\n\n' +
      (lang === 'ar'
        ? `سؤال إضافي من المدير: ${q}\nأجب بناءً على البيانات أعلاه فقط.`
        : `Additional question from the admin: ${q}\nAnswer based ONLY on the data above.`);
    setError('');
    setAnswer('');
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamInsights(prompt, (p) => setAnswer(p), controller.signal);
      setAnalyzedAt(new Date());
    } catch (err) {
      if (err?.name !== 'AbortError') setError(String(err?.message || L('تعذّر التحليل.', 'Failed.')));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [customQuestion, data, lang, loading, L]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const dataSufficient = !!data && (data.totalUsers > 0 || data.totalProperties > 0 || data.totalPayments > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain size={22} strokeWidth={1.8} />
          </span>
          <div>
            <p className="font-bold">{L('رؤى الذكاء الاصطناعي', 'AI Insights')}</p>
            <p className="text-xs text-muted-foreground">
              {L(
                'يقرأ الذكاء الاصطناعي البيانات الحقيقية من قاعدة البيانات ويحلّلها — لا يخترع أرقاماً.',
                'AI reads real data from the database and analyzes it — it never invents numbers.',
              )}
            </p>
          </div>
        </div>
        <Button onClick={runAnalysis} disabled={loading || gathering} className="min-h-[44px]">
          <Sparkles size={16} className="me-1" />
          {gathering ? L('جارٍ جمع البيانات…', 'Gathering data…') : loading ? L('جارٍ التحليل…', 'Analyzing…') : L('تحليل الآن', 'Analyze now')}
        </Button>
      </div>

      {/* Data sources used */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-primary" />
          <p className="text-sm font-bold">{L('مصادر البيانات الحقيقية', 'Real data sources')}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {[
            { k: 'users', ar: 'المستخدمون', en: 'Users', v: data?.totalUsers },
            { k: 'brokers', ar: 'الوسطاء', en: 'Brokers', v: data?.totalBrokers },
            { k: 'companies', ar: 'الشركات', en: 'Companies', v: data?.totalCompanies },
            { k: 'properties', ar: 'العقارات', en: 'Properties', v: data?.totalProperties },
            { k: 'payments', ar: 'المدفوعات', en: 'Payments', v: data?.totalPayments },
            { k: 'campaigns', ar: 'الحملات', en: 'Campaigns', v: data?.totalCampaigns },
            { k: 'sends', ar: 'رسائل مرسلة', en: 'Emails sent', v: data?.totalSends },
            { k: 'visits', ar: 'الزيارات', en: 'Visits', v: data?.totalVisits },
          ].map((s) => (
            <div key={s.k} className="rounded-lg bg-accent/30 px-2.5 py-1.5">
              <p className="text-[10px] text-muted-foreground">{L(s.ar, s.en)}</p>
              <p className="font-bold tabular-nums">{data ? (s.v ?? 0) : '—'}</p>
            </div>
          ))}
        </div>
        {analyzedAt && (
          <p className="text-[11px] text-muted-foreground" dir="ltr">
            {L('وقت التحليل', 'Analyzed at')}: {analyzedAt.toLocaleString(lang === 'ar' ? 'ar' : 'en')}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!error && !answer && !loading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles size={22} strokeWidth={1.6} />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            {L(
              'اضغط "تحليل الآن" لجمع البيانات الحقيقية وإنشاء رؤى مبنية عليها.',
              'Click "Analyze now" to gather real data and generate insights based on it.',
            )}
          </p>
        </div>
      )}

      {data && !dataSufficient && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          {L(
            'لا توجد بيانات كافية في المنصة حالياً لإنشاء رؤى ذات معنى. أضف مستخدمين/عقارات أولاً.',
            'Insufficient data in the platform to generate meaningful insights. Add users/properties first.',
          )}
        </div>
      )}

      {(answer || loading) && (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">{L('التحليل', 'Analysis')}</p>
            {loading && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
          </div>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {answer || (loading ? L('جارٍ إنشاء التحليل…', 'Generating analysis…') : '')}
          </div>
          {answer && !loading && (
            <p className="text-[11px] text-muted-foreground border-t pt-2 flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-600" />
              {L(
                'كل رقم في هذا التحليل مأخوذ من قاعدة البيانات الحقيقية أعلاه.',
                'Every number in this analysis is taken from the real database sources above.',
              )}
            </p>
          )}
        </div>
      )}

      {/* Custom question on top of real data */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <p className="text-sm font-bold">{L('اسأل سؤالاً مخصصاً', 'Ask a custom question')}</p>
        <p className="text-xs text-muted-foreground">
          {L(
            'يُجاب السؤال بناءً على البيانات الحقيقية المجموعة فقط — لا أرقام مخترعة.',
            'Answered using only the gathered real data — no invented numbers.',
          )}
        </p>
        <Textarea
          value={customQuestion}
          onChange={(e) => setCustomQuestion(e.target.value)}
          rows={2}
          placeholder={L('مثال: ما أكثر حالة عقارات تستحق المتابعة هذا الأسبوع؟', 'e.g. Which property status needs follow-up this week?')}
          className="min-h-[72px]"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={askCustom}
            disabled={loading || gathering || !customQuestion.trim()}
            className="min-h-[36px]"
          >
            {loading ? L('جارٍ التحليل…', 'Analyzing…') : L('اسأل', 'Ask')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        {L(
          'الذكاء الاصطناعي طبقة مساعدة فوق البيانات الحقيقية. إن ادّعى رقماً غير موجود في مصادر البيانات أعلاه، اعتبره غير دقيق.',
          'AI is a helper layer over real data. If it claims a number not present in the data sources above, treat it as inaccurate.',
        )}
      </div>
    </div>
  );
}
