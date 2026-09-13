import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { Helmet } from 'react-helmet';
import {
  Ban,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
  Mail,
  Megaphone,
  MousePointerClick,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  X,
  XCircle,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { formatDate } from '@/lib/api';
import { useGeoData } from '@/hooks/useGeoData';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');

// Call a custom /ef/marketing/* PB route with the current admin token.
async function mktFetch(path, { method = 'GET', body } = {}) {
  const headers = { Authorization: pb.authStore.token || '' };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${pb.baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Drive a campaign to completion via small, short-lived batch requests.
//
// The platform has no background queue worker (the instance hibernates when
// idle), so the browser orchestrates sending: each call to send-batch
// processes ONE small batch (<= 25 recipients) server-side and returns
// authoritative progress. We loop until done. Small batches keep every
// HTTP request well under the reverse-proxy timeout, so sends actually
// complete instead of hanging in "Sending" forever.
//
// Idempotent + no double sends: the backend skips already-delivered
// recipients (sentSet) and upserts failed send rows in place, so retrying
// after a dropped connection never duplicates a recipient.
//
// On a network error mid-loop we retry the same batch once (the backend
// re-skips delivered recipients), then stop and call fix-stuck so the
// campaign is never left stranded in "Sending".
async function dispatchCampaignBatched(campaignId, batch, onProgress) {
  const size = Math.min(Math.max(1, Number(batch) || 20), 25);
  let done = false;
  let guard = 0;
  let lastRes = null;
  let lastErr = null;
  while (!done && guard < 5000) {
    guard += 1;
    try {
      const res = await mktFetch('/ef/marketing/send-batch', {
        method: 'POST',
        body: { campaignId, batchSize: size },
      });
      lastRes = res;
      if (onProgress) onProgress(res);
      done = !!res.done;
      // No work done in this batch (e.g. all already delivered) → stop.
      if (res.sent === 0 && res.failed === 0) break;
    } catch (err) {
      lastErr = err;
      // Retry the same batch once after a short pause (backend re-skips
      // already-delivered recipients, so this is safe).
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await mktFetch('/ef/marketing/send-batch', {
          method: 'POST',
          body: { campaignId, batchSize: size },
        });
        lastRes = res;
        if (onProgress) onProgress(res);
        done = !!res.done;
        if (res.sent === 0 && res.failed === 0) break;
      } catch (err2) {
        lastErr = err2;
        break;
      }
    }
  }
  // If we aborted with recipients still pending, resolve the stuck status so
  // the campaign is not stranded in "Sending".
  if (lastRes && !lastRes.done && lastRes.remaining > 0) {
    try { await mktFetch('/ef/marketing/fix-stuck', { method: 'POST', body: {} }); } catch (_) {}
  }
  return { lastRes, lastErr };
}

// ---- shared helpers --------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function textToHtml(s) {
  return escapeHtml(s).replace(/\n/g, '<br/>');
}

function buildEmailHtml(o) {
  const name = o.recipientName || (o.lang === 'ar' ? 'عميلنا العزيز' : 'there');
  const body = (o.body || '').replace(/\{\{name\}\}/gi, name);
  const sig = o.signature
    ? `<div style="margin-top:18px;white-space:pre-line;color:#555">${textToHtml(o.signature)}</div>`
    : '';
  const cta =
    o.ctaLabel && o.ctaUrl
      ? `<div style="margin:22px 0"><a href="${escapeHtml(o.ctaUrl)}" style="display:inline-block;background:#22C55E;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:8px;font-size:15px">${escapeHtml(o.ctaLabel)}</a></div>`
      : '';
  const img = o.imageUrl
    ? `<div style="margin:0 0 16px"><img src="${escapeHtml(o.imageUrl)}" alt="" style="max-width:100%;height:auto;border-radius:8px"/></div>`
    : '';
  const pdf = o.pdfUrl
    ? `<div style="margin:18px 0"><a href="${escapeHtml(o.pdfUrl)}" style="display:inline-block;background:#1a2e4f;color:#fff;text-decoration:none;font-weight:700;padding:10px 22px;border-radius:8px;font-size:14px">${o.lang === 'ar' ? 'فتح / تنزيل ملف PDF' : 'Open / Download PDF'}</a></div>`
    : '';
  const unsub = o.unsubLink
    ? `<p style="margin-top:24px;font-size:12px;color:#999">${o.lang === 'ar' ? 'تلقيت هذه الرسالة لأنك مسجل في إستيت فولو. ' : 'You received this message because you are registered with Estate Follow. '}<a href="${escapeHtml(o.unsubLink)}" style="color:#999">${o.lang === 'ar' ? 'إلغاء الاشتراك' : 'Unsubscribe'}</a></p>`
    : '';
  const pixel = o.openPixel
    ? `<img src="${escapeHtml(o.openPixel)}" width="1" height="1" alt="" style="display:none"/>`
    : '';
  return (
    `<div style="font-family:sans-serif;max-width:560px;margin:auto;background:#fff;border:1px solid #eee;border-radius:10px;padding:24px">` +
    `<h2 style="margin:0 0 12px;color:#1a2e4f">${escapeHtml(o.subject)}</h2>` +
    img +
    `<div style="font-size:15px;line-height:1.6;color:#222">${textToHtml(body)}</div>` +
    cta +
    pdf +
    sig +
    unsub +
    `</div><p style="text-align:center;color:#bbb;font-size:11px;margin-top:12px">${escapeHtml(o.senderName || 'Estate Follow')} — Estate Follow</p>` +
    pixel
  );
}

// Detect the email column + optional extra columns from a sheet's rows.
function detectColumns(rows) {
  if (!rows.length) return { emailKey: null, nameKey: null, countryKey: null, cityKey: null, companyKey: null, phoneKey: null };
  const keys = Object.keys(rows[0]);
  const matchKey = (re) => keys.find((k) => re.test(String(k).toLowerCase())) || null;
  let emailKey = matchKey(/e[-_ ]?mail|email|بريد/);
  if (!emailKey) {
    let best = null;
    let bestHits = 0;
    keys.forEach((k) => {
      let hits = 0;
      rows.slice(0, 50).forEach((r) => {
        if (EMAIL_RE.test(String(r[k] ?? '').trim())) hits += 1;
      });
      if (hits > bestHits) { bestHits = hits; best = k; }
    });
    emailKey = best;
  }
  return {
    emailKey,
    nameKey: matchKey(/name|الاسم|full/),
    countryKey: matchKey(/country|دولة|nationality/),
    cityKey: matchKey(/city|مدينة/),
    companyKey: matchKey(/company|شركة|firm/),
    phoneKey: matchKey(/phone|هاتف|mobile|tel/),
  };
}

// Analyze a sheet's rows: auto-detect the email column, clean empties /
// invalid formats / duplicates, and return both aggregate stats and a
// per-row detail list (valid | duplicate | invalid) for the optional
// "View Details" table. Emails are never listed in full by default.
function analyzeRows(rows, cols) {
  const seen = new Set();
  const valid = [];
  const details = [];
  let invalid = 0;
  let duplicate = 0;
  rows.forEach((r) => {
    const raw = String(r[cols.emailKey] ?? '').trim();
    const email = norm(raw);
    let status = 'valid';
    let reason = '';
    if (!email || !EMAIL_RE.test(email)) {
      status = 'invalid';
      reason = email ? 'format' : 'empty';
      invalid += 1;
    } else if (seen.has(email)) {
      status = 'duplicate';
      reason = 'duplicate';
      duplicate += 1;
    } else {
      seen.add(email);
      valid.push({
        email,
        name: String(r[cols.nameKey] ?? '').trim(),
        country: String(r[cols.countryKey] ?? '').trim(),
        city: String(r[cols.cityKey] ?? '').trim(),
        company: String(r[cols.companyKey] ?? '').trim(),
        phone: String(r[cols.phoneKey] ?? '').trim(),
      });
    }
    details.push({ email: email || raw || '—', name: String(r[cols.nameKey] ?? '').trim(), status, reason });
  });
  return {
    valid,
    invalid,
    duplicate,
    details,
    stats: { total: rows.length, valid: valid.length, invalid, duplicate, finalReady: valid.length },
  };
}

// Timezone list (browser-native when available, with a sensible fallback).
const TIMEZONES = (() => {
  try {
    if (typeof Intl !== 'undefined' && Intl.supportedValuesOf) return Intl.supportedValuesOf('timeZone');
  } catch (_) {}
  return ['UTC', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Qatar', 'Asia/Amman', 'Asia/Beirut', 'Asia/Cairo', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles'];
})();
const DEFAULT_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; } })();

// Convert a wall-clock time in a given IANA timezone to an ISO (UTC) string.
function zonedToISO(y, mo, d, h, mi, tz) {
  const asIfUTC = Date.UTC(y, mo - 1, d, h, mi);
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(asIfUTC));
    const tzName = (parts.find((p) => p.type === 'timeZoneName') || {}).value || '';
    let offsetMin = 0;
    const m = String(tzName).match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      offsetMin = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
    }
    return new Date(asIfUTC - offsetMin * 60000).toISOString();
  } catch (_) {
    return new Date(y, mo - 1, d, h, mi).toISOString();
  }
}

function daysInMonth(y, mo) { return new Date(y, mo, 0).getDate(); }

// Build a users filter that matches the backend resolveRecipients logic:
// exclude staff + super admin, then apply account_type / nationality / state.
function buildUserFilter(form) {
  let f = 'is_super_admin != true';
  ['admin', 'editor', 'support', 'custom'].forEach((r) => {
    f += ` && role != "${r}"`;
  });
  if (form.account_filter && form.account_filter !== 'all') {
    f += ` && account_type = "${form.account_filter}"`;
  }
  if (form.country_filter) f += ` && nationality = "${form.country_filter}"`;
  if (form.status_filter && form.status_filter !== 'all') {
    f += ` && account_state = "${form.status_filter}"`;
  }
  return f;
}

// ---- date helpers ----------------------------------------------------------

