import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  Activity,
  Ban,
  CheckCircle2,
  Clock,
  Gift,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Trophy,
  Users,
  X,
  XCircle,
  Pencil,
  Archive,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import {
  getAdminReferralOverview,
  saveReferralSettings,
  grantReward,
  approveUser,
} from '@/lib/referralClient';
import { countryName } from '@/lib/countries';
import { cn } from '@/lib/utils';

const TABS = ['overview', 'all', 'top', 'offers', 'rewards', 'analytics', 'settings'];

export default function ReferralAdminPanel() {
  const { t, lang } = useLanguage();
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getAdminReferralOverview();
      setData(r);
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: referral offers, users, and referral records update in real time.
  useRealtimeRefresh(load, ['referral_offers', 'users', 'referrals']);

  const tabLabel = (k) => {
    const map = {
      overview: lang === 'ar' ? 'نظرة عامة' : 'Overview',
      all: lang === 'ar' ? 'كل الإحالات' : 'All Referrals',
      top: lang === 'ar' ? 'أفضل المُحيلين' : 'Top Referrers',
      offers: lang === 'ar' ? 'العروض' : 'Offers',
      rewards: lang === 'ar' ? 'المكافآت' : 'Rewards',
      analytics: lang === 'ar' ? 'التحليلات' : 'Analytics',
      settings: lang === 'ar' ? 'الإعدادات' : 'Settings',
    };
    return map[k] || k;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors min-h-[40px]',
              tab === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent',
            )}
          >
            {tabLabel(k)}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="min-h-[40px] ms-auto">
          <RefreshCw size={14} className={cn('me-1.5', loading && 'animate-spin')} />
          {lang === 'ar' ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin me-2" />{t('loading')}
        </div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab data={data} lang={lang} t={t} />}
          {tab === 'all' && <AllReferralsTab data={data} lang={lang} t={t} onAction={async (userId, action, note) => {
            try { await approveUser(userId, action, note); setNotice(lang === 'ar' ? 'تم التحديث.' : 'Updated.'); await load(); } catch (err) { setError(String(err?.message || t('something_wrong'))); }
          }} />}
          {tab === 'top' && <TopReferrersTab data={data} lang={lang} t={t} />}
          {tab === 'offers' && <OffersTab data={data} lang={lang} t={t} onChanged={load} />}
          {tab === 'rewards' && <RewardsTab data={data} lang={lang} t={t} onGrant={async (id) => {
            try { await grantReward(id); setNotice(lang === 'ar' ? 'تم منح المكافأة.' : 'Reward granted.'); await load(); } catch (err) { setError(String(err?.message || t('something_wrong'))); }
          }} />}
          {tab === 'analytics' && <AnalyticsTab data={data} lang={lang} t={t} />}
          {tab === 'settings' && <SettingsTab data={data} lang={lang} t={t} onSave={async (s) => {
            try { await saveReferralSettings(s); setNotice(lang === 'ar' ? 'تم حفظ الإعدادات.' : 'Settings saved.'); await load(); } catch (err) { setError(String(err?.message || t('something_wrong'))); }
          }} />}
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, tone }) {
  const tones = { emerald: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600', primary: 'text-primary', slate: 'text-foreground' };
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {Icon && <Icon size={16} className={tones[tone] || tones.slate} />}
      </div>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', tones[tone] || tones.slate)} dir="ltr">{value}</p>
    </div>
  );
}

