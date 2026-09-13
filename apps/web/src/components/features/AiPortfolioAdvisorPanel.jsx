import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getPortfolioAdvisorStatus, getPortfolioInsights } from '@/lib/featureToolsClient';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #17 — AI Portfolio Advisor. Consumes /portfolio-advisor/* (Express),
// which reuses the existing AI Provider Layer (aiProviders.js) rather than a
// second AI-calling code path. Every insight comes from the owner's OWN
// stored data — the server never invents figures (see the system prompt in
// portfolio-advisor.js).
export default function AiPortfolioAdvisorPanel() {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [status, setStatus] = useState(null);
  const [insights, setInsights] = useState(null);
  const [message, setMessage] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState('');

  const available = isAvailable('ai_portfolio_advisor');

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      setStatus(await getPortfolioAdvisorStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!gateLoading && available) loadStatus();
  }, [gateLoading, available, loadStatus]);

  const generate = async () => {
    setLoadingInsights(true);
    setError('');
    setMessage('');
    try {
      const res = await getPortfolioInsights();
      setInsights(res.insights || []);
      setMessage(res.message || '');
    } catch (err) {
      setError(err?.body?.message || err?.message || (isAr ? 'تعذر توليد التحليل' : 'Could not generate insights'));
    } finally {
      setLoadingInsights(false);
    }
  };

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'المستشار الذكي للمحفظة' : 'AI Portfolio Advisor'}
        reason={features.ai_portfolio_advisor?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Sparkles size={18} />{isAr ? 'المستشار الذكي للمحفظة' : 'AI Portfolio Advisor'}</h2>
        <p className="text-sm text-muted-foreground">{isAr ? 'رؤى مولّدة بالذكاء الاصطناعي عن بيانات محفظتك فقط.' : 'AI-generated insights over your own portfolio data only.'}</p>
      </div>

      {loadingStatus ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={18} /></div>
      ) : !status?.provider_configured ? (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          {isAr ? 'لم يتم تعيين مزوّد ذكاء اصطناعي نشط لهذا القسم بعد. يجب على المسؤول تعيين مزوّد من إعدادات AI Providers.' : 'No active AI provider is assigned to this section yet. An admin must assign one in AI Providers settings.'}
        </div>
      ) : !status.provider_supported ? (
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-4 text-sm text-amber-800">
          {isAr ? `نوع المزوّد المُعيَّن ("${status.provider_type}") غير مدعوم بعد لهذا القسم — Anthropic Claude فقط مدعوم حاليًا.` : `The assigned provider type ("${status.provider_type}") is not yet supported for this section — only Anthropic Claude is supported right now.`}
        </div>
      ) : (
        <Button onClick={generate} disabled={loadingInsights} className="gap-2 min-h-[40px]">
          {loadingInsights ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          {isAr ? 'توليد رؤى جديدة' : 'Generate insights'}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      {insights && insights.length > 0 && (
        <div className="space-y-2.5">
          {insights.map((ins, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 text-sm flex gap-3">
              <Sparkles size={16} className="shrink-0 text-primary mt-0.5" />
              <p>{ins}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