const DAY = 86400000;
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function rangeFromPeriod(period, custom) {
  const now = new Date();
  const end = now;
  let start;
  if (period === 'today') start = startOfDay(now);
  else if (period === '7d') start = new Date(now.getTime() - 7 * DAY);
  else if (period === '30d') start = new Date(now.getTime() - 30 * DAY);
  else if (period === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (period === 'year') { start = new Date(now.getFullYear(), 0, 1); }
  else if (period === 'custom' && custom?.from) { start = new Date(custom.from); return { start, end: custom?.to ? new Date(custom.to + 'T23:59:59') : now }; }
  else start = new Date(0);
  return { start, end };
}
function inRange(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

// ===========================================================================
//  Searchable Country Selector (Popover + Command)
// ===========================================================================
function SearchableCountrySelect({ value, onChange, L, placeholder }) {
  // Reads the unified geo source (PocketBase platform_countries, with the
  // static list as fallback) instead of a private copy of the country list,
  // so Super Admin edits (disable/rename/add a country) show up here too.
  const { countries } = useGeoData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = useMemo(
    () => countries.find((c) => c.code === value) || null,
    [value, countries],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return countries;
    return countries.filter((c) =>
      c.en.toLowerCase().includes(s) ||
      c.ar.includes(q.trim()) ||
      c.code.toLowerCase().includes(s),
    );
  }, [q, countries]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-h-[44px] w-full justify-between font-normal"
        >
          {selected ? L(selected.ar, selected.en) : (placeholder || L('كل الدول', 'All countries'))}
          <Search size={14} className="ms-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={L('ابحث عن دولة…', 'Search country…')}
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>{L('لا نتائج', 'No results')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => { onChange(''); setOpen(false); setQ(''); }}
                className="min-h-[40px]"
              >
                {L('كل الدول', 'All countries')}
              </CommandItem>
              {filtered.slice(0, 60).map((c) => (
                <CommandItem
                  key={c.code}
                  value={c.code}
                  onSelect={() => { onChange(c.code); setOpen(false); setQ(''); }}
                  className="min-h-[40px] gap-2"
                >
                  <span className="flex-1">{L(c.ar, c.en)}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">{c.code}</span>
                  {value === c.code && <CheckCircle2 size={14} className="text-primary" />}
                </CommandItem>
              ))}
              {filtered.length > 60 && (
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  {L(`+ ${filtered.length - 60} المزيد — refine search`, `+ ${filtered.length - 60} more — refine search`)}
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---- main component --------------------------------------------------------

const TABS = [
  { key: 'overview', icon: BarChart3 },
  { key: 'new', icon: Plus },
  { key: 'file', icon: FileSpreadsheet },
  { key: 'log', icon: Mail },
  { key: 'suppression', icon: Ban },
];

const MarketingPanel = () => {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const L = useCallback((ar, en) => (lang === 'ar' ? ar : en), [lang]);

  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [unsubscribes, setUnsubscribes] = useState([]);
  const [senderEmails, setSenderEmails] = useState([]);
  const [allSends, setAllSends] = useState([]);
  const [allOpens, setAllOpens] = useState([]);
  const [allClicks, setAllClicks] = useState([]);
  const [mkSettings, setMkSettings] = useState({ feature_enabled: true, batch_size: 50, signature_default_en: '', signature_default_ar: '' });

  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignPeriod, setCampaignPeriod] = useState('all');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all');
  const [suppSearch, setSuppSearch] = useState('');

  // overview date filter
  const [ovPeriod, setOvPeriod] = useState('all');
  const [ovCustom, setOvCustom] = useState({ from: '', to: '' });

  const flash = (m) => { setNotice(m); setError(''); setTimeout(() => setNotice(''), 4500); };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [c, tm, un, se, ps, sends, opens, clicks] = await Promise.all([
        pb.collection('marketing_campaigns').getFullList({ sort: '-created', requestKey: 'mkt-c' }),
        pb.collection('marketing_templates').getFullList({ sort: '-created', requestKey: 'mkt-t' }),
        pb.collection('marketing_unsubscribes').getFullList({ sort: '-created', requestKey: 'mkt-u' }),
        pb.collection('marketing_sender_emails').getFullList({ sort: 'created', requestKey: 'mkt-se' }).catch(() => []),
        pb.collection('platform_settings').getFullList({ sort: 'created', requestKey: 'mkt-ps' }).catch(() => []),
        pb.collection('marketing_sends').getFullList({ sort: '-created', requestKey: 'mkt-sends' }).catch(() => []),
        pb.collection('marketing_opens').getFullList({ sort: '-created', requestKey: 'mkt-opens' }).catch(() => []),
        pb.collection('marketing_clicks').getFullList({ sort: '-created', requestKey: 'mkt-clicks' }).catch(() => []),
      ]);
      setCampaigns(c);
      setTemplates(tm);
      setUnsubscribes(un);
      setSenderEmails(se);
      setAllSends(sends);
      setAllOpens(opens);
      setAllClicks(clicks);
      if (ps && ps.length) {
        const cms = ps[0].cms || {};
        const mk = cms.marketing_settings || {};
        setMkSettings({
          feature_enabled: mk.feature_enabled !== false,
          batch_size: Number(mk.batch_size) || 50,
          signature_default_en: mk.signature_default_en || '',
          signature_default_ar: mk.signature_default_ar || '',
        });
      }
    } catch (err) {
      setError(String(err?.message || L('حدث خطأ أثناء التحميل', 'Failed to load')));
    } finally {
      setLoading(false);
    }
  }, [L]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Live: campaigns, templates, lists, contacts, sends, opens, clicks,
  // sender emails, unsubscribes and platform settings all refresh in real
  // time — including sends recorded by the backend as emails go out.
  useRealtimeRefresh(loadAll, [
    'marketing_campaigns',
    'marketing_templates',
    'marketing_lists',
    'marketing_contacts',
    'marketing_sends',
    'marketing_opens',
    'marketing_clicks',
    'marketing_sender_emails',
    'marketing_unsubscribes',
    'platform_settings',
  ]);

  // Auto-resolve campaigns stuck in "sending" — real sends complete
  // synchronously inside the send request, so a "sending" status on load is
  // a stalled campaign. Move it to failed/partially_failed/sent by counts.
  useEffect(() => {
    if (loading) return;
    const stuck = campaigns.filter((c) => c.status === 'sending');
    if (!stuck.length) return;
    let cancelled = false;
    mktFetch('/ef/marketing/fix-stuck', { method: 'POST', body: {} })
      .then((r) => { if (!cancelled && r.fixed > 0) loadAll(); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, campaigns]);

  // Lazy scheduler: the platform has no background cron, so scheduled
  // campaigns are dispatched (small-batch server-side send) the next time an
  // admin opens the Marketing panel at or after the scheduled time. Each
  // campaign only fires once because send-batch flips its status to "sending".
  useEffect(() => {
    if (loading) return;
    const now = Date.now();
    const due = campaigns.filter(
      (c) => c.status === 'scheduled' && c.scheduled_at && new Date(c.scheduled_at).getTime() <= now,
    );
    if (!due.length) return;
    let cancelled = false;
    due.forEach((c) => {
      dispatchCampaignBatched(c.id, 20, null)
        .then(() => { if (!cancelled) loadAll(); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, campaigns]);

  const activeSenderEmails = useMemo(() => senderEmails.filter((s) => s.active), [senderEmails]);
  const defaultSender = useMemo(() => senderEmails.find((s) => s.is_default && s.active) || activeSenderEmails[0] || null, [senderEmails, activeSenderEmails]);

  const filteredCampaigns = useMemo(() => {
    const q = campaignSearch.trim().toLowerCase();
    const now = new Date();
    return campaigns.filter((c) => {
      if (campaignStatusFilter !== 'all' && c.status !== campaignStatusFilter) return false;
      if (campaignPeriod !== 'all') {
        const d = new Date(c.created);
        const days = (now - d) / 86400000;
        if (campaignPeriod === '7d' && days > 7) return false;
        if (campaignPeriod === '30d' && days > 30) return false;
        if (campaignPeriod === 'year' && d.getFullYear() !== now.getFullYear()) return false;
      }
      if (!q) return true;
      return (c.name || '').toLowerCase().includes(q) || (c.subject || '').toLowerCase().includes(q);
    });
  }, [campaigns, campaignSearch, campaignPeriod, campaignStatusFilter]);

  const filteredUnsub = useMemo(() => {
    const q = suppSearch.trim().toLowerCase();
    if (!q) return unsubscribes;
    return unsubscribes.filter((x) => (x.email || '').toLowerCase().includes(q));
  }, [unsubscribes, suppSearch]);

  // ===================================================================
  //  RENDER
  // ===================================================================
  return (
    <div className="space-y-5">
      <Helmet>
        <title>{L('التسويق — إستيت فولو', 'Marketing — Estate Follow')}</title>
        <meta name="description" content={L('نظام التسويق والإرسال الاحترافي مع تحليلات حقيقية', 'Professional marketing & email system with real analytics')} />
      </Helmet>

      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Megaphone size={18} />
        </span>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{L('التسويق', 'Marketing')}</h2>
          <p className="text-sm text-muted-foreground">{L('نظام إرسال وتسويق احترافي مع تحليلات حقيقية', 'Professional email marketing with real analytics')}</p>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div>
      )}

      {mkSettings.feature_enabled === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {L('قسم التسويق معطّل من مركز التحكم.', 'Marketing is disabled from the Control Center.')}
        </div>
      )}

      {/* tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const labels = {
            overview: L('نظرة عامة', 'Overview'),
            new: L('حملة جديدة', 'New Campaign'),
            file: L('حملة من ملف', 'File Campaign'),
            log: L('سجل الحملات', 'Campaign Log'),
            suppression: L('قائمة عدم الإرسال', 'Suppression List'),
          };
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors min-h-[40px]',
                tab === tb.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent',
              )}
            >
              <Icon size={15} />
              {labels[tb.key]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">{L('جارٍ التحميل…', 'Loading…')}</p>
      ) : (
        <>
          {tab === 'overview' && (
            <OverviewView
              campaigns={campaigns}
              sends={allSends}
              opens={allOpens}
              clicks={allClicks}
              senderEmails={senderEmails}
              period={ovPeriod}
              setPeriod={setOvPeriod}
              custom={ovCustom}
              setCustom={setOvCustom}
              L={L}
              lang={lang}
              onOpenCampaign={(c) => setTab('log')}
            />
          )}
          {tab === 'new' && (
            <CampaignForm
              mode="platform"
              L={L}
              lang={lang}
              user={user}
              senderEmails={activeSenderEmails}
              defaultSender={defaultSender}
              templates={templates}
              batchSize={mkSettings.batch_size}
              defaultSignature={lang === 'ar' ? mkSettings.signature_default_ar : mkSettings.signature_default_en}
              onSaved={() => { loadAll(); setTab('overview'); }}
              flash={flash}
              setError={setError}
            />
          )}
          {tab === 'file' && (
            <FileCampaignView
              L={L}
              lang={lang}
              user={user}
              senderEmails={activeSenderEmails}
              defaultSender={defaultSender}
              templates={templates}
              batchSize={mkSettings.batch_size}
              defaultSignature={lang === 'ar' ? mkSettings.signature_default_ar : mkSettings.signature_default_en}
              onSaved={() => { loadAll(); setTab('overview'); }}
              flash={flash}
              setError={setError}
            />
          )}
          {tab === 'log' && (
            <CampaignsView
              campaigns={filteredCampaigns}
              sends={allSends}
              L={L}
              lang={lang}
              search={campaignSearch}
              setSearch={setCampaignSearch}
              period={campaignPeriod}
              setPeriod={setCampaignPeriod}
              statusFilter={campaignStatusFilter}
              setStatusFilter={setCampaignStatusFilter}
              onNew={() => setTab('new')}
              onRefresh={loadAll}
              flash={flash}
              setError={setError}
            />
          )}
          {tab === 'suppression' && (
            <SuppressionView
              unsubscribes={filteredUnsub}
              L={L}
              search={suppSearch}
              setSearch={setSuppSearch}
              onRefresh={loadAll}
              flash={flash}
            />
          )}
        </>
      )}
    </div>
  );
};

//  Email Service Status card (provider / queue / webhook / last emails + test email)
function EmailServiceStatusCard({ L, lang }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await mktFetch('/ef/marketing/status');
      setSt(s);
    } catch (_) { setSt(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendTest = async () => {
    if (!testTo.trim() || !EMAIL_RE.test(norm(testTo))) { setTestMsg(L('أدخل بريداً صحيحاً.', 'Enter a valid email.')); return; }
    setTesting(true); setTestMsg('');
    try {
      await mktFetch('/ef/marketing/send-test', {
        method: 'POST',
        body: { to: norm(testTo), subject: 'Estate Follow — Test Email', html: '<div style="font-family:sans-serif;padding:24px"><h2>Test Email</h2><p>This is a test email from Estate Follow Marketing.</p><p style="color:#888">بريد اختبار من نظام التسويق — إستيت فولو.</p></div>', fromName: 'Estate Follow' },
      });
      setTestMsg(L('تم إرسال بريد الاختبار بنجاح.', 'Test email sent successfully.'));
      setTestTo('');
      load();
    } catch (err) {
      setTestMsg(String(err?.message || L('تعذر إرسال الاختبار.', 'Failed to send test.')));
    } finally { setTesting(false); }
  };

  const cell = (label, value, ok) => (
    <div className="flex items-center justify-between gap-2 text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', ok === true ? 'text-emerald-600' : ok === false ? 'text-red-600' : '')}>{value}</span>
    </div>
  );

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Mail size={16} className="text-primary" />
        <h3 className="font-bold text-sm">{L('حالة خدمة البريد', 'Email Service Status')}</h3>
        <Button size="sm" variant="ghost" className="min-h-[32px] ms-auto px-2" onClick={load} disabled={loading}>{L('تحديث', 'Refresh')}</Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">{L('جارٍ التحميل…', 'Loading…')}</p>
      ) : st ? (
        <div className="space-y-3">
          {!st.providerConnected && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-800">
              {L('خدمة البريد غير مربوطة. لا يمكن إرسال الحملات حتى يتم الربط.', 'Email service is not configured. Campaigns cannot be sent until it is connected.')}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {cell(L('مزوّد البريد', 'Email Provider'), st.providerConnected ? L('متصل', 'Connected') : L('غير متصل', 'Not connected'), st.providerConnected)}
            {cell(L('اختبار الاتصال الفعلي', 'Live Send Probe'), st.probeOk === true ? L('نجح الإرسال', 'Send succeeded') : st.probeOk === false ? L('فشل الإرسال', 'Send failed') : L('لم يُختبر', 'Not probed'), st.probeOk)}
            {cell(L('بريد المرسل', 'Sender Email'), st.senderAddress || L('—', '—'), st.senderAddress ? true : null)}
            {cell(L('توثيق المرسل', 'Sender Verified'), st.senderVerified ? L('موثّق (مُدار)', 'Verified (managed)') : L('غير موثّق', 'Not verified'), st.senderVerified)}
            {cell(L('الطابور', 'Queue'), st.queueRunning ? L('يعمل (دفعات متزامنة)', 'Running (sync batches)') : L('متوقف', 'Down'), st.queueRunning)}
            {cell(L('تتبّع الفتح/النقر', 'Open/Click Tracking'), st.openClickTracking ? L('مفعّل', 'Active') : L('غير متاح', 'Unavailable'), st.openClickTracking)}
            {cell(L('Webhook', 'Webhook'), st.webhookConnected ? L('متصل', 'Connected') : L('غير مربوط', 'Not connected'), st.webhookConnected)}
            {cell(L('آخر حدث Webhook', 'Last Webhook Event'), st.lastWebhookAt ? formatDate(st.lastWebhookAt, lang) : L('—', '—'))}
            {cell(L('آخر بريد ناجح', 'Last Successful Email'), st.lastSuccessAt ? formatDate(st.lastSuccessAt, lang) : L('—', '—'))}
            {cell(L('آخر بريد فاشل', 'Last Failed Email'), st.lastFailedAt ? formatDate(st.lastFailedAt, lang) : L('—', '—'))}
          </div>
          {st.probeOk === false && st.probeError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <p className="font-semibold">{L('فشل اختبار الاتصال الفعلي — لن تصل الحملات حتى يُحلّ السبب:', 'Live send probe failed — campaigns will not deliver until this is resolved:')}</p>
              <p className="mt-0.5">{st.probeError}</p>
            </div>
          )}
          {st.resolvedStuck > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {L('تم تحويل ', 'Auto-resolved ')}{st.resolvedStuck}{L(' حملة عالقة إلى حالتها الحقيقية.', ' stuck campaign(s) to their honest final status.')}
            </div>
          )}
          {st.webhookUrl && (
            <div className="rounded-lg border bg-accent/30 px-3 py-2 text-xs space-y-1">
              <p className="font-semibold text-muted-foreground">{L('رابط Webhook (لربطه لدى مزوّد البريد)', 'Webhook URL (configure at your email provider)')}</p>
              <p className="font-mono break-all select-all" dir="ltr">{st.webhookUrl}</p>
              <p className="text-muted-foreground">{L('يستقبل: delivered, bounced, dropped, opened, clicked, complained, unsubscribed.', 'Receives: delivered, bounced, dropped, opened, clicked, complained, unsubscribed.')}</p>
            </div>
          )}
          {st.stuckCampaigns > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {L('تم العثور على حملات عالقة في "قيد الإرسال" وتحويلها تلقائياً. استخدم "إعادة المحاولة" لإكمال المتبقي.', 'Found stuck "Sending" campaign(s) and auto-resolved them. Use "Retry" to finish the remaining recipients.')} ({st.stuckCampaigns})
            </div>
          )}
          {st.lastFailedError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <p className="font-semibold">{L('آخر خطأ:', 'Last error:')}</p>
              <p className="mt-0.5">{st.lastFailedError}</p>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{st.queueNote}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{L('تعذّر قراءة حالة الخدمة.', 'Could not read service status.')}</p>
      )}

      <div className="border-t pt-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">{L('بريد اختبار', 'Test Email')}</p>
        <div className="flex flex-wrap gap-2">
          <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} dir="ltr" placeholder={L('بريد للاختبار…', 'Test email address…')} className="min-h-[40px] flex-1 min-w-[200px]" />
          <Button type="button" onClick={sendTest} disabled={testing} className="min-h-[40px]"><Send size={14} className="me-1" />{testing ? L('جارٍ الإرسال…', 'Sending…') : L('إرسال اختبار', 'Send Test')}</Button>
        </div>
        {testMsg && <p className={cn('text-xs', testMsg.includes('بنجاح') || testMsg.includes('success') ? 'text-emerald-600' : 'text-red-600')}>{testMsg}</p>}
      </div>
    </div>
  );
}

// ===========================================================================
//  Overview Dashboard
// ===========================================================================
function OverviewView({ campaigns, sends, opens, clicks, senderEmails, period, setPeriod, custom, setCustom, L, lang, onOpenCampaign }) {
  const { start, end } = useMemo(() => rangeFromPeriod(period, custom), [period, custom]);

  const inRangeCampaigns = useMemo(
    () => campaigns.filter((c) => inRange(c.created, start, end)),
    [campaigns, start, end],
  );
  const inRangeSends = useMemo(
    () => sends.filter((s) => inRange(s.created, start, end)),
    [sends, start, end],
  );
  const inRangeOpens = useMemo(
    () => opens.filter((o) => inRange(o.created, start, end)),
    [opens, start, end],
  );
  const inRangeClicks = useMemo(
    () => clicks.filter((c) => inRange(c.created, start, end)),
    [clicks, start, end],
  );

  const stats = useMemo(() => {
    const delivered = inRangeSends.filter((s) => ['sent', 'opened', 'clicked'].includes(s.status)).length;
    const failed = inRangeSends.filter((s) => s.status === 'failed').length;
    const uniqueOpened = inRangeSends.filter((s) => ['opened', 'clicked'].includes(s.status)).length;
    const uniqueClicked = inRangeSends.filter((s) => s.status === 'clicked').length;
    const unsubscribed = inRangeSends.filter((s) => s.status === 'unsubscribed').length;
    return {
      totalCampaigns: inRangeCampaigns.length,
      completed: inRangeCampaigns.filter((c) => c.status === 'sent').length,
      sending: inRangeCampaigns.filter((c) => c.status === 'sending').length,
      failedCampaigns: inRangeCampaigns.filter((c) => c.status === 'failed').length,
      totalSent: delivered + failed,
      delivered,
      failed,
      uniqueOpened,
      totalOpens: inRangeOpens.length,
      uniqueClicked,
      totalClicks: inRangeClicks.length,
      unsubscribed,
      openRate: pct(uniqueOpened, delivered),
      clickRate: pct(uniqueClicked, delivered),
      deliveryRate: pct(delivered, delivered + failed),
      unsubRate: pct(unsubscribed, delivered),
    };
  }, [inRangeCampaigns, inRangeSends, inRangeOpens, inRangeClicks]);

  // time-series for charts (last N days within range)
  const series = useMemo(() => {
    const days = period === 'today' ? 1
      : period === '7d' ? 7
      : period === '30d' ? 30
      : period === 'month' ? 31
      : period === 'year' ? 12
      : Math.min(30, Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY)));
    const useMonths = period === 'year';
    const buckets = {};
    const labelOf = (d) => useMonths
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : dayKey(d);
    let cur = new Date(start);
    if (useMonths) cur = new Date(start.getFullYear(), start.getMonth(), 1);
    let guard = 0;
    while (cur.getTime() <= end.getTime() && guard < 400) {
      guard += 1;
      const k = labelOf(cur);
      buckets[k] = { label: k, sent: 0, opens: 0, clicks: 0 };
      if (useMonths) cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      else cur = new Date(cur.getTime() + DAY);
    }
    inRangeSends.forEach((s) => {
      if (['sent', 'opened', 'clicked'].includes(s.status)) {
        const k = labelOf(s.sent_at || s.created);
        if (buckets[k]) buckets[k].sent += 1;
      }
    });
    inRangeOpens.forEach((o) => {
      const k = labelOf(o.created);
      if (buckets[k]) buckets[k].opens += 1;
    });
    inRangeClicks.forEach((c) => {
      const k = labelOf(c.created);
      if (buckets[k]) buckets[k].clicks += 1;
    });
    return Object.values(buckets);
  }, [inRangeSends, inRangeOpens, inRangeClicks, start, end, period]);

  const senderPerf = useMemo(() => {
    const map = {};
    senderEmails.forEach((s) => {
      map[s.email] = { email: s.email, name: s.name || '', campaigns: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 };
    });
    inRangeCampaigns.forEach((c) => {
      const e = c.sender_email;
      if (!e) return;
      if (!map[e]) map[e] = { email: e, name: '', campaigns: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 };
      map[e].campaigns += 1;
    });
    inRangeSends.forEach((s) => {
      const c = inRangeCampaigns.find((cc) => cc.id === (typeof s.campaign === 'string' ? s.campaign : s.campaign?.id));
      const e = c?.sender_email;
      if (!e || !map[e]) return;
      if (['sent', 'opened', 'clicked'].includes(s.status)) { map[e].sent += 1; map[e].delivered += 1; }
      if (s.status === 'failed') { map[e].sent += 1; map[e].failed += 1; }
      if (['opened', 'clicked'].includes(s.status)) map[e].opened += 1;
      if (s.status === 'clicked') map[e].clicked += 1;
    });
    return Object.values(map).filter((x) => x.campaigns > 0 || x.sent > 0);
  }, [senderEmails, inRangeCampaigns, inRangeSends]);

  const statCards = [
    { label: L('إجمالي الحملات', 'Total Campaigns'), value: stats.totalCampaigns, icon: Megaphone, tone: 'primary' },
    { label: L('مكتملة', 'Completed'), value: stats.completed, icon: CheckCircle2, tone: 'emerald' },
    { label: L('قيد الإرسال', 'Sending'), value: stats.sending, icon: Send, tone: 'amber' },
    { label: L('حملات فاشلة', 'Failed Campaigns'), value: stats.failedCampaigns, icon: XCircle, tone: 'red' },
    { label: L('إجمالي الرسائل', 'Total Emails Sent'), value: stats.totalSent, icon: Mail, tone: 'sky' },
    { label: L('تم التسليم', 'Delivered'), value: stats.delivered, icon: CheckCircle2, tone: 'emerald' },
    { label: L('فشل', 'Failed'), value: stats.failed, icon: XCircle, tone: 'red' },
    { label: L('فتح (فريد)', 'Opened (Unique)'), value: stats.uniqueOpened, icon: Eye, tone: 'sky' },
    { label: L('نقر (فريد)', 'Clicked (Unique)'), value: stats.uniqueClicked, icon: MousePointerClick, tone: 'violet' },
    { label: L('إلغاء اشتراك', 'Unsubscribed'), value: stats.unsubscribed, icon: Ban, tone: 'slate' },
  ];

  const rateCards = [
    { label: L('نسبة التسليم', 'Delivery Rate'), value: stats.deliveryRate, suffix: '%' },
    { label: L('نسبة الفتح', 'Open Rate'), value: stats.openRate, suffix: '%' },
    { label: L('نسبة النقر', 'Click Rate'), value: stats.clickRate, suffix: '%' },
    { label: L('نسبة إلغاء الاشتراك', 'Unsubscribe Rate'), value: stats.unsubRate, suffix: '%' },
  ];

  return (
    <div className="space-y-5">
      {/* Date filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <span className="text-sm font-medium text-muted-foreground me-1">{L('الفترة', 'Period')}:</span>
        {[
          { k: 'today', ar: 'اليوم', en: 'Today' },
          { k: '7d', ar: '7 أيام', en: '7 days' },
          { k: '30d', ar: '30 يوم', en: '30 days' },
          { k: 'month', ar: 'الشهر', en: 'This month' },
          { k: 'year', ar: 'السنة', en: 'This year' },
          { k: 'all', ar: 'كل الوقت', en: 'All time' },
          { k: 'custom', ar: 'مخصص', en: 'Custom' },
        ].map((p) => (
          <button
            key={p.k}
            type="button"
            onClick={() => setPeriod(p.k)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors min-h-[34px]',
              period === p.k ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent',
            )}
          >
            {L(p.ar, p.en)}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="min-h-[34px] w-[140px]" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="min-h-[34px] w-[140px]" />
          </div>
        )}
      </div>

      {/* Email service status */}
      <EmailServiceStatusCard L={L} lang={lang} />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((s) => (
          <StatTile key={s.label} {...s} L={L} />
        ))}
      </div>

      {/* Rate cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rateCards.map((r) => (
          <div key={r.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {r.value}<span className="text-base text-muted-foreground">{r.suffix}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title={L('الرسائل المرسلة عبر الوقت', 'Emails Sent Over Time')} L={L}>
          <MiniArea data={series} dataKey="sent" color="#22C55E" />
        </ChartCard>
        <ChartCard title={L('الفتح عبر الوقت', 'Opens Over Time')} L={L}>
          <MiniArea data={series} dataKey="opens" color="#0EA5E9" />
        </ChartCard>
        <ChartCard title={L('النقر عبر الوقت', 'Clicks Over Time')} L={L}>
          <MiniArea data={series} dataKey="clicks" color="#8B5CF6" />
        </ChartCard>
      </div>

      {/* Campaign performance table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <h3 className="font-bold">{L('أداء الحملات', 'Campaign Performance')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{L('الحملة', 'Campaign')}</th>
                <th className="px-3 py-2 text-start font-medium">{L('النوع', 'Type')}</th>
                <th className="px-3 py-2 text-end font-medium">{L('مرسلة', 'Sent')}</th>
                <th className="px-3 py-2 text-end font-medium">{L('فتح', 'Opened')}</th>
                <th className="px-3 py-2 text-end font-medium">{L('نقر', 'Clicked')}</th>
                <th className="px-3 py-2 text-end font-medium">{L('إلغاء', 'Unsub')}</th>
                <th className="px-3 py-2 text-start font-medium">{L('الحالة', 'Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inRangeCampaigns.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">{L('لا توجد حملات في هذه الفترة', 'No campaigns in this period')}</td></tr>
              ) : inRangeCampaigns.slice(0, 12).map((c) => {
                const cs = sends.filter((s) => (typeof s.campaign === 'string' ? s.campaign : s.campaign?.id) === c.id);
                const delivered = cs.filter((s) => ['sent', 'opened', 'clicked'].includes(s.status)).length;
                const opened = cs.filter((s) => ['opened', 'clicked'].includes(s.status)).length;
                const clicked = cs.filter((s) => s.status === 'clicked').length;
                const unsub = cs.filter((s) => s.status === 'unsubscribed').length;
                return (
                  <tr key={c.id} className="hover:bg-accent/30 cursor-pointer" onClick={onOpenCampaign}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium truncate max-w-[200px]">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.subject}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{sourceLabel(c.source, L)}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{delivered}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{opened}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{clicked}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{unsub}</td>
                    <td className="px-3 py-2.5"><CampaignStatusBadge status={c.status} L={L} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sender performance + Audience insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3">
            <h3 className="font-bold">{L('أداء بريد المرسل', 'Sender Email Performance')}</h3>
          </div>
          {senderPerf.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{L('لا توجد بيانات في هذه الفترة', 'No data in this period')}</p>
          ) : (
            <div className="divide-y">
              {senderPerf.map((s) => (
                <div key={s.email} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate" dir="ltr">{s.email}</p>
                    <span className="text-xs text-muted-foreground">{s.campaigns} {L('حملة', 'campaigns')}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <MiniStat label={L('مرسلة', 'Sent')} value={s.sent} />
                    <MiniStat label={L('تسليم', 'Delivery')} value={`${pct(s.delivered, s.sent)}%`} />
                    <MiniStat label={L('فتح', 'Open')} value={`${pct(s.opened, s.delivered)}%`} />
                    <MiniStat label={L('نقر', 'Click')} value={`${pct(s.clicked, s.delivered)}%`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3">
            <h3 className="font-bold">{L('رؤى الجمهور', 'Audience Insights')}</h3>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {L('توزيع المستلمين حسب نوع الحساب (من الحملات في هذه الفترة).', 'Recipient breakdown by account type (from campaigns in this period).')}
            </p>
            <AudienceBreakdown campaigns={inRangeCampaigns} L={L} />
          </div>
        </div>
      </div>

      {/* Honest unavailable notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        {L(
          'الفتح والنقر يُسجَّلان عبر بكسل التتبع وإعادة التوجيه. أما الأجهزة، برامج البريد، الدول من التتبع، والارتداد (Bounce) فتتطلب ربط مزود بريد يدعم هذه البيانات عبر Webhook — وتظهر "غير متاح" حتى يتم الربط.',
          'Opens & clicks are recorded via tracking pixel and redirect. Devices, email clients, countries from tracking, and bounces require an email provider that exposes these via Webhook — they show "Unavailable" until connected.',
        )}
      </div>
    </div>
  );
}

function AudienceBreakdown({ campaigns, L }) {
  const byType = useMemo(() => {
    const map = { owner: 0, broker: 0, company: 0, mixed: 0 };
    campaigns.forEach((c) => {
      const f = c.account_filter || 'all';
      const n = Number(c.recipient_count) || 0;
      if (f === 'owner') map.owner += n;
      else if (f === 'broker') map.broker += n;
      else if (f === 'company') map.company += n;
      else map.mixed += n;
    });
    return map;
  }, [campaigns]);
  const total = byType.owner + byType.broker + byType.company + byType.mixed;
  if (total === 0) return <p className="text-xs text-muted-foreground">{L('لا توجد بيانات', 'No data')}</p>;
  const rows = [
    { k: 'owner', ar: 'ملاك', en: 'Owners', v: byType.owner },
    { k: 'broker', ar: 'وسطاء', en: 'Brokers', v: byType.broker },
    { k: 'company', ar: 'شركات', en: 'Companies', v: byType.company },
    { k: 'mixed', ar: 'مختلط/الكل', en: 'Mixed/All', v: byType.mixed },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.k}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span>{L(r.ar, r.en)}</span>
            <span className="tabular-nums text-muted-foreground">{r.v} ({pct(r.v, total)}%)</span>
          </div>
          <div className="h-2 rounded-full bg-background overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${pct(r.v, total)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, tone, L }) {
  const tones = {
    primary: 'bg-primary text-primary-foreground',
    emerald: 'bg-emerald-500 text-white',
    amber: 'bg-amber-500 text-white',
    red: 'bg-red-500 text-white',
    sky: 'bg-sky-500 text-white',
    violet: 'bg-violet-500 text-white',
    slate: 'bg-slate-500 text-white',
  };
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone] || tones.primary)}>
          <Icon size={16} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-accent/30 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ChartCard({ title, children, L }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-bold mb-3">{title}</h3>
      <div className="h-[180px]">{children}</div>
    </div>
  );
}

function MiniArea({ data, dataKey, color }) {
  if (!data || data.length === 0 || data.every((d) => d[dataKey] === 0)) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        لا توجد بيانات / No data
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#grad-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ===========================================================================
//  Unified campaign form (used by New Campaign + File Campaign)
// ===========================================================================
function CampaignForm({
  mode, // 'platform' | 'list'
  listId, listName, listRecipientCount,
  L, lang, user, senderEmails, defaultSender, templates, batchSize, defaultSignature,
  onSaved, flash, setError,
}) {
  const blank = {
    name: '', subject: '', body: '', cta_label: '', cta_url: '', signature: defaultSignature || '',
    image_url: '', account_filter: 'all', country_filter: '', status_filter: 'all',
    scheduled_at: '', sender_email: defaultSender?.email || '', sender_name: defaultSender?.name || 'Estate Follow',
  };
  const [form, setForm] = useState(blank);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [recipientCount, setRecipientCount] = useState(null);
  const [counting, setCounting] = useState(false);
  const fileRef = useRef(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // live recipient count for platform mode
  useEffect(() => {
    if (mode !== 'platform') return;
    setCounting(true);
    const t = setTimeout(async () => {
      try {
        const f = buildUserFilter(form);
        const res = await pb.collection('users').getList(1, 1, { filter: f, requestKey: `mkt-count-${f}` });
        setRecipientCount(res.totalItems);
      } catch { setRecipientCount(null); }
      finally { setCounting(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [mode, form.account_filter, form.country_filter, form.status_filter]);

  const totalEstimate = mode === 'list' ? (listRecipientCount || 0) : (recipientCount || 0);

  const onFile = (f) => {
    if (!f) return;
    if (!/image\/(jpeg|png|webp|svg\+xml|gif)/.test(f.type)) { setError(L('نوع الصورة غير صحيح.', 'Invalid image type.')); return; }
    if (!f.size) { setError(L('الملف فارغ.', 'File is empty.')); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const buildHtml = (recipientName) => buildEmailHtml({
    subject: form.subject, body: form.body,
    ctaLabel: form.cta_label, ctaUrl: form.cta_url,
    signature: form.signature, imageUrl: imagePreview || form.image_url,
    recipientName, senderName: form.sender_name, lang,
    unsubLink: '#unsub-preview',
  });

  const persist = async (status) => {
    if (!form.subject.trim() || !form.body.trim()) {
      setError(L('العنوان ونص الرسالة مطلوبة.', 'Subject and body are required.'));
      return null;
    }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      const source = mode === 'list' ? 'list' : 'platform';
      Object.entries({
        owner: user.id,
        name: form.name.trim() || form.subject.trim().slice(0, 120),
        subject: form.subject, body: form.body,
        cta_label: form.cta_label, cta_url: form.cta_url, signature: form.signature,
        image_url: form.image_url, source,
        account_filter: form.account_filter, country_filter: form.country_filter,
        city_filter: '', status_filter: form.status_filter,
        status, sender_name: form.sender_name, sender_email: form.sender_email,
      }).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
      fd.append('list_ids', JSON.stringify(mode === 'list' && listId ? [listId] : []));
      if (form.scheduled_at) fd.append('scheduled_at', new Date(form.scheduled_at).toISOString());
      if (imageFile) fd.append('image_file', imageFile);
      const rec = await pb.collection('marketing_campaigns').create(fd, { requestKey: `mkt-create-${Date.now()}` });
      setSaving(false);
      return rec;
    } catch (err) {
      setError(String(err?.message || L('تعذر الحفظ.', 'Failed to save.')));
      setSaving(false);
      return null;
    }
  };

  const saveDraft = async () => {
    const rec = await persist('draft');
    if (rec) { flash(L('تم حفظ المسودة.', 'Draft saved.')); onSaved(); }
  };

  const sendNow = async () => {
    if (totalEstimate <= 0) { setError(L('لا يوجد مستلمون.', 'No recipients.')); return; }
    if (!form.sender_email) { setError(L('اختر بريد المرسل أولاً.', 'Select a sender email first.')); return; }
    const rec = await persist('sending');
    if (!rec) return;
    setSending(true);
    setSendProgress({ sent: 0, failed: 0, remaining: totalEstimate, done: false });
    try {
      const { lastRes, lastErr } = await dispatchCampaignBatched(rec.id, batchSize, (res) => {
        setSendProgress({ sent: res.sentCount, failed: res.failedCount, remaining: res.remaining, done: res.done });
      });
      if (lastRes) {
        setSendProgress({ sent: lastRes.sentCount, failed: lastRes.failedCount, remaining: lastRes.remaining, done: lastRes.done });
        if (lastRes.finalStatus === 'failed' || lastRes.finalStatus === 'partially_failed') {
          setError((lastRes.lastError ? (lastRes.lastError + ' — ') : '') + L('لم يكتمل الإرسال بالكامل. راجع سجل الحملة.', 'Sending did not fully complete. Check the campaign log.'));
        } else if (!lastErr) {
          flash(L('تم إرسال الحملة بنجاح.', 'Campaign sent successfully.'));
        }
      }
      if (lastErr && (!lastRes || lastRes.remaining > 0)) {
        setError(String(lastErr?.message || L('انقطع الإرسال. تم إصلاح حالة الحملة — استخدم "إعادة المحاولة" لإكمال المتبقي.', 'Sending was interrupted. The campaign status was fixed — use "Retry" to finish the remaining recipients.')));
      }
      onSaved();
    } catch (err) {
      setError(String(err?.message || L('تعذر إكمال الإرسال.', 'Failed to complete sending.')));
    } finally {
      setSending(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim() || !EMAIL_RE.test(norm(testTo))) { setError(L('أدخل بريداً صحيحاً للاختبار.', 'Enter a valid test email.')); return; }
    if (!form.subject.trim() || !form.body.trim()) { setError(L('العنوان والرسالة مطلوبة للاختبار.', 'Subject and body required to test.')); return; }
    setTesting(true);
    setError('');
    try {
      const html = buildHtml(L('عميلنا العزيز', 'there'));
      await mktFetch('/ef/marketing/send-test', {
        method: 'POST',
        body: { to: norm(testTo), subject: form.subject, html, fromName: form.sender_name },
      });
      flash(L('تم إرسال رسالة الاختبار.', 'Test email sent.'));
    } catch (err) {
      setError(String(err?.message || L('تعذر إرسال الاختبار.', 'Failed to send test.')));
    } finally { setTesting(false); }
  };

  const applyTemplate = (id) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setForm((f) => ({
      ...f,
      subject: tpl.subject || f.subject,
      body: tpl.body || f.body,
      cta_label: tpl.cta_label || f.cta_label,
      cta_url: tpl.cta_url || f.cta_url,
      signature: tpl.signature || f.signature,
      image_url: tpl.image_url || f.image_url,
    }));
  };

  const onSenderChange = (email) => {
    const s = senderEmails.find((x) => x.email === email);
    set('sender_email', email);
    if (s && s.name) set('sender_name', s.name);
  };

  return (
    <div className="space-y-5">
      {/* Step 1 — Audience */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <StepBadge n={1} />
          <h3 className="font-bold">{mode === 'list' ? L('الجمهور من الملف', 'Audience from File') : L('اختيار الجمهور', 'Choose Audience')}</h3>
        </div>

        {mode === 'platform' ? (
          <>
            <p className="text-xs text-muted-foreground">{L('لمستخدمي Estate Follow المسجلين في المنصة فقط. الفلاتر تعمل معاً والعدد يتغير تلقائياً.', 'For registered Estate Follow users only. Filters combine and the count updates automatically.')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{L('نوع الحساب', 'Account Type')}</Label>
                <Select value={form.account_filter} onValueChange={(v) => set('account_filter', v)}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{L('كل المستخدمين', 'All Users')}</SelectItem>
                    <SelectItem value="owner">{L('ملاك', 'Owners')}</SelectItem>
                    <SelectItem value="broker">{L('وسطاء', 'Brokers')}</SelectItem>
                    <SelectItem value="company">{L('شركات', 'Companies')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{L('الدولة', 'Country')}</Label>
                <SearchableCountrySelect value={form.country_filter} onChange={(v) => set('country_filter', v)} L={L} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{L('حالة الحساب', 'Account Status')}</Label>
                <Select value={form.status_filter} onValueChange={(v) => set('status_filter', v)}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{L('كل الحالات', 'All Statuses')}</SelectItem>
                    <SelectItem value="active">{L('نشط', 'Active')}</SelectItem>
                    <SelectItem value="inactive">{L('غير نشط', 'Inactive')}</SelectItem>
                    <SelectItem value="suspended">{L('موقوف', 'Suspended')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border bg-accent/20 p-3 text-sm space-y-1">
            <p className="font-medium">{listName}</p>
            <p className="text-xs text-muted-foreground">{L('البريدات الصحيحة من الملف بعد التنظيف.', 'Valid emails from the file after cleaning.')}</p>
          </div>
        )}

        <div className="rounded-lg border bg-accent/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{L('عدد المستلمين', 'Recipients')}: </span>
          <span className="font-bold tabular-nums">{mode === 'list' ? totalEstimate : (counting ? '…' : totalEstimate)}</span>
          <span className="text-xs text-muted-foreground ms-2">({L('حسب العدد الحقيقي — بدون حد ثابت', 'based on real count — no fixed limit')})</span>
        </div>
      </div>

      {/* Step 2 — Sender */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <StepBadge n={2} />
          <h3 className="font-bold">{L('البريد المرسل منه', 'Sender Email')}</h3>
        </div>
        {senderEmails.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{L('بريد المرسل', 'Sender Email')}</Label>
              <Select value={form.sender_email || '__none__'} onValueChange={(v) => v !== '__none__' && onSenderChange(v)}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {senderEmails.map((s) => <SelectItem key={s.id} value={s.email}>{s.email}{s.name ? ` — ${s.name}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('اسم المرسل', 'Sender Name')}</Label>
              <Input value={form.sender_name} onChange={(e) => set('sender_name', e.target.value)} className="min-h-[44px]" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{L('لم تتم إضافة بريدات مرسل بعد. أضِفها من مركز التحكم ← إعدادات التسويق. يمكنك مؤقتاً إدخال اسم المرسل يدوياً.', 'No sender emails configured yet. Add them from Control Center → Marketing Settings. You can temporarily enter a sender name manually.')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{L('بريد المرسل (اختياري)', 'Sender Email (optional)')}</Label>
                <Input value={form.sender_email} onChange={(e) => set('sender_email', e.target.value)} dir="ltr" className="min-h-[44px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{L('اسم المرسل', 'Sender Name')}</Label>
                <Input value={form.sender_name} onChange={(e) => set('sender_name', e.target.value)} className="min-h-[44px]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 3 — Content */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StepBadge n={3} />
            <h3 className="font-bold">{L('محتوى الرسالة', 'Message Content')}</h3>
          </div>
          {templates.length > 0 && (
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="min-h-[36px] w-[200px] text-xs"><SelectValue placeholder={L('استخدام قالب', 'Use template')} /></SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{L('عنوان البريد', 'Email Subject')} *</Label>
          <Input value={form.subject} onChange={(e) => set('subject', e.target.value)} className="min-h-[44px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{L('نص الرسالة', 'Message Body')} * <span className="text-muted-foreground">({L('استخدم {{name}} للتخصيص', 'use {{name}} for personalization')})</span></Label>
          <Textarea value={form.body} onChange={(e) => set('body', e.target.value)} rows={6} className="min-h-[120px]" />
        </div>

        <div className="rounded-lg border bg-accent/20 p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">{L('إضافات اختيارية', 'Optional additions')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{L('نص زر CTA', 'CTA Button Label')}</Label>
              <Input value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} className="min-h-[44px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('رابط CTA', 'CTA URL')}</Label>
              <Input value={form.cta_url} onChange={(e) => set('cta_url', e.target.value)} dir="ltr" className="min-h-[44px]" placeholder="https://…" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{L('توقيع الرسالة', 'Signature')}</Label>
            <Textarea value={form.signature} onChange={(e) => set('signature', e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{L('صورة الحملة', 'Campaign Image')}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="min-h-[36px]"><Upload size={14} className="me-1" />{L('رفع صورة', 'Upload image')}</Button>
              {(imagePreview || form.image_url) && (
                <div className="flex items-center gap-2">
                  <img src={imagePreview || form.image_url} alt="" className="h-16 w-16 rounded-lg object-cover border" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setImageFile(null); setImagePreview(''); set('image_url', ''); if (fileRef.current) fileRef.current.value = ''; }} className="min-h-[36px] text-destructive"><Trash2 size={13} className="me-1" />{L('حذف', 'Remove')}</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview & test */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">{L('معاينة واختبار', 'Preview & Test')}</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((s) => !s)} className="min-h-[36px]"><Eye size={14} className="me-1" />{showPreview ? L('إخفاء', 'Hide') : L('معاينة', 'Preview')}</Button>
        </div>
        {showPreview && (
          <div className="rounded-lg border p-3 bg-background/50 max-h-[400px] overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: buildHtml(L('عميلنا العزيز', 'there')) }} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} dir="ltr" placeholder={L('بريد للاختبار…', 'Test email address…')} className="min-h-[44px] max-w-xs" />
          <Button type="button" variant="outline" onClick={sendTest} disabled={testing} className="min-h-[44px]"><Send size={14} className="me-1" />{testing ? L('جارٍ الإرسال…', 'Sending…') : L('إرسال اختبار', 'Send Test')}</Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={sendNow} disabled={saving || sending} className="min-h-[44px]"><Send size={15} className="me-1" />{sending ? L('جارٍ إرسال الحملة…', 'Sending campaign…') : L('إرسال الآن', 'Send Now')}</Button>
        <Button type="button" variant="outline" onClick={saveDraft} disabled={saving || sending} className="min-h-[44px]"><Save size={15} className="me-1" />{saving ? L('جارٍ الحفظ…', 'Saving…') : L('حفظ كمسودة', 'Save Draft')}</Button>
      </div>

      {sending && sendProgress && (
        <div className="rounded-lg border bg-accent/30 p-4 text-sm space-y-2">
          <p className="font-medium">{L('تقدّم الإرسال (دفعات في الخلفية)', 'Send Progress (background batches)')}</p>
          <div className="h-2 rounded-full bg-background overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${sendProgress.done ? 100 : Math.min(100, Math.round(((sendProgress.sent + sendProgress.failed) / Math.max(1, sendProgress.sent + sendProgress.failed + sendProgress.remaining)) * 100))}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {L('مرسلة', 'Sent')}: {sendProgress.sent} · {L('فشل', 'Failed')}: {sendProgress.failed} · {L('متبقٍ', 'Remaining')}: {sendProgress.remaining}
          </p>
          <p className="text-[11px] text-muted-foreground">{L('يستمر الإرسال من الخادم حتى لو أغلقت المتصفح.', 'Sending continues from the server even if you close the browser.')}</p>
        </div>
      )}
    </div>
  );
}

function StepBadge({ n }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{n}</span>
  );
}

// ===========================================================================
//  File campaign flow — upload → auto-analyze → sender → content → schedule → send
//  Self-contained: does NOT reuse CampaignForm (so the platform "New Campaign"
//  form stays untouched). After upload the page transforms into a full campaign
//  builder. Emails are never listed in full by default (privacy); an optional
//  "View Details" table shows a per-row status. Send Now dispatches the whole
//  campaign in a single server-side request (full mode) so it completes even
//  if the admin closes the browser.
// ===========================================================================
function FileCampaignView({ L, lang, user, senderEmails, defaultSender, templates, batchSize, defaultSignature, onSaved, flash, setError }) {
  const [importing, setImporting] = useState(false);
  const [analysis, setAnalysis] = useState(null); // { stats, details, validRows, cols }
  const [listName, setListName] = useState('');
  const [fileName, setFileName] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const [form, setForm] = useState({
    subject: '', body: '', cta_label: '', cta_url: '', signature: defaultSignature || '',
    sender_email: defaultSender?.email || '', sender_name: defaultSender?.name || 'Estate Follow',
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const [scheduleMode, setScheduleMode] = useState('now'); // 'now' | 'schedule'
  const initNow = new Date();
  const [schedule, setSchedule] = useState({
    day: String(initNow.getDate()),
    month: String(initNow.getMonth() + 1),
    year: String(initNow.getFullYear()),
    hour: String(initNow.getHours()),
    minute: '0',
    tz: DEFAULT_TZ,
  });

  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const [savedListId, setSavedListId] = useState(null);

  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const pdfRef = useRef(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const monthNames = useMemo(() => {
    const names = [];
    for (let i = 0; i < 12; i++) {
      try {
        names.push(new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { month: 'long' }).format(new Date(2000, i, 1)));
      } catch { names.push(String(i + 1)); }
    }
    return names;
  }, [lang]);

  const dayCount = daysInMonth(Number(schedule.year), Number(schedule.month));

  const handleFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setError('');
    setSavedListId(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) { setError(L('الملف فارغ أو لا يحتوي بيانات.', 'File is empty or has no data.')); setImporting(false); return; }
      const cols = detectColumns(rows);
      if (!cols.emailKey) { setError(L('تعذّر العثور على عمود البريد الإلكتروني.', 'Could not find an email column.')); setImporting(false); return; }
      const { valid, details, stats } = analyzeRows(rows, cols);
      setAnalysis({ stats, details, validRows: valid, cols });
      setListName(file.name.replace(/\.(xlsx|xls|csv)$/i, ''));
      setFileName(file.name);
    } catch (err) {
      setError(String(err?.message || L('تعذّر قراءة الملف.', 'Failed to read file.')));
    } finally { setImporting(false); }
  };

  const reset = () => {
    setAnalysis(null);
    setSavedListId(null);
    setListName('');
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const onImage = (f) => {
    if (!f) return;
    if (!/image\/(jpeg|png|webp|svg\+xml|gif)/.test(f.type)) { setError(L('نوع الصورة غير صحيح.', 'Invalid image type.')); return; }
    if (!f.size) { setError(L('الملف فارغ.', 'File is empty.')); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const onPdf = (f) => {
    if (!f) return;
    if (f.type !== 'application/pdf') { setError(L('الملف يجب أن يكون PDF.', 'File must be a PDF.')); return; }
    if (!f.size) { setError(L('الملف فارغ.', 'File is empty.')); return; }
    setPdfFile(f);
  };

  const buildHtml = () => buildEmailHtml({
    subject: form.subject, body: form.body,
    ctaLabel: form.cta_label, ctaUrl: form.cta_url,
    signature: form.signature, imageUrl: imagePreview,
    pdfUrl: pdfFile ? '#pdf-preview' : '',
    recipientName: L('عميلنا العزيز', 'there'), senderName: form.sender_name, lang,
    unsubLink: '#unsub-preview',
  });

  const applyTemplate = (id) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setForm((f) => ({
      ...f,
      subject: tpl.subject || f.subject,
      body: tpl.body || f.body,
      cta_label: tpl.cta_label || f.cta_label,
      cta_url: tpl.cta_url || f.cta_url,
      signature: tpl.signature || f.signature,
    }));
  };

  const onSenderChange = (email) => {
    const found = senderEmails.find((x) => x.email === email);
    set('sender_email', email);
    if (found && found.name) set('sender_name', found.name);
  };

  // Save the cleaned list to DB once (reused across draft / send / schedule).
  const ensureList = async () => {
    if (savedListId) return savedListId;
    if (!analysis || !analysis.validRows.length) throw new Error(L('لا توجد بريدات صالحة.', 'No valid emails.'));
    const name = listName.trim() || fileName.replace(/\.(xlsx|xls|csv)$/i, '') || L('قائمة ملف', 'File list');
    const listRec = await pb.collection('marketing_lists').create({
      name, owner: user.id,
      total: analysis.stats.total, valid: analysis.stats.valid,
      invalid_count: analysis.stats.invalid, duplicate_count: analysis.stats.duplicate,
      in_platform: 0,
    }, { requestKey: `mkt-list-new-${Date.now()}` });
    await Promise.all(analysis.validRows.map((r, i) =>
      pb.collection('marketing_contacts').create({
        list: listRec.id, email: r.email, name: r.name, country: r.country, city: r.city, company: r.company, phone: r.phone,
      }, { requestKey: `mkt-ct-${listRec.id}-${i}` })
    ));
    setSavedListId(listRec.id);
    return listRec.id;
  };

  const persistCampaign = async (status, scheduledAtISO) => {
    if (!form.subject.trim() || !form.body.trim()) {
      throw new Error(L('الموضوع ونص الرسالة مطلوبة.', 'Subject and body are required.'));
    }
    const listId = await ensureList();
    const fd = new FormData();
    Object.entries({
      owner: user.id,
      name: (listName.trim() || form.subject.trim()).slice(0, 200),
      subject: form.subject, body: form.body,
      cta_label: form.cta_label, cta_url: form.cta_url, signature: form.signature,
      image_url: '', source: 'list',
      account_filter: 'all', country_filter: '', city_filter: '', status_filter: 'all',
      status, sender_name: form.sender_name, sender_email: form.sender_email,
    }).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
    fd.append('list_ids', JSON.stringify([listId]));
    if (scheduledAtISO) fd.append('scheduled_at', scheduledAtISO);
    if (imageFile) fd.append('image_file', imageFile);
    if (pdfFile) fd.append('pdf_file', pdfFile);
    return pb.collection('marketing_campaigns').create(fd, { requestKey: `mkt-file-create-${Date.now()}` });
  };

  const saveDraft = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await persistCampaign('draft', '');
      flash(L('تم حفظ المسودة.', 'Draft saved.'));
      onSaved();
    } catch (err) {
      setError(String(err?.message || L('تعذر الحفظ.', 'Failed to save.')));
    } finally { setBusy(false); }
  };

  const scheduleCampaign = async () => {
    if (busy) return;
    const y = Number(schedule.year), mo = Number(schedule.month), d = Number(schedule.day);
    const h = Number(schedule.hour), mi = Number(schedule.minute);
    if (d > daysInMonth(y, mo)) { setError(L('اليوم غير صالح لهذا الشهر.', 'Day is invalid for this month.')); return; }
    const iso = zonedToISO(y, mo, d, h, mi, schedule.tz);
    if (new Date(iso).getTime() <= Date.now()) { setError(L('وقت الجدولة يجب أن يكون في المستقبل.', 'Scheduled time must be in the future.')); return; }
    setBusy(true); setError('');
    try {
      await persistCampaign('scheduled', iso);
      flash(L('تمت جدولة الحملة. تُرسل تلقائياً عند فتح لوحة التسويق في الموعد أو بعده.', 'Campaign scheduled. It sends automatically when the Marketing panel is opened at or after the scheduled time.'));
      onSaved();
    } catch (err) {
      setError(String(err?.message || L('تعذر الجدولة.', 'Failed to schedule.')));
    } finally { setBusy(false); }
  };

  const sendNow = async () => {
    if (busy || sending) return; // prevent double send
    if (!analysis || analysis.stats.finalReady <= 0) { setError(L('لا يوجد مستلمون.', 'No recipients.')); return; }
    if (!form.sender_email) { setError(L('اختر بريد المرسل أولاً.', 'Select a sender email first.')); return; }
    setBusy(true); setSending(true); setError('');
    setSendProgress({ sent: 0, failed: 0, remaining: analysis.stats.finalReady, done: false, background: false });
    try {
      const rec = await persistCampaign('sending', '');
      // Small-batch loop: each request sends <= 25 recipients server-side
      // and returns authoritative progress. This keeps every request well
      // under the reverse-proxy timeout so the campaign actually completes
      // instead of hanging in "Sending". The backend skips already-delivered
      // recipients, so a dropped connection + retry never duplicates sends.
      const { lastRes, lastErr } = await dispatchCampaignBatched(rec.id, batchSize, (res) => {
        setSendProgress({ sent: res.sentCount, failed: res.failedCount, remaining: res.remaining, done: res.done, background: false });
      });
      if (lastRes) {
        setSendProgress({ sent: lastRes.sentCount, failed: lastRes.failedCount, remaining: lastRes.remaining, done: lastRes.done, background: false });
        if (lastRes.finalStatus === 'failed' || lastRes.finalStatus === 'partially_failed') {
          setError((lastRes.lastError ? (lastRes.lastError + ' — ') : '') + L('لم يكتمل الإرسال بالكامل. راجع سجل الحملة.', 'Sending did not fully complete. Check the campaign log.'));
        } else if (!lastErr) {
          flash(L('تم إرسال الحملة بنجاح.', 'Campaign sent successfully.'));
        }
      }
      if (lastErr && (!lastRes || lastRes.remaining > 0)) {
        setError(String(lastErr?.message || L('انقطع الإرسال. تم إصلاح حالة الحملة — استخدم "إعادة المحاولة" لإكمال المتبقي.', 'Sending was interrupted. The campaign status was fixed — use "Retry" to finish the remaining recipients.')));
      }
      onSaved();
    } catch (err) {
      setError(String(err?.message || L('تعذر إكمال الإرسال.', 'Failed to complete sending.')));
    } finally {
      setBusy(false); setSending(false);
    }
  };

  // ---- upload-only state (before a file is analyzed) ----
  if (!analysis) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <StepBadge n={1} />
          <h3 className="font-bold">{L('رفع ملف Excel / CSV', 'Upload Excel / CSV File')}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{L('ارفع ملف Excel (.xlsx, .xls) أو CSV. يُكتشف عمود البريد تلقائياً وتُحذف البريدات الفارغة وغير الصالحة والمكررة. لا تُعرض الإيميلات كاملة افتراضياً.', 'Upload Excel (.xlsx, .xls) or CSV. The email column is auto-detected; empty, invalid and duplicate emails are removed. Emails are not listed in full by default.')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="min-h-[44px]"><Upload size={16} className="me-1" />{importing ? L('جارٍ القراءة…', 'Reading…') : L('رفع ملف', 'Upload File')}</Button>
        </div>
      </div>
    );
  }

  const s = analysis.stats;

  return (
    <div className="space-y-5">
      {/* Step 1 — Auto analysis */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StepBadge n={1} />
            <h3 className="font-bold">{L('تحليل الملف تلقائيًا', 'Auto File Analysis')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowDetails(true)} className="min-h-[36px]"><Eye size={14} className="me-1" />{L('عرض التفاصيل', 'View Details')}</Button>
            <Button type="button" variant="outline" size="sm" onClick={reset} className="min-h-[36px]"><Upload size={14} className="me-1" />{L('ملف آخر', 'Another file')}</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground" dir="auto">{fileName}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile label={L('إجمالي الإيميلات', 'Total Emails')} value={s.total} icon={Mail} tone="slate" L={L} />
          <StatTile label={L('الإيميلات الصحيحة', 'Valid Emails')} value={s.valid} icon={CheckCircle2} tone="emerald" L={L} />
          <StatTile label={L('الإيميلات غير الصحيحة', 'Invalid Emails')} value={s.invalid} icon={XCircle} tone="red" L={L} />
          <StatTile label={L('الإيميلات المكررة', 'Duplicates')} value={s.duplicate} icon={FileSpreadsheet} tone="amber" L={L} />
          <StatTile label={L('العدد النهائي الجاهز للإرسال', 'Final Count Ready to Send')} value={s.finalReady} icon={Send} tone="primary" L={L} />
        </div>
        <p className="text-[11px] text-muted-foreground">{L('لا تُعرض قائمة الإيميلات كاملة افتراضياً. اضغط "عرض التفاصيل" لرؤية حالة كل صف.', 'The full email list is not shown by default. Click "View Details" to see each row\'s status.')}</p>
      </div>

      {/* Step 2 — Sender */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <StepBadge n={2} />
          <h3 className="font-bold">{L('بيانات المرسل', 'Sender Details')}</h3>
        </div>
        {senderEmails.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{L('بريد المرسل', 'Sender Email')}</Label>
              <Select value={form.sender_email || '__none__'} onValueChange={(v) => v !== '__none__' && onSenderChange(v)}>
                <SelectTrigger className="min-h-[44px]"><SelectValue placeholder={L('اختر بريداً معتمداً', 'Select an approved email')} /></SelectTrigger>
                <SelectContent>
                  {senderEmails.map((se) => <SelectItem key={se.id} value={se.email}>{se.email}{se.name ? ` — ${se.name}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('اسم المرسل', 'Sender Name')}</Label>
              <Input value={form.sender_name} onChange={(e) => set('sender_name', e.target.value)} className="min-h-[44px]" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{L('لم تتم إضافة بريدات مرسل بعد. أضِفها من مركز التحكم ← إعدادات التسويق. يمكنك مؤقتاً إدخال اسم المرسل يدوياً.', 'No sender emails configured yet. Add them from Control Center → Marketing Settings. You can temporarily enter a sender name manually.')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{L('بريد المرسل (اختياري)', 'Sender Email (optional)')}</Label>
                <Input value={form.sender_email} onChange={(e) => set('sender_email', e.target.value)} dir="ltr" className="min-h-[44px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{L('اسم المرسل', 'Sender Name')}</Label>
                <Input value={form.sender_name} onChange={(e) => set('sender_name', e.target.value)} className="min-h-[44px]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 3 — Content */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StepBadge n={3} />
            <h3 className="font-bold">{L('محتوى الرسالة', 'Message Content')}</h3>
          </div>
          {templates.length > 0 && (
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="min-h-[36px] w-[200px] text-xs"><SelectValue placeholder={L('استخدام قالب', 'Use template')} /></SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{L('الموضوع', 'Subject')} *</Label>
          <Input value={form.subject} onChange={(e) => set('subject', e.target.value)} className="min-h-[44px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{L('نص الرسالة', 'Message')} * <span className="text-muted-foreground">({L('استخدم {{name}} للتخصيص', 'use {{name}} for personalization')})</span></Label>
          <Textarea value={form.body} onChange={(e) => set('body', e.target.value)} rows={6} className="min-h-[120px]" />
        </div>

        <div className="rounded-lg border bg-accent/20 p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">{L('إضافات اختيارية', 'Optional additions')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{L('نص زر CTA', 'CTA Button Label')}</Label>
              <Input value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} className="min-h-[44px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('رابط CTA', 'CTA URL')}</Label>
              <Input value={form.cta_url} onChange={(e) => set('cta_url', e.target.value)} dir="ltr" className="min-h-[44px]" placeholder="https://…" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{L('توقيع الرسالة', 'Signature')}</Label>
            <Textarea value={form.signature} onChange={(e) => set('signature', e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{L('رفع صورة', 'Image (optional)')}</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif" className="hidden" onChange={(e) => onImage(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" onClick={() => imageRef.current?.click()} className="min-h-[36px]"><Upload size={14} className="me-1" />{L('رفع صورة', 'Upload image')}</Button>
                {(imagePreview) && (
                  <div className="flex items-center gap-2">
                    <img src={imagePreview} alt="" className="h-16 w-16 rounded-lg object-cover border" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setImageFile(null); setImagePreview(''); if (imageRef.current) imageRef.current.value = ''; }} className="min-h-[36px] text-destructive"><Trash2 size={13} className="me-1" />{L('حذف', 'Remove')}</Button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{L('رفع PDF', 'PDF Attachment (optional)')}</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => onPdf(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" onClick={() => pdfRef.current?.click()} className="min-h-[36px]"><Paperclip size={14} className="me-1" />{L('رفع PDF', 'Upload PDF')}</Button>
                {pdfFile && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs" dir="ltr"><FileText size={14} className="text-primary" />{pdfFile.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setPdfFile(null); if (pdfRef.current) pdfRef.current.value = ''; }} className="min-h-[36px] text-destructive"><Trash2 size={13} className="me-1" />{L('حذف', 'Remove')}</Button>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{L('يُرفَق كرابط تنزيل داخل البريد لكل مستلم.', 'Included as a download link inside each recipient\'s email.')}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)} className="min-h-[36px]"><Eye size={14} className="me-1" />{showPreview ? L('إخفاء المعاينة', 'Hide preview') : L('معاينة', 'Preview')}</Button>
        </div>
        {showPreview && (
          <div className="rounded-lg border p-3 bg-background/50 max-h-[400px] overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: buildHtml() }} />
          </div>
        )}
      </div>

      {/* Step 4 — Scheduling */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <StepBadge n={4} />
          <h3 className="font-bold">{L('الجدولة', 'Scheduling')}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setScheduleMode('now')} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium min-h-[40px]', scheduleMode === 'now' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent')}><Send size={15} />{L('إرسال الآن', 'Send Now')}</button>
          <button type="button" onClick={() => setScheduleMode('schedule')} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium min-h-[40px]', scheduleMode === 'schedule' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent')}><CalendarClock size={15} />{L('جدولة', 'Schedule')}</button>
        </div>

        {scheduleMode === 'schedule' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{L('اليوم', 'Day')}</Label>
              <Select value={schedule.day} onValueChange={(v) => setSchedule((p) => ({ ...p, day: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: dayCount }, (_, i) => String(i + 1)).map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('الشهر', 'Month')}</Label>
              <Select value={schedule.month} onValueChange={(v) => setSchedule((p) => ({ ...p, month: v, day: String(Math.min(Number(p.day), daysInMonth(Number(p.year), Number(v)))) }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthNames.map((nm, i) => <SelectItem key={String(i + 1)} value={String(i + 1)}>{nm}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('السنة', 'Year')}</Label>
              <Select value={schedule.year} onValueChange={(v) => setSchedule((p) => ({ ...p, year: v, day: String(Math.min(Number(p.day), daysInMonth(Number(v), Number(p.month)))) }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[initNow.getFullYear(), initNow.getFullYear() + 1, initNow.getFullYear() + 2].map((y) => <SelectItem key={String(y)} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('الساعة', 'Hour')}</Label>
              <Select value={schedule.hour} onValueChange={(v) => setSchedule((p) => ({ ...p, hour: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => <SelectItem key={h} value={String(Number(h))}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('الدقيقة', 'Minute')}</Label>
              <Select value={schedule.minute} onValueChange={(v) => setSchedule((p) => ({ ...p, minute: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((mi) => <SelectItem key={mi} value={String(Number(mi))}>{mi}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('المنطقة الزمنية', 'Timezone')}</Label>
              <Select value={schedule.tz} onValueChange={(v) => setSchedule((p) => ({ ...p, tz: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {scheduleMode === 'schedule' && (
          <p className="text-[11px] text-muted-foreground">{L('تُرسل الحملة المجدولة تلقائياً عند فتح لوحة التسويق في الموعد أو بعده (لا يدعم النظام مهام خلفية مجدولة).', 'A scheduled campaign sends automatically when the Marketing panel is opened at or after the scheduled time (the platform does not run background scheduled jobs).')}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {scheduleMode === 'now' ? (
          <Button type="button" onClick={sendNow} disabled={busy || sending || s.finalReady === 0} className="min-h-[44px]"><Send size={15} className="me-1" />{sending ? L('جارٍ إرسال الحملة…', 'Sending campaign…') : L('إرسال الآن', 'Send Now')}</Button>
        ) : (
          <Button type="button" onClick={scheduleCampaign} disabled={busy} className="min-h-[44px]"><CalendarClock size={15} className="me-1" />{busy ? L('جارٍ الجدولة…', 'Scheduling…') : L('جدولة الحملة', 'Schedule Campaign')}</Button>
        )}
        <Button type="button" variant="outline" onClick={saveDraft} disabled={busy} className="min-h-[44px]"><Save size={15} className="me-1" />{busy ? L('جارٍ الحفظ…', 'Saving…') : L('حفظ كمسودة', 'Save Draft')}</Button>
      </div>

      {sending && sendProgress && (
        <div className="rounded-lg border bg-accent/30 p-4 text-sm space-y-2">
          <p className="font-medium">{sendProgress.background ? L('إرسال في الخلفية', 'Sending in the background') : L('تقدّم الإرسال', 'Send Progress')}</p>
          {!sendProgress.background && (
            <div className="h-2 rounded-full bg-background overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${sendProgress.done ? 100 : Math.min(100, Math.round(((sendProgress.sent + sendProgress.failed) / Math.max(1, sendProgress.sent + sendProgress.failed + sendProgress.remaining)) * 100))}%` }} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {L('مرسلة', 'Sent')}: {sendProgress.sent} · {L('فشل', 'Failed')}: {sendProgress.failed} · {L('متبقٍ', 'Remaining')}: {sendProgress.remaining}
          </p>
          <p className="text-[11px] text-muted-foreground">{L('يستمر الإرسال من الخادم حتى لو أغلقت المتصفح.', 'Sending continues from the server even if you close the browser.')}</p>
        </div>
      )}

      {/* View Details modal — per-row status (emails shown only here, on demand) */}
      {showDetails && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDetails(false)}>
          <div className="max-w-3xl w-full max-h-[85vh] overflow-y-auto rounded-2xl border bg-card p-5 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{L('تفاصيل التحليل', 'Analysis Details')}</h3>
              <button onClick={() => setShowDetails(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <p className="text-xs text-muted-foreground">{L('حالة كل صف في الملف بعد التنظيف.', 'Status of each row in the file after cleaning.')}</p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-accent/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">#</th>
                    <th className="px-3 py-2 text-start font-medium">{L('البريد', 'Email')}</th>
                    <th className="px-3 py-2 text-start font-medium">{L('الاسم', 'Name')}</th>
                    <th className="px-3 py-2 text-start font-medium">{L('الحالة', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {analysis.details.slice(0, 500).map((d, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 truncate" dir="ltr">{d.email}</td>
                      <td className="px-3 py-2 truncate">{d.name || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', d.status === 'valid' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : d.status === 'duplicate' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-red-100 text-red-800 border-red-200')}>
                          {d.status === 'valid' ? L('صالح', 'Valid') : d.status === 'duplicate' ? L('مكرر', 'Duplicate') : L('غير صالح', 'Invalid')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analysis.details.length > 500 && <p className="text-xs text-muted-foreground">{L(`+ ${analysis.details.length - 500} صف إضافي`, `+ ${analysis.details.length - 500} more rows`)}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
//  Campaigns list view (log) — enhanced performance table
// ===========================================================================
function CampaignsView({ campaigns, sends, L, lang, search, setSearch, period, setPeriod, statusFilter, setStatusFilter, onNew, onRefresh, flash, setError }) {
  const [busy, setBusy] = useState('');
  const [detail, setDetail] = useState(null);

  const openDetail = (c) => setDetail(c);

  const cancelCampaign = async (c) => {
    if (!window.confirm(L('إلغاء هذه الحملة؟', 'Cancel this campaign?'))) return;
    setBusy(c.id);
    try {
      await pb.collection('marketing_campaigns').update(c.id, { status: 'cancelled' }, { requestKey: `mkt-cancel-${c.id}` });
      flash(L('تم إلغاء الحملة.', 'Campaign cancelled.'));
      onRefresh();
    } catch (err) { setError(String(err?.message || L('حدث خطأ', 'Error'))); }
    finally { setBusy(''); }
  };

  const deleteCampaign = async (c) => {
    if (!window.confirm(L('حذف هذه الحملة نهائياً؟', 'Delete this campaign permanently?'))) return;
    setBusy(c.id);
    try {
      await pb.collection('marketing_campaigns').delete(c.id, { requestKey: `mkt-del-${c.id}` });
      flash(L('تم حذف الحملة.', 'Campaign deleted.'));
      onRefresh();
    } catch (err) { setError(String(err?.message || L('حدث خطأ', 'Error'))); }
    finally { setBusy(''); }
  };

  const retryCampaign = async (c) => {
    if (!window.confirm(L('إعادة إرسال المستلمين الفاشلين فقط؟ لن تُنشأ حملة مكررة.', 'Retry only failed recipients? No duplicate campaign will be created.'))) return;
    setBusy(c.id);
    try {
      const res = await mktFetch('/ef/marketing/retry', { method: 'POST', body: { campaignId: c.id } });
      if (res.finalStatus === 'failed' || res.finalStatus === 'partially_failed') {
        setError((res.lastError ? (res.lastError + ' — ') : '') + L('لم يكتمل الإرسال. راجع السجل.', 'Sending did not fully complete. Check the log.'));
      } else {
        flash(L('تمت إعادة الإرسال بنجاح.', 'Retry completed successfully.'));
      }
      onRefresh();
    } catch (err) { setError(String(err?.message || L('تعذّرت إعادة المحاولة.', 'Retry failed.'))); }
    finally { setBusy(''); }
  };

  const fixStuck = async () => {
    setBusy('fixstuck');
    try {
      const res = await mktFetch('/ef/marketing/fix-stuck', { method: 'POST', body: {} });
      flash(L(`تم إصلاح ${res.fixed} حملة عالقة.`, `Fixed ${res.fixed} stuck campaign(s).`));
      onRefresh();
    } catch (err) { setError(String(err?.message || L('حدث خطأ', 'Error'))); }
    finally { setBusy(''); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L('ابحث باسم الحملة أو العنوان…', 'Search by name or subject…')} className="ps-9 min-h-[44px]" />
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="min-h-[44px] w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L('كل الفترات', 'All time')}</SelectItem>
            <SelectItem value="7d">{L('آخر 7 أيام', 'Last 7 days')}</SelectItem>
            <SelectItem value="30d">{L('آخر 30 يوم', 'Last 30 days')}</SelectItem>
            <SelectItem value="year">{L('هذه السنة', 'This year')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-h-[44px] w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L('كل الحالات', 'All statuses')}</SelectItem>
            <SelectItem value="draft">{L('مسودة', 'Draft')}</SelectItem>
            <SelectItem value="scheduled">{L('مجدولة', 'Scheduled')}</SelectItem>
            <SelectItem value="queued">{L('في الطابور', 'Queued')}</SelectItem>
            <SelectItem value="sending">{L('قيد الإرسال', 'Sending')}</SelectItem>
            <SelectItem value="sent">{L('مكتملة', 'Sent')}</SelectItem>
            <SelectItem value="partially_failed">{L('فشل جزئي', 'Partial')}</SelectItem>
            <SelectItem value="failed">{L('فاشلة', 'Failed')}</SelectItem>
            <SelectItem value="cancelled">{L('ملغاة', 'Cancelled')}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={onNew} className="min-h-[44px]"><Plus size={16} className="me-1" />{L('جديدة', 'New')}</Button>
        <Button variant="outline" onClick={fixStuck} disabled={busy === 'fixstuck'} className="min-h-[44px]"><RefreshCw size={16} className="me-1" />{busy === 'fixstuck' ? L('جارٍ…', 'Fixing…') : L('إصلاح العالقة', 'Fix Stuck')}</Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyBox icon={Mail} message={L('لا توجد حملات مطابقة.', 'No matching campaigns.')} />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{L('الحملة', 'Campaign')}</th>
                  <th className="px-3 py-2 text-start font-medium">{L('النوع', 'Type')}</th>
                  <th className="px-3 py-2 text-start font-medium">{L('المرسل', 'Sender')}</th>
                  <th className="px-3 py-2 text-end font-medium">{L('مرسلة', 'Sent')}</th>
                  <th className="px-3 py-2 text-end font-medium">{L('فتح', 'Opened')}</th>
                  <th className="px-3 py-2 text-end font-medium">{L('نقر', 'Clicked')}</th>
                  <th className="px-3 py-2 text-end font-medium">{L('فشل', 'Failed')}</th>
                  <th className="px-3 py-2 text-start font-medium">{L('التاريخ', 'Date')}</th>
                  <th className="px-3 py-2 text-start font-medium">{L('الحالة', 'Status')}</th>
                  <th className="px-3 py-2 text-start font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {campaigns.map((c) => {
                  const cs = sends.filter((s) => (typeof s.campaign === 'string' ? s.campaign : s.campaign?.id) === c.id);
                  const delivered = cs.filter((s) => ['sent', 'opened', 'clicked'].includes(s.status)).length;
                  const opened = cs.filter((s) => ['opened', 'clicked'].includes(s.status)).length;
                  const clicked = cs.filter((s) => s.status === 'clicked').length;
                  const failed = cs.filter((s) => s.status === 'failed').length;
                  return (
                    <tr key={c.id} className="hover:bg-accent/30">
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => openDetail(c)} className="text-start">
                          <p className="font-medium truncate max-w-[200px]">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.subject}</p>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{sourceLabel(c.source, L)}</td>
                      <td className="px-3 py-2.5 text-xs truncate max-w-[160px]" dir="ltr">{c.sender_email || '—'}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{delivered}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{opened}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{clicked}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{failed}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDate(c.created, lang)}</td>
                      <td className="px-3 py-2.5"><CampaignStatusBadge status={c.status} L={L} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openDetail(c)} className="min-h-[32px] px-2"><Eye size={13} /></Button>
                          {(c.status === 'failed' || c.status === 'partially_failed' || c.status === 'sending' || c.status === 'queued') && (
                            <Button size="sm" variant="outline" onClick={() => retryCampaign(c)} disabled={busy === c.id} className="min-h-[32px] px-2" title={L('إعادة المحاولة', 'Retry')}><RotateCcw size={13} /></Button>
                          )}
                          {(c.status === 'sending' || c.status === 'scheduled' || c.status === 'queued') && (
                            <Button size="sm" variant="outline" onClick={() => cancelCampaign(c)} disabled={busy === c.id} className="min-h-[32px] px-2"><Ban size={13} /></Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteCampaign(c)} disabled={busy === c.id} className="min-h-[32px] px-2 text-destructive"><Trash2 size={13} /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <DetailModal campaign={detail} sends={sends.filter((s) => (typeof s.campaign === 'string' ? s.campaign : s.campaign?.id) === detail.id)} L={L} lang={lang} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function DetailModal({ campaign, sends, L, lang, onClose }) {
  const delivered = sends.filter((s) => ['sent', 'opened', 'clicked'].includes(s.status)).length;
  const failed = sends.filter((s) => s.status === 'failed').length;
  const opened = sends.filter((s) => ['opened', 'clicked'].includes(s.status)).length;
  const totalOpens = sends.reduce((a, s) => a + (Number(s.open_count) || 0), 0);
  const clicked = sends.filter((s) => s.status === 'clicked').length;
  const totalClicks = sends.reduce((a, s) => a + (Number(s.click_count) || 0), 0);
  const unsubscribed = sends.filter((s) => s.status === 'unsubscribed').length;
  const totalRecipients = Number(campaign.recipient_count) || sends.length;

  const rates = {
    delivery: pct(delivered, delivered + failed),
    open: pct(opened, delivered),
    click: pct(clicked, delivered),
    bounce: null, // unavailable
    unsub: pct(unsubscribed, delivered),
  };

  // top clicked links from click_count + the campaign CTA url
  const topLinks = useMemo(() => {
    const ctaUrl = campaign.cta_url || '';
    if (!ctaUrl) return [];
    const uniqueClickers = clicked;
    const totalCl = totalClicks;
    return [{ url: ctaUrl, clicks: totalCl, unique: uniqueClickers }];
  }, [campaign, clicked, totalClicks]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-w-2xl w-full max-h-[88vh] overflow-y-auto rounded-2xl border bg-card p-5 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg break-words">{campaign.name}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>

        {/* Status + progress + error */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CampaignStatusBadge status={campaign.status} L={L} />
            <span className="text-xs text-muted-foreground">{L('الحالة', 'Status')}</span>
            {totalRecipients > 0 && (
              <span className="ms-auto text-xs text-muted-foreground">
                {L('التقدم', 'Progress')}: {delivered + failed} / {totalRecipients} ({pct(delivered + failed, totalRecipients)}%)
              </span>
            )}
          </div>
          {totalRecipients > 0 && (
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${pct(delivered + failed, totalRecipients)}%` }} />
            </div>
          )}
          {campaign.last_error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <p className="font-semibold">{L('سبب الفشل', 'Failure reason')}</p>
              <p className="mt-1 whitespace-pre-wrap">{campaign.last_error}</p>
            </div>
          )}
        </div>

        {/* Overview counts */}
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{L('نظرة عامة', 'Overview')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <StatPill label={L('إجمالي المستلمين', 'Total Recipients')} value={totalRecipients} tone="slate" />
            <StatPill label={L('تم التسليم', 'Delivered')} value={delivered} tone="emerald" />
            <StatPill label={L('فشل', 'Failed')} value={failed} tone="red" />
            <StatPill label={L('فتح فريد', 'Unique Opens')} value={opened} tone="sky" />
            <StatPill label={L('إجمالي الفتح', 'Total Opens')} value={totalOpens} tone="sky" />
            <StatPill label={L('نقر فريد', 'Unique Clicks')} value={clicked} tone="violet" />
            <StatPill label={L('إجمالي النقر', 'Total Clicks')} value={totalClicks} tone="violet" />
            <StatPill label={L('إلغاء اشتراك', 'Unsubscribed')} value={unsubscribed} tone="slate" />
          </div>
        </div>

        {/* Rates */}
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{L('النسب', 'Rates')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
            <StatPill label={L('نسبة التسليم', 'Delivery Rate')} value={`${rates.delivery}%`} tone="emerald" />
            <StatPill label={L('نسبة الفتح', 'Open Rate')} value={`${rates.open}%`} tone="sky" />
            <StatPill label={L('نسبة النقر', 'Click Rate')} value={`${rates.click}%`} tone="violet" />
            <StatPill label={L('الارتداد', 'Bounce Rate')} value={L('غير متاح', 'Unavailable')} tone="slate" />
            <StatPill label={L('إلغاء الاشتراك', 'Unsub Rate')} value={`${rates.unsub}%`} tone="slate" />
          </div>
          <p className="text-[11px] text-muted-foreground">{L('"تم التسليم" تعني التسليم لمزوّد البريد، وليس تأكيد وصوله للبريد الوارد. الفتح/النقر يُقاسان عبر بكسل/رابط حقيقي (متاحان دون Webhook). تأكيد التسليم والارتداد يتطلب ربط Webhook من مزوّد البريد — وإلا فالارتداد غير متاح.', '"Delivered" means handed to the email provider, not confirmed inbox delivery. Opens/clicks are measured via a real pixel/link (available without a webhook). Delivery & bounce confirmation require a provider webhook — otherwise bounce rate is unavailable.')}</p>
        </div>

        {/* Audience */}
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{L('الجمهور', 'Audience')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <Field label={L('نوع الحساب', 'Account Type')} value={accountLabel(campaign.account_filter, L)} />
            <Field label={L('الدولة', 'Country')} value={campaign.country_filter || L('الكل', 'All')} />
            <Field label={L('حالة الحساب', 'Account Status')} value={campaign.status_filter || L('الكل', 'All')} />
            <Field label={L('المصدر', 'Source')} value={sourceLabel(campaign.source, L)} />
          </div>
        </div>

        {/* Message */}
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{L('الرسالة', 'Message')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <Field label={L('بريد المرسل', 'Sender Email')} value={campaign.sender_email || '—'} />
            <Field label={L('اسم المرسل', 'Sender Name')} value={campaign.sender_name || '—'} />
            <Field label={L('عنوان البريد', 'Subject')} value={campaign.subject} />
            <Field label={L('رابط CTA', 'CTA Link')} value={campaign.cta_url || '—'} />
          </div>
          {campaign.body && (
            <div className="rounded-lg border bg-background/50 p-3 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">{campaign.body}</div>
          )}
        </div>

        {/* Top clicked links */}
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{L('أكثر الروابط نقراً', 'Top Clicked Links')}</p>
          {topLinks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{L('لا توجد روابط في هذه الحملة.', 'No links in this campaign.')}</p>
          ) : (
            <div className="divide-y">
              {topLinks.map((l, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="flex-1 truncate" dir="ltr">{l.url}</span>
                  <span className="text-muted-foreground">{L('نقرات', 'Clicks')}: {l.clicks}</span>
                  <span className="text-muted-foreground">{L('فريد', 'Unique')}: {l.unique}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Devices / Email clients / Top countries — honest unavailable */}
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{L('الأجهزة • برامج البريد • الدول', 'Devices • Email Clients • Countries')}</p>
          <p className="text-xs text-muted-foreground">{L('غير متاح حتى يتم ربط مزود بريد يدعم هذه البيانات عبر Webhook.', 'Unavailable until an email provider that exposes this data via Webhook is connected.')}</p>
        </div>

        {/* Send log */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">{L('سجل الإرسال', 'Send log')}</p>
          {sends.length === 0 ? (
            <p className="text-sm text-muted-foreground">{L('لا توجد سجلات بعد.', 'No send records yet.')}</p>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
              {sends.slice(0, 200).map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="flex-1 truncate" dir="ltr">{s.email}</span>
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold', s.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : s.status === 'failed' ? 'bg-red-100 text-red-800' : s.status === 'opened' ? 'bg-sky-100 text-sky-800' : s.status === 'clicked' ? 'bg-violet-100 text-violet-800' : s.status === 'unsubscribed' ? 'bg-slate-200 text-slate-700' : 'bg-secondary')}>{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    red: 'bg-red-50 text-red-800 border-red-200',
    sky: 'bg-sky-50 text-sky-800 border-sky-200',
    violet: 'bg-violet-50 text-violet-800 border-violet-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={cn('rounded-lg border px-3 py-2', tones[tone] || tones.slate)}>
      <p className="text-[11px] opacity-80">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function CampaignStatusBadge({ status, L }) {
  const map = {
    draft: { cls: 'bg-slate-100 text-slate-700 border-slate-200', ar: 'مسودة', en: 'Draft' },
    scheduled: { cls: 'bg-sky-100 text-sky-800 border-sky-200', ar: 'مجدولة', en: 'Scheduled' },
    queued: { cls: 'bg-indigo-100 text-indigo-800 border-indigo-200', ar: 'في الطابور', en: 'Queued' },
    sending: { cls: 'bg-amber-100 text-amber-800 border-amber-200', ar: 'قيد الإرسال', en: 'Sending' },
    sent: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', ar: 'مكتملة', en: 'Sent' },
    partially_failed: { cls: 'bg-orange-100 text-orange-800 border-orange-200', ar: 'فشل جزئي', en: 'Partial' },
    failed: { cls: 'bg-red-100 text-red-800 border-red-200', ar: 'فاشلة', en: 'Failed' },
    cancelled: { cls: 'bg-slate-200 text-slate-700 border-slate-300', ar: 'ملغاة', en: 'Cancelled' },
  };
  const m = map[status] || map.draft;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', m.cls)}>
      {L(m.ar, m.en)}
    </span>
  );
}

// ===========================================================================
//  Suppression list view
// ===========================================================================
function SuppressionView({ unsubscribes, L, search, setSearch, onRefresh, flash }) {
  const [manualEmail, setManualEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const addManual = async () => {
    const e = norm(manualEmail);
    if (!EMAIL_RE.test(e)) { flash(L('بريد غير صالح.', 'Invalid email.')); return; }
    setAdding(true);
    try {
      await pb.collection('marketing_unsubscribes').create({ email: e, reason: 'manual' }, { requestKey: `mkt-unsub-add-${Date.now()}` });
      flash(L('تمت الإضافة لقائمة عدم الإرسال.', 'Added to suppression list.'));
      setManualEmail('');
      onRefresh();
    } catch (err) {
      if (String(err?.message || '').includes('unique') || err?.status === 400) {
        flash(L('البريد موجود مسبقاً في القائمة.', 'Email already in suppression list.'));
      } else {
        flash(String(err?.message || L('تعذر الإضافة.', 'Failed to add.')));
      }
    } finally { setAdding(false); }
  };

  const remove = async (u) => {
    if (!window.confirm(L('إزالة هذا البريد من قائمة عدم الإرسال؟', 'Remove this email from suppression?'))) return;
    try {
      await pb.collection('marketing_unsubscribes').delete(u.id, { requestKey: `mkt-unsub-del-${u.id}` });
      flash(L('تمت الإزالة.', 'Removed.'));
      onRefresh();
    } catch (err) { flash(String(err?.message || L('تعذر الإزالة.', 'Failed.'))); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h3 className="font-bold">{L('قائمة عدم الإرسال', 'Suppression List')}</h3>
        <p className="text-xs text-muted-foreground">{L('من ألغى الاشتراك أو البريدات غير الصالحة — لا تُرسل لهم حملات تسويقية مستقبلاً. يستمرون في استلام رسائل الحساب والأمان الضرورية. تُحدّث القائمة تلقائياً عند إلغاء الاشتراك أو الارتداد أو شكوى السبام أو الحظر اليدوي.', 'Unsubscribed and invalid emails — never sent marketing campaigns. They still receive essential account & security emails. The list auto-updates on unsubscribe, hard bounce, spam complaint, or manual block.')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} dir="ltr" placeholder={L('أضف بريداً يدوياً…', 'Add email manually…')} className="min-h-[44px] max-w-xs" />
          <Button onClick={addManual} disabled={adding} className="min-h-[44px]"><Plus size={14} className="me-1" />{L('إضافة', 'Add')}</Button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L('ابحث في القائمة…', 'Search suppression list…')} className="ps-9 min-h-[44px]" />
      </div>

      {unsubscribes.length === 0 ? (
        <EmptyBox icon={Ban} message={L('لا توجد بريدات في القائمة.', 'No suppressed emails.')} />
      ) : (
        <div className="space-y-2">
          {unsubscribes.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
              <Ban size={15} className="text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm truncate" dir="ltr">{u.email}</span>
              <span className="text-xs text-muted-foreground">{u.reason || '—'}</span>
              <Button size="sm" variant="ghost" onClick={() => remove(u)} className="min-h-[36px] text-destructive"><Trash2 size={13} /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
//  small shared bits
// ===========================================================================
function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium break-words" dir="auto">{value || '—'}</p>
    </div>
  );
}
function EmptyBox({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><Icon size={22} strokeWidth={1.6} /></span>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
function sourceLabel(s, L) {
  if (s === 'platform') return L('مستخدمو المنصة', 'Platform Users');
  if (s === 'list') return L('من ملف', 'From File');
  return L('الاثنان', 'Both');
}
function accountLabel(v, L) {
  if (v === 'owner') return L('ملاك', 'Owners');
  if (v === 'broker') return L('وسطاء', 'Brokers');
  if (v === 'company') return L('شركات', 'Companies');
  return L('الكل', 'All');
}

export default MarketingPanel;