function OverviewTab({ data, lang, t }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatTile label={lang === 'ar' ? 'إجمالي المعتمدة' : 'Total Approved'} value={data?.totalApproved || 0} icon={CheckCircle2} tone="emerald" />
        <StatTile label={lang === 'ar' ? 'قيد المراجعة' : 'Pending'} value={data?.pending || 0} icon={Clock} tone="amber" />
        <StatTile label={lang === 'ar' ? 'مرفوضة' : 'Rejected'} value={data?.rejected || 0} icon={XCircle} tone="red" />
        <StatTile label={lang === 'ar' ? 'فتح الرابط' : 'Link Clicks'} value={data?.linkClicks || 0} icon={Activity} tone="primary" />
        <StatTile label={lang === 'ar' ? 'التسجيلات' : 'Registrations'} value={data?.registrations || 0} icon={Users} tone="slate" />
        <StatTile label={lang === 'ar' ? 'ملاك' : 'Owners'} value={data?.ownersReferred || 0} icon={Users} tone="slate" />
        <StatTile label={lang === 'ar' ? 'وسطاء' : 'Brokers'} value={data?.brokersReferred || 0} icon={Users} tone="slate" />
        <StatTile label={lang === 'ar' ? 'شركات' : 'Companies'} value={data?.companiesReferred || 0} icon={Users} tone="slate" />
        <StatTile label={lang === 'ar' ? 'عروض نشطة' : 'Active Offers'} value={data?.activeOffers || 0} icon={Gift} tone="primary" />
        <StatTile label={lang === 'ar' ? 'مكافآت معلّقة' : 'Pending Rewards'} value={data?.pendingRewards || 0} icon={Clock} tone="amber" />
        <StatTile label={lang === 'ar' ? 'مكافآت مُمنوحة' : 'Granted Rewards'} value={data?.grantedRewards || 0} icon={Trophy} tone="emerald" />
      </div>
    </div>
  );
}

