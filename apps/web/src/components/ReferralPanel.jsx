import React, { useCallback, useEffect, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { Copy, Share2, Gift, Link2, CheckCircle2, Clock, XCircle, Loader2, Trophy, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildReferralLink, getMyReferral, sendReferralInvite } from '@/lib/referralClient';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

const statusIcon = {
  approved: CheckCircle2,
  pending: Clock,
  rejected: XCircle,
  changes_requested: Clock,
};

const statusColor = {
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  changes_requested: 'bg-orange-100 text-orange-800 border-orange-200',
};

export default function ReferralPanel() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  const link = user ? buildReferralLink(user.id) : '';

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const r = await getMyReferral();
      setData(r);
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: referral count/status updates instantly when someone signs up via
  // the link, an offer changes, or a referred user's account state changes.
  useRealtimeRefresh(load, ['referrals', 'users', 'referral_offers']);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Estate Follow',
          text: lang === 'ar' ? 'انضم إلى إستيت فولو عبر رابطي' : 'Join Estate Follow via my link',
          url: link,
        });
      } catch {
        /* cancelled */
      }
    } else {
      copyLink();
    }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      notify.error(lang === 'ar' ? 'يرجى إدخال بريد إلكتروني صحيح' : 'Please enter a valid email');
      return;
    }
    setSendingInvite(true);
    try {
      await sendReferralInvite(email);
      notify.success(lang === 'ar'
        ? `تم إرسال دعوة إلى ${email}`
        : `Invite sent to ${email}`);
      setInviteEmail('');
    } catch (err) {
      notify.error(lang === 'ar' ? 'تعذر إرسال الدعوة' : 'Could not send invite', String(err?.message || err));
    } finally {
      setSendingInvite(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 size={20} className="animate-spin me-2" />
        {t('loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={load}>{t('retry')}</Button>
      </div>
    );
  }

  const approved = data?.approvedCount || 0;
  const slogans = Array.isArray(data?.slogans) ? data.slogans : [];
  const discountPercent = Number(data?.discountPercent || 0);

  return (
    <div className="space-y-6">
      {/* Admin-editable promotional slogans */}
      {slogans.length > 0 && (
        <div className="rounded-xl border bg-primary/5 p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles size={18} strokeWidth={1.8} />
            <h3 className="font-bold">
              {lang === 'ar' ? 'برنامج الإحالات' : 'Referral Program'}
            </h3>
          </div>
          <ul className="space-y-1.5">
            {slogans.map((s, i) => (
              <li key={i} className="text-sm text-foreground/90 leading-relaxed">
                {lang === 'ar' ? (s.ar || s.en) : (s.en || s.ar)}
              </li>
            ))}
          </ul>
          {discountPercent > 0 && (
            <p className="text-xs font-semibold text-primary">
              {lang === 'ar'
                ? `خصم ${discountPercent}% على أول اشتراك لكل من يدعو صديقًا.`
                : `${discountPercent}% off the first subscription for anyone who invites a friend.`}
            </p>
          )}
        </div>
      )}

      {/* Send invite by email */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Send size={18} strokeWidth={1.8} />
          </span>
          <h3 className="font-bold">
            {t('referral_invite_title') || (lang === 'ar' ? 'أرسل دعوة لصديق' : 'Send an invite')}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('referral_invite_hint') || (lang === 'ar'
            ? 'اكتب بريد صديقك وسنرسل له رابط تسجيل يحتوي على كود إحالتك تلقائيًا.'
            : 'Enter your friend’s email and we’ll send them a signup link with your referral code embedded automatically.')}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={lang === 'ar' ? 'بريد صديقك الإلكتروني' : "Your friend's email"}
            dir="ltr"
            className="flex-1 min-h-[44px]"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendInvite(); } }}
          />
          <Button onClick={sendInvite} disabled={sendingInvite} className="min-h-[44px]">
            {sendingInvite ? <Loader2 size={16} className="animate-spin me-1.5" /> : <Send size={16} className="me-1.5" />}
            {lang === 'ar' ? 'إرسال الدعوة' : 'Send invite'}
          </Button>
        </div>
      </div>

      {/* Referral link */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Link2 size={18} strokeWidth={1.8} />
          </span>
          <h3 className="font-bold">{t('referral_link_title') || (lang === 'ar' ? 'رابط الإحالة' : 'Referral Link')}</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={link}
            dir="ltr"
            onClick={(e) => e.currentTarget.select()}
            className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm font-mono min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button variant="outline" onClick={copyLink} className="min-h-[44px]">
            {copied ? <><CheckCircle2 size={16} className="me-1.5 text-emerald-600" />{t('referral_copied') || (lang === 'ar' ? 'تم النسخ' : 'Copied')}</> : <><Copy size={16} className="me-1.5" />{t('referral_copy') || (lang === 'ar' ? 'نسخ' : 'Copy')}</>}
          </Button>
          <Button onClick={shareLink} className="min-h-[44px]">
            <Share2 size={16} className="me-1.5" />
            {t('referral_share') || (lang === 'ar' ? 'مشاركة' : 'Share')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('referral_link_hint') || (lang === 'ar'
            ? 'شارك هذا الرابط. تُحتسب الإحالة فقط بعد اعتماد المدير الأعلى لحساب من دعوته.'
            : 'Share this link. A referral is counted only after Super Admin approves the invited account.')}
        </p>
      </div>

      {/* Approved count */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t('referral_approved_total') || (lang === 'ar' ? 'إجمالي الإحالات المعتمدة' : 'Approved Referrals')}</p>
          <p className="text-3xl font-bold tabular-nums text-emerald-600" dir="ltr">{approved}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t('referral_pending') || (lang === 'ar' ? 'قيد المراجعة' : 'Pending')}</p>
          <p className="text-3xl font-bold tabular-nums" dir="ltr">{data?.pendingCount || 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t('referral_registrations') || (lang === 'ar' ? 'التسجيلات' : 'Registrations')}</p>
          <p className="text-3xl font-bold tabular-nums" dir="ltr">{data?.registrationsCount || 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t('referral_clicks') || (lang === 'ar' ? 'فتح الرابط' : 'Link Clicks')}</p>
          <p className="text-3xl font-bold tabular-nums" dir="ltr">{data?.linkClicks || 0}</p>
        </div>
      </div>

      {/* Available offers + progress */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Gift size={18} strokeWidth={1.8} />
          </span>
          <h3 className="font-bold">{t('referral_offers_title') || (lang === 'ar' ? 'العروض المتاحة' : 'Available Offers')}</h3>
        </div>
        {(!data?.offers || data.offers.length === 0) ? (
          <p className="text-sm text-muted-foreground">{t('referral_no_offers') || (lang === 'ar' ? 'لا توجد عروض متاحة حالياً.' : 'No offers available right now.')}</p>
        ) : (
          <div className="space-y-3">
            {data.offers.map((o) => {
              const pct = o.target > 0 ? Math.min(100, Math.round((o.progress / o.target) * 100)) : 0;
              const done = o.progress >= o.target;
              return (
                <div key={o.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{lang === 'ar' ? o.name_ar : o.name_en}</p>
                      <p className="text-xs text-muted-foreground">{lang === 'ar' ? o.desc_ar : o.desc_en}</p>
                    </div>
                    {done && <Trophy size={18} className="text-amber-500 shrink-0" />}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('referral_progress') || (lang === 'ar' ? 'التقدم' : 'Progress')}</span>
                    <span className={cn('font-bold tabular-nums', done ? 'text-emerald-600' : 'text-foreground')} dir="ltr">{o.progress} / {o.target}</span>
                  </div>
                  <div className="h-2 rounded-full bg-accent overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', done ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My rewards */}
      {data?.rewards && data.rewards.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Trophy size={18} strokeWidth={1.8} />
            </span>
            <h3 className="font-bold">{t('referral_my_rewards') || (lang === 'ar' ? 'مكافآتي' : 'My Rewards')}</h3>
          </div>
          <div className="space-y-2">
            {data.rewards.map((rw) => (
              <div key={rw.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold capitalize">{rw.plan}</p>
                  {rw.expiry && <p className="text-xs text-muted-foreground" dir="ltr">{rw.expiry}</p>}
                </div>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', rw.status === 'granted' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200')}>
                  {rw.status === 'granted' ? (t('referral_reward_granted') || (lang === 'ar' ? 'مُنحت' : 'Granted')) : (t('referral_reward_pending') || (lang === 'ar' ? 'قيد الانتظار' : 'Pending'))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Simple log */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h3 className="font-bold">{t('referral_log_title') || (lang === 'ar' ? 'سجل الإحالات' : 'Referral Log')}</h3>
        {(!data?.log || data.log.length === 0) ? (
          <p className="text-sm text-muted-foreground">{t('referral_log_empty') || (lang === 'ar' ? 'لا توجد إحالات بعد.' : 'No referrals yet.')}</p>
        ) : (
          <div className="space-y-2">
            {data.log.map((r) => {
              const Icon = statusIcon[r.status] || Clock;
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{r.referred_name || r.referred_email}</p>
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">{r.referred_email}</p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', statusColor[r.status] || statusColor.pending)}>
                    <Icon size={12} />
                    {r.status === 'approved' ? (t('referral_status_approved') || (lang === 'ar' ? 'معتمدة' : 'Approved')) :
                     r.status === 'pending' ? (t('referral_status_pending') || (lang === 'ar' ? 'قيد المراجعة' : 'Pending')) :
                     r.status === 'rejected' ? (t('referral_status_rejected') || (lang === 'ar' ? 'مرفوضة' : 'Rejected')) :
                     (t('referral_status_changes') || (lang === 'ar' ? 'تعديلات مطلوبة' : 'Changes Requested'))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