function AllReferralsTab({ data, lang, t, onAction }) {
  const [pendingOwners, setPendingOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [noteId, setNoteId] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await pb.collection('users').getList(1, 200, {
          filter: "account_state = 'pending_review' || account_state = 'incomplete'",
          sort: '-submitted_at',
        });
        setPendingOwners(r.items || []);
      } catch {
        /* ignore */
      } finally {
        setLoadingOwners(false);
      }
    })();
  }, [data]);

  const act = async (u, action) => {
    if (action === 'approve') {
      if (!window.confirm(lang === 'ar' ? 'اعتماد هذا الحساب؟' : 'Approve this account?')) return;
    }
    setBusyId(u.id);
    const theNote = (action === 'request_changes' || action === 'reject') ? note : '';
    await onAction(u.id, action, theNote);
    setBusyId('');
    setNoteId('');
    setNote('');
    setMode('');
  };

  const referrals = data?.offers ? null : null; // placeholder; we use data.log? no — admin overview doesn't return log. Use rewards + a referrals fetch.
  const [allRef, setAllRef] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const r = await pb.collection('referrals').getList(1, 200, { sort: '-created', expand: 'referrer,referred_user' });
        setAllRef(r.items || []);
      } catch {
        /* ignore */
      }
    })();
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Pending owner approvals */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <p className="font-bold">{lang === 'ar' ? 'حسابات بانتظار الاعتماد' : 'Accounts Pending Approval'}</p>
        </div>
        {loadingOwners ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t('loading')}</p>
        ) : pendingOwners.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{lang === 'ar' ? 'لا توجد حسابات بانتظار الاعتماد.' : 'No accounts pending approval.'}</p>
        ) : (
          <div className="divide-y">
            {pendingOwners.map((u) => (
              <div key={u.id} className="px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{u.name || u.email}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{u.email} · {u.account_state}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => act(u, 'approve')} disabled={busyId === u.id} className="min-h-[34px] px-2.5"><CheckCircle2 size={13} className="me-1" />{t('approve')}</Button>
                    <Button size="sm" variant="outline" onClick={() => { setNoteId(u.id); setMode('request_changes'); }} disabled={busyId === u.id} className="min-h-[34px] px-2.5"><Pencil size={13} className="me-1" />{t('request_changes')}</Button>
                    <Button size="sm" variant="outline" onClick={() => { setNoteId(u.id); setMode('reject'); }} disabled={busyId === u.id} className="min-h-[34px] px-2.5 text-destructive"><Ban size={13} className="me-1" />{t('reject')}</Button>
                  </div>
                </div>
                {noteId === u.id && (
                  <div className="flex flex-wrap gap-2">
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'reject' ? (t('rejection_reason_placeholder')) : (t('changes_note_placeholder'))} className="min-h-[38px] flex-1" />
                    <Button size="sm" onClick={() => act(u, mode)} disabled={busyId === u.id || !note.trim()} className="min-h-[38px]">{t('save')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setNoteId(''); setNote(''); setMode(''); }} className="min-h-[38px]">{t('cancel')}</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All referral records */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <p className="font-bold">{lang === 'ar' ? 'كل سجلات الإحالة' : 'All Referral Records'}</p>
        </div>
        {allRef.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{lang === 'ar' ? 'لا توجد سجلات.' : 'No records.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'المُحيل' : 'Referrer'}</th>
                  <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'المدعو' : 'Referred'}</th>
                  <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الدولة' : 'Country'}</th>
                  <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allRef.map((r) => {
                  const ref = r.expand?.referrer;
                  const rec = r.expand?.referred_user;
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-xs">{ref?.name || ref?.email || r.referrer}</td>
                      <td className="px-3 py-2 text-xs">{rec?.name || r.referred_email}</td>
                      <td className="px-3 py-2 text-xs">{r.account_type}</td>
                      <td className="px-3 py-2 text-xs">{r.country ? countryName(r.country, lang) : '—'}</td>
                      <td className="px-3 py-2"><span className="rounded-full border px-2 py-0.5 text-xs font-semibold">{r.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TopReferrersTab({ data, lang, t }) {
  const top = data?.topReferrers || [];
  if (!top.length) return <p className="text-sm text-muted-foreground py-8 text-center">{lang === 'ar' ? 'لا توجد بيانات بعد.' : 'No data yet.'}</p>;
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-accent/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">#</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'المُحيل' : 'Referrer'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'البريد' : 'Email'}</th>
              <th className="px-3 py-2 text-end font-medium">{lang === 'ar' ? 'معتمدة' : 'Approved'}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {top.map((r, i) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 text-xs font-medium">{r.name || '—'}</td>
                <td className="px-3 py-2 text-xs" dir="ltr">{r.email}</td>
                <td className="px-3 py-2 text-end tabular-nums font-bold">{r.approvedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OffersTab({ data, lang, t, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const offers = data?.offers || [];

  const blank = () => ({
    name_en: '', name_ar: '', desc_en: '', desc_ar: '',
    beneficiary_type: 'all', referred_type: 'all', required_count: 5,
    reward_type: 'free_subscription', reward_duration: 'monthly', plan: 'free',
    start_date: '', end_date: '', automatic: true, one_time: true,
    all_countries: true, countries: [], status: 'active',
  });

  const save = async (form) => {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'countries') fd.append(k, JSON.stringify(v || []));
      else if (typeof v === 'boolean') fd.append(k, v ? 'true' : 'false');
      else fd.append(k, String(v == null ? '' : v));
    });
    if (editing) await pb.collection('referral_offers').update(editing, fd);
    else await pb.collection('referral_offers').create(fd);
    setOpen(false);
    setEditing(null);
    onChanged();
  };

  const setStatus = async (o, status) => {
    await pb.collection('referral_offers').update(o.id, { status });
    onChanged();
  };

  const remove = async (o) => {
    if (!window.confirm(lang === 'ar' ? 'حذف هذا العرض؟' : 'Delete this offer?')) return;
    await pb.collection('referral_offers').delete(o.id);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="min-h-[40px]"><Plus size={15} className="me-1.5" />{lang === 'ar' ? 'عرض جديد' : 'New Offer'}</Button>
      </div>
      {offers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{lang === 'ar' ? 'لا توجد عروض.' : 'No offers.'}</p>
      ) : (
        <div className="space-y-2">
          {offers.map((o) => (
            <div key={o.id} className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{lang === 'ar' ? o.name_ar : o.name_en}</p>
                  <p className="text-xs text-muted-foreground">{lang === 'ar' ? o.desc_ar : o.desc_en}</p>
                </div>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                  o.status === 'active' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                  o.status === 'paused' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  'bg-slate-100 text-slate-700 border-slate-200')}>{o.status}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{lang === 'ar' ? 'مطلوب' : 'Required'}: <b className="text-foreground">{o.required_count}</b></span>
                <span>{lang === 'ar' ? 'المستفيد' : 'Beneficiary'}: <b className="text-foreground">{o.beneficiary_type}</b></span>
                <span>{lang === 'ar' ? 'المدعو' : 'Referred'}: <b className="text-foreground">{o.referred_type}</b></span>
                <span>{lang === 'ar' ? 'المكافأة' : 'Reward'}: <b className="text-foreground">{o.reward_type} · {o.reward_duration}</b></span>
                <span>{o.automatic ? (lang === 'ar' ? 'تلقائي' : 'Automatic') : (lang === 'ar' ? 'يدوي' : 'Manual')}</span>
                <span>{o.one_time ? (lang === 'ar' ? 'مرة واحدة' : 'One-time') : (lang === 'ar' ? 'متكرر' : 'Repeatable')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => { setEditing(o.id); setOpen(true); }} className="min-h-[32px] px-2.5"><Pencil size={12} className="me-1" />{t('edit')}</Button>
                {o.status === 'active' && <Button size="sm" variant="outline" onClick={() => setStatus(o, 'paused')} className="min-h-[32px] px-2.5"><Pause size={12} className="me-1" />{lang === 'ar' ? 'إيقاف' : 'Pause'}</Button>}
                {o.status === 'paused' && <Button size="sm" variant="outline" onClick={() => setStatus(o, 'active')} className="min-h-[32px] px-2.5"><Play size={12} className="me-1" />{lang === 'ar' ? 'استئناف' : 'Resume'}</Button>}
                {o.status !== 'ended' && <Button size="sm" variant="outline" onClick={() => setStatus(o, 'ended')} className="min-h-[32px] px-2.5"><X size={12} className="me-1" />{lang === 'ar' ? 'إنهاء' : 'End'}</Button>}
                <Button size="sm" variant="outline" onClick={() => setStatus(o, 'archived')} className="min-h-[32px] px-2.5"><Archive size={12} className="me-1" />{lang === 'ar' ? 'أرشفة' : 'Archive'}</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(o)} className="min-h-[32px] px-2.5 text-destructive"><Trash2 size={12} className="me-1" />{t('delete')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && <OfferDialog existing={editing ? offers.find((x) => x.id === editing) : null} blank={blank} onSave={save} onClose={() => { setOpen(false); setEditing(null); }} lang={lang} t={t} />}
    </div>
  );
}

function OfferDialog({ existing, blank, onSave, onClose, lang, t }) {
  const [form, setForm] = useState(existing || blank());
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle>{existing ? (lang === 'ar' ? 'تعديل عرض' : 'Edit Offer') : (lang === 'ar' ? 'عرض جديد' : 'New Offer')}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'حدد تفاصيل عرض الإحالة.' : 'Define the referral offer details.'}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pe-1">
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'الاسم (عربي)' : 'Name (AR)'}</Label><Input value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} className="min-h-[40px]" /></div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (EN)'}</Label><Input value={form.name_en} onChange={(e) => set('name_en', e.target.value)} className="min-h-[40px]" /></div>
          <div className="col-span-2 space-y-1"><Label className="text-xs">{lang === 'ar' ? 'الوصف (عربي)' : 'Description (AR)'}</Label><Textarea value={form.desc_ar} onChange={(e) => set('desc_ar', e.target.value)} rows={2} /></div>
          <div className="col-span-2 space-y-1"><Label className="text-xs">{lang === 'ar' ? 'الوصف (إنجليزي)' : 'Description (EN)'}</Label><Textarea value={form.desc_en} onChange={(e) => set('desc_en', e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'المستفيد' : 'Beneficiary'}</Label>
            <Select value={form.beneficiary_type} onValueChange={(v) => set('beneficiary_type', v)}><SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger><SelectContent>{['all','owner','broker','company'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'المدعو' : 'Referred'}</Label>
            <Select value={form.referred_type} onValueChange={(v) => set('referred_type', v)}><SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger><SelectContent>{['all','owner','broker','company'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'العدد المطلوب' : 'Required Count'}</Label><Input type="number" min="1" value={form.required_count} onChange={(e) => set('required_count', Number(e.target.value))} className="min-h-[40px]" dir="ltr" /></div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'نوع المكافأة' : 'Reward Type'}</Label>
            <Select value={form.reward_type} onValueChange={(v) => set('reward_type', v)}><SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger><SelectContent>{['free_subscription','badge','custom'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'مدة المكافأة' : 'Reward Duration'}</Label>
            <Select value={form.reward_duration || 'none'} onValueChange={(v) => set('reward_duration', v)}><SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger><SelectContent>{['none','monthly','yearly','lifetime'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'الباقة' : 'Plan'}</Label>
            <Select value={form.plan || 'free'} onValueChange={(v) => set('plan', v)}><SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger><SelectContent>{['free','monthly','yearly','lifetime'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'تاريخ البداية' : 'Start Date'}</Label><Input type="date" value={form.start_date ? String(form.start_date).slice(0,10) : ''} onChange={(e) => set('start_date', e.target.value)} dir="ltr" className="min-h-[40px]" /></div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'تاريخ النهاية' : 'End Date'}</Label><Input type="date" value={form.end_date ? String(form.end_date).slice(0,10) : ''} onChange={(e) => set('end_date', e.target.value)} dir="ltr" className="min-h-[40px]" /></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="auto" checked={!!form.automatic} onChange={(e) => set('automatic', e.target.checked)} /><Label htmlFor="auto" className="text-xs">{lang === 'ar' ? 'منح تلقائي' : 'Automatic Reward'}</Label></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="one" checked={!!form.one_time} onChange={(e) => set('one_time', e.target.checked)} /><Label htmlFor="one" className="text-xs">{lang === 'ar' ? 'مرة واحدة' : 'One Time'}</Label></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="allc" checked={!!form.all_countries} onChange={(e) => set('all_countries', e.target.checked)} /><Label htmlFor="allc" className="text-xs">{lang === 'ar' ? 'كل الدول' : 'All Countries'}</Label></div>
          <div className="space-y-1"><Label className="text-xs">{lang === 'ar' ? 'الحالة' : 'Status'}</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}><SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger><SelectContent>{['active','paused','ended','archived'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="min-h-[40px]">{t('cancel')}</Button>
          <Button onClick={submit} disabled={busy || !form.name_en || !form.name_ar} className="min-h-[40px]">{busy ? <Loader2 size={16} className="animate-spin" /> : (lang === 'ar' ? 'حفظ' : 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RewardsTab({ data, lang, t, onGrant }) {
  const rewards = data?.rewards || [];
  if (!rewards.length) return <p className="text-sm text-muted-foreground py-8 text-center">{lang === 'ar' ? 'لا توجد مكافآت.' : 'No rewards.'}</p>;
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-accent/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'المُحيل' : 'Referrer'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'العرض' : 'Offer'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الباقة' : 'Plan'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
              <th className="px-3 py-2 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rewards.map((rw) => (
              <tr key={rw.id}>
                <td className="px-3 py-2 text-xs">{rw.referrer_name || rw.referrer_id}</td>
                <td className="px-3 py-2 text-xs">{rw.offer_name || rw.offer_id}</td>
                <td className="px-3 py-2 text-xs">{rw.plan}</td>
                <td className="px-3 py-2"><span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', rw.status === 'granted' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200')}>{rw.status}</span></td>
                <td className="px-3 py-2">{rw.status === 'pending' && <Button size="sm" onClick={() => onGrant(rw.id)} className="min-h-[32px] px-2.5"><Send size={12} className="me-1" />{lang === 'ar' ? 'منح' : 'Grant'}</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsTab({ data, lang, t }) {
  const byCountry = data?.byCountry || [];
  const byType = data?.byAccountType || {};
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="font-bold mb-3">{lang === 'ar' ? 'الإحالات المعتمدة حسب الدولة' : 'Approved Referrals by Country'}</p>
        {byCountry.length === 0 ? <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'لا توجد بيانات.' : 'No data.'}</p> : (
          <div className="space-y-2">
            {byCountry.map((c) => (
              <div key={c.country} className="flex items-center justify-between text-sm">
                <span>{countryName(c.country, lang) || c.country}</span>
                <span className="font-bold tabular-nums">{c.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="font-bold mb-3">{lang === 'ar' ? 'الإحالات حسب نوع الحساب' : 'Referrals by Account Type'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div><p className="text-xs text-muted-foreground">{lang === 'ar' ? 'ملاك' : 'Owners'}</p><p className="text-xl font-bold tabular-nums">{byType.owner || 0}</p></div>
          <div><p className="text-xs text-muted-foreground">{lang === 'ar' ? 'وسطاء' : 'Brokers'}</p><p className="text-xl font-bold tabular-nums">{byType.broker || 0}</p></div>
          <div><p className="text-xs text-muted-foreground">{lang === 'ar' ? 'شركات' : 'Companies'}</p><p className="text-xl font-bold tabular-nums">{byType.company || 0}</p></div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ data, lang, t, onSave }) {
  const s = data?.settings || { enabled: true, owner: true, broker: true, company: true, discount_percent: 10, slogans: [] };
  const [form, setForm] = useState({
    ...s,
    discount_percent: Number(s.discount_percent || 0),
    slogans: Array.isArray(s.slogans) ? s.slogans.map((x) => ({ ar: x.ar || '', en: x.en || '' })) : [],
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const setSlogan = (i, key, val) => {
    setForm((f) => {
      const next = (f.slogans || []).map((x) => ({ ...x }));
      next[i] = { ...next[i], [key]: val };
      return { ...f, slogans: next };
    });
  };
  const addSlogan = () => setForm((f) => ({ ...f, slogans: [...(f.slogans || []), { ar: '', en: '' }] }));
  const removeSlogan = (i) => setForm((f) => ({ ...f, slogans: (f.slogans || []).filter((_, idx) => idx !== i) }));

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        ...form,
        discount_percent: Number(form.discount_percent || 0),
        slogans: (form.slogans || []).filter((x) => x.ar || x.en),
      });
    } finally { setBusy(false); }
  };
  const Toggle = ({ k, label }) => (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <button type="button" onClick={() => set(k, !form[k])} className={cn('relative h-6 w-11 rounded-full transition-colors', form[k] ? 'bg-primary' : 'bg-muted')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', form[k] ? 'start-[22px]' : 'start-0.5')} />
      </button>
    </div>
  );
  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-3">
        <Toggle k="enabled" label={lang === 'ar' ? 'تفعيل نظام الإحالات' : 'Enable Referral System'} />
        <Toggle k="owner" label={lang === 'ar' ? 'تفعيل للملاك' : 'Enable for Owners'} />
        <Toggle k="broker" label={lang === 'ar' ? 'تفعيل للوسطاء' : 'Enable for Brokers'} />
        <Toggle k="company" label={lang === 'ar' ? 'تفعيل للشركات' : 'Enable for Companies'} />
      </div>

      {/* Discount percent — applied to a referred user's first subscription */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
        <p className="font-bold">{lang === 'ar' ? 'نسبة خصم الإحالة' : 'Referral discount %'}</p>
        <p className="text-xs text-muted-foreground">
          {lang === 'ar'
            ? 'نسبة الخصم المطبّقة على أول اشتراك لمن يسجّل بكود إحالة صحيح. 0 = بدون خصم. تُطبّق تلقائيًا عند الدفع عبر Stripe.'
            : 'Discount applied to the first subscription of anyone who signs up with a valid referral code. 0 = no discount. Applied automatically at Stripe Checkout.'}
        </p>
        <div className="flex items-center gap-2 max-w-[160px]">
          <Input
            type="number"
            min="0"
            max="100"
            value={form.discount_percent}
            onChange={(e) => set('discount_percent', Math.max(0, Math.min(100, Number(e.target.value || 0))))}
            dir="ltr"
            className="min-h-[40px]"
          />
          <span className="text-sm font-semibold">%</span>
        </div>
      </div>

      {/* Editable promotional slogans */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-bold">{lang === 'ar' ? 'الجمل الترويجية' : 'Promotional slogans'}</p>
            <p className="text-xs text-muted-foreground">
              {lang === 'ar'
                ? 'جمل تظهر في صفحة الإحالات للمستخدمين. عدّلها أو أضف/احذف في أي وقت.'
                : 'Sentences shown on the referrals page to users. Edit, add, or remove any time.'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={addSlogan} className="min-h-[36px]"><Plus size={14} className="me-1" />{lang === 'ar' ? 'إضافة' : 'Add'}</Button>
        </div>
        {(!form.slogans || form.slogans.length === 0) ? (
          <p className="text-sm text-muted-foreground py-2">{lang === 'ar' ? 'لا توجد جمل بعد. اضغط «إضافة».' : 'No slogans yet. Click "Add".'}</p>
        ) : (
          <div className="space-y-3">
            {form.slogans.map((sl, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">#{i + 1}</span>
                  <button type="button" onClick={() => removeSlogan(i)} className="text-destructive hover:opacity-70 p-1"><Trash2 size={14} /></button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === 'ar' ? 'النص (عربي)' : 'Text (AR)'}</Label>
                  <Textarea value={sl.ar} onChange={(e) => setSlogan(i, 'ar', e.target.value)} rows={2} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === 'ar' ? 'النص (إنجليزي)' : 'Text (EN)'}</Label>
                  <Textarea value={sl.en} onChange={(e) => setSlogan(i, 'en', e.target.value)} rows={2} dir="ltr" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button onClick={save} disabled={busy} className="min-h-[44px]">{busy ? <Loader2 size={16} className="animate-spin" /> : (t('save_settings'))}</Button>
    </div>
  );
}
