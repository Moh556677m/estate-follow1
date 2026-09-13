import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  Globe2,
  Users,
  TrendingUp,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Activity,
  MousePointerClick,
  ChevronDown,
  ChevronRight,
  Crown,
  Clock,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { countryName } from '@/lib/countries';
import NationalityField from '@/components/NationalityField';
import { cn } from '@/lib/utils';

const CHART_COLORS = [
  '#22C55E',
  '#16A34A',
  '#15803D',
  '#86EFAC',
  '#0EA5E9',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#14B8A6',
];

const STAFF_ROLES = ['admin', 'editor', 'support', 'custom'];

function accountKind(u) {
  if (!u) return 'owner';
  if (u.is_super_admin) return 'super_admin';
  if (STAFF_ROLES.includes(u.role)) return 'staff';
  return 'owner';
}

function userCountry(u) {
  if (!u) return null;
  const kind = accountKind(u);
  if (kind === 'staff' || kind === 'super_admin') return null;
  return u.nationality || null;
}

function parseCities(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') return x.name || x.city || x.city_en || x.city_ar || '';
        return '';
      })
      .filter(Boolean);
  }
  if (typeof val === 'string') {
    try {
      return parseCities(JSON.parse(val));
    } catch {
      return [val];
    }
  }
  return [];
}

function periodStartDate(period) {
  const now = new Date();
  if (period === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === '7d') return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  if (period === '30d') return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'year') return new Date(now.getFullYear(), 0, 1);
  return new Date(0);
}

function pct(n, total) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 1000) / 10}%`;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key, lang) {
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString(lang === 'ar' ? 'ar' : 'en', {
    month: 'short',
    year: '2-digit',
  });
}

const UserAnalytics = () => {
  const { t, lang } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [users, setUsers] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [branches, setBranches] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [visits, setVisits] = useState([]);

  const [accountType, setAccountType] = useState('all');
  const [period, setPeriod] = useState('all');
  const [country, setCountry] = useState('all');
  const [expandedCountry, setExpandedCountry] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [u, b, c, br, sess, vis] = await Promise.all([
        pb.collection('users').getFullList({ sort: '-created' }).catch(() => []),
        pb.collection('brokers').getFullList({ sort: '-created' }).catch(() => []),
        pb.collection('brokerage_companies').getFullList({ sort: '-created' }).catch(() => []),
        pb.collection('brokerage_branches').getFullList({ sort: '-created' }).catch(() => []),
        pb.collection('user_sessions').getFullList({ sort: '-created' }).catch(() => []),
        pb.collection('analytics_visits').getFullList({ sort: '-created' }).catch(() => []),
      ]);
      setUsers(u || []);
      setBrokers(b || []);
      setCompanies(c || []);
      setBranches(br || []);
      setSessions(sess || []);
      setVisits(vis || []);
    } catch {
      setError(t('something_wrong'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const cols = [
      'users',
      'brokers',
      'brokerage_companies',
      'brokerage_branches',
      'user_sessions',
      'analytics_visits',
      'activity_logs',
    ];
    let debounce = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => load(), 600);
    };
    cols.forEach((c) => {
      void pb.collection(c).subscribe('*', schedule).catch(() => {});
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      cols.forEach((c) => {
        void pb.collection(c).unsubscribe('*').catch(() => {});
      });
    };
  }, [load]);

  const endUsers = useMemo(
    () =>
      users.filter((u) => {
        const k = accountKind(u);
        return k === 'owner';
      }),
    [users],
  );

  const filteredEndUsers = useMemo(
    () =>
      endUsers.filter((u) => {
        if (country !== 'all') {
          const uc = userCountry(u);
          if (String(uc || '').toUpperCase() !== String(country).toUpperCase()) return false;
        }
        return true;
      }),
    [endUsers, country],
  );

  const countryStats = useMemo(() => {
    const map = {};
    filteredEndUsers.forEach((u) => {
      const c = userCountry(u);
      if (!c) return;
      const code = String(c).toUpperCase();
      if (!map[code]) map[code] = { code, total: 0 };
      map[code].total += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredEndUsers]);

  const totalFiltered = filteredEndUsers.length;

  const citiesByCountry = useMemo(() => {
    const map = {};
    const addCity = (countryCode, city) => {
      if (!countryCode || !city) return;
      const code = String(countryCode).toUpperCase();
      const name = String(city).trim();
      if (!name) return;
      if (!map[code]) map[code] = {};
      map[code][name] = (map[code][name] || 0) + 1;
    };
    brokers.forEach((b) => {
      const code = String(b.country || '').toUpperCase();
      parseCities(b.cities).forEach((city) => addCity(code, city));
    });
    companies.forEach((c) => {
      const code = String(c.country || '').toUpperCase();
      parseCities(c.cities).forEach((city) => addCity(code, city));
    });
    branches.forEach((br) => {
      if (br.city) addCity(br.country, br.city);
    });
    const out = {};
    Object.keys(map).forEach((code) => {
      out[code] = Object.entries(map[code])
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count);
    });
    return out;
  }, [brokers, companies, branches]);

  const deviceStats = useMemo(() => {
    const map = {};
    const add = (key) => {
      if (!key) return;
      const k = String(key);
      map[k] = (map[k] || 0) + 1;
    };
    visits.forEach((v) => add(v.device_type));
    sessions.forEach((s) => add(s.device_type));
    return Object.entries(map)
      .map(([name, count]) => ({ name: name || 'Unknown', count }))
      .sort((a, b) => b.count - a.count);
  }, [visits, sessions]);

  const browserStats = useMemo(() => {
    const map = {};
    const add = (key) => {
      if (!key) return;
      const k = String(key);
      map[k] = (map[k] || 0) + 1;
    };
    visits.forEach((v) => add(v.browser));
    sessions.forEach((s) => add(s.browser));
    return Object.entries(map)
      .map(([name, count]) => ({ name: name || 'Unknown', count }))
      .sort((a, b) => b.count - a.count);
  }, [visits, sessions]);

  const osStats = useMemo(() => {
    const map = {};
    visits.forEach((v) => {
      const k = v.os || 'Unknown';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name: name || 'Unknown', count }))
      .sort((a, b) => b.count - a.count);
  }, [visits]);

  const activeStats = useMemo(() => {
    const nowMs = Date.now();
    const uniqueIn = (ms) => {
      const since = nowMs - ms;
      const set = new Set();
      visits.forEach((v) => {
        const ts = new Date(v.created).getTime();
        if (ts >= since && v.user) set.add(v.user);
      });
      return set.size;
    };
    return {
      now: uniqueIn(5 * 60 * 1000),
      d24: uniqueIn(24 * 3600 * 1000),
      d7: uniqueIn(7 * 24 * 3600 * 1000),
      d30: uniqueIn(30 * 24 * 3600 * 1000),
      total: endUsers.length,
    };
  }, [visits, endUsers]);

  const newUsersStats = useMemo(() => {
    const startMs = periodStartDate(period).getTime();
    const nowMs = Date.now();
    const inPeriod = endUsers.filter((u) => new Date(u.created).getTime() >= startMs);
    const breakdown = { owners: inPeriod.length };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const today = endUsers.filter((u) => new Date(u.created).getTime() >= todayMs).length;
    const d7 = endUsers.filter((u) => new Date(u.created).getTime() >= nowMs - 7 * 24 * 3600 * 1000).length;
    const d30 = endUsers.filter((u) => new Date(u.created).getTime() >= nowMs - 30 * 24 * 3600 * 1000).length;

    const byMonth = {};
    const months = [];
    const base = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = monthKey(d);
      months.push(key);
      byMonth[key] = { owners: 0, total: 0 };
    }
    endUsers.forEach((u) => {
      const key = monthKey(new Date(u.created));
      if (!byMonth[key]) return;
      byMonth[key].total += 1;
      byMonth[key].owners += 1;
    });

    const byYearMap = {};
    endUsers.forEach((u) => {
      const y = String(new Date(u.created).getFullYear());
      if (!byYearMap[y]) byYearMap[y] = { owners: 0, total: 0 };
      byYearMap[y].total += 1;
      byYearMap[y].owners += 1;
    });
    const byYear = Object.entries(byYearMap)
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => Number(a.year) - Number(b.year));

    return {
      inPeriod: inPeriod.length,
      breakdown,
      today,
      d7,
      d30,
      byMonth: months.map((key) => ({ key, ...byMonth[key] })),
      byYear,
    };
  }, [endUsers, period]);

  const registrationsByCountry = useMemo(() => {
    const startMs = periodStartDate(period).getTime();
    const map = {};
    endUsers.forEach((u) => {
      if (new Date(u.created).getTime() < startMs) return;
      const c = userCountry(u);
      if (!c) return;
      const code = String(c).toUpperCase();
      if (!map[code]) map[code] = 0;
      map[code] += 1;
    });
    return Object.entries(map)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [endUsers, period]);

  const visitStats = useMemo(() => {
    const startMs = periodStartDate(period).getTime();
    const inPeriod = visits.filter((v) => new Date(v.created).getTime() >= startMs);
    const uniqueUsers = new Set(inPeriod.map((v) => v.user).filter(Boolean)).size;
    const totalVisits = inPeriod.length;
    const logins = sessions.filter((s) => new Date(s.created).getTime() >= startMs).length;
    const avg = uniqueUsers ? Math.round((totalVisits / uniqueUsers) * 10) / 10 : 0;

    const pageMap = {};
    inPeriod.forEach((v) => {
      const p = v.page || '—';
      pageMap[p] = (pageMap[p] || 0) + 1;
    });
    const topPages = Object.entries(pageMap)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const sectionMap = {};
    inPeriod.forEach((v) => {
      const s = v.section || '—';
      if (s === '—') return;
      sectionMap[s] = (sectionMap[s] || 0) + 1;
    });
    const topSections = Object.entries(sectionMap)
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return { totalVisits, uniqueUsers, logins, avg, topPages, topSections };
  }, [visits, sessions, period]);

  const topCountry = countryStats[0] || null;
  const distinctCountries = countryStats.length;

  const deviceIcon = (name) => {
    const n = String(name).toLowerCase();
    if (n.includes('mobile')) return Smartphone;
    if (n.includes('tablet')) return Tablet;
    return Monitor;
  };

  const pageTitle = `${t('nav_user_analytics')} — Estate Follow | ${t('nav_user_analytics')} — إستيت فولو`;

  if (loading) {
    return <div className="py-16 text-center text-muted-foreground">{t('loading')}</div>;
  }

  if (error) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-destructive">{error}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent min-h-[36px]"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Helmet>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content="User Analytics — platform usage by country, city, device, browser, OS and visits | تحليلات المستخدمين"
        />
      </Helmet>

      {/* Filters */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('analytics_filter_account_type')}
            </label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('analytics_all_users')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('analytics_filter_period')}
            </label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t('analytics_period_today')}</SelectItem>
                <SelectItem value="7d">{t('analytics_period_7d')}</SelectItem>
                <SelectItem value="30d">{t('analytics_period_30d')}</SelectItem>
                <SelectItem value="month">{t('analytics_period_month')}</SelectItem>
                <SelectItem value="year">{t('analytics_period_year')}</SelectItem>
                <SelectItem value="all">{t('analytics_period_all')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('analytics_filter_country')}
            </label>
            <NationalityField
              value={country}
              onChange={setCountry}
              placeholder={t('analytics_filter_country')}
              heightClass="min-h-[44px]"
              allOption={{ value: 'all', label: t('all') }}
            />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard icon={Globe2} label={t('analytics_distinct_countries')} value={distinctCountries} />
        <SummaryCard
          icon={Crown}
          label={t('analytics_top_country')}
          value={topCountry ? countryName(topCountry.code, lang) : '—'}
          sub={topCountry ? `${topCountry.total} ${t('analytics_users_unit')}` : null}
        />
        <SummaryCard icon={Users} label={t('analytics_total_users')} value={totalFiltered} />
      </div>

      {/* 1. Users by country */}
      <SectionCard icon={Globe2} title={t('analytics_users_by_country')}>
        {countryStats.length === 0 ? (
          <EmptyRow message={t('analytics_no_data')} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              {countryStats.slice(0, 12).map((row) => (
                <div key={row.code} className="rounded-lg border bg-background/50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCountry(expandedCountry === row.code ? null : row.code)
                      }
                      className="flex items-center gap-2 text-sm font-medium hover:text-primary min-h-[36px]"
                    >
                      {expandedCountry === row.code ? (
                        <ChevronDown size={15} />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                      {countryName(row.code, lang)}
                    </button>
                    <span className="text-sm font-bold tabular-nums">{row.total}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: pct(row.total, totalFiltered) }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-12 text-end">
                      {pct(row.total, totalFiltered)}
                    </span>
                  </div>

                  {expandedCountry === row.code && (
                    <div className="mt-3 border-t pt-3 space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <MapPin size={12} /> {t('analytics_cities_in_country')}
                      </p>
                      {(citiesByCountry[row.code] || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('analytics_no_cities')}</p>
                      ) : (
                        (citiesByCountry[row.code] || []).map((c) => (
                          <div key={c.city} className="flex items-center justify-between text-xs">
                            <span className="truncate" dir="auto">{c.city}</span>
                            <span className="font-semibold tabular-nums">{c.count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={countryStats.slice(0, 10).map((r) => ({
                    name: countryName(r.code, lang),
                    users: r.total,
                  }))}
                  margin={{ top: 8, right: 8, left: -16, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="users" fill="#22C55E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </SectionCard>

      {/* 4-6. Devices / Browsers / OS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard icon={Monitor} title={t('analytics_devices')}>
          {deviceStats.length === 0 ? (
            <EmptyRow message={t('analytics_no_data')} />
          ) : (
            <DeviceList rows={deviceStats} iconFn={deviceIcon} />
          )}
        </SectionCard>
        <SectionCard icon={Globe2} title={t('analytics_browsers')}>
          {browserStats.length === 0 ? (
            <EmptyRow message={t('analytics_no_data')} />
          ) : (
            <SimpleStatList rows={browserStats} />
          )}
        </SectionCard>
        <SectionCard icon={Activity} title={t('analytics_os')}>
          {osStats.length === 0 ? (
            <EmptyRow message={t('analytics_no_data')} />
          ) : (
            <SimpleStatList rows={osStats} />
          )}
        </SectionCard>
      </div>

      {/* 7. Active users */}
      <SectionCard icon={Clock} title={t('analytics_active_users')}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MiniStat label={t('analytics_active_now')} value={activeStats.now} />
          <MiniStat label={t('analytics_active_24h')} value={activeStats.d24} />
          <MiniStat label={t('analytics_active_7d')} value={activeStats.d7} />
          <MiniStat label={t('analytics_active_30d')} value={activeStats.d30} />
          <MiniStat label={t('analytics_total')} value={activeStats.total} />
        </div>
      </SectionCard>

      {/* 8. New users */}
      <SectionCard icon={TrendingUp} title={t('analytics_new_users')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <MiniStat label={t('analytics_period_today')} value={newUsersStats.today} />
          <MiniStat label={t('analytics_period_7d')} value={newUsersStats.d7} />
          <MiniStat label={t('analytics_period_30d')} value={newUsersStats.d30} />
          <MiniStat
            label={t('analytics_in_period')}
            value={newUsersStats.inPeriod}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {t('analytics_new_by_month')}
            </p>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={newUsersStats.byMonth.map((m) => ({
                    name: monthLabel(m.key, lang),
                    total: m.total,
                  }))}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="total" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} name={t('analytics_total')} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {t('analytics_new_by_year')}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="py-2 px-2 text-start font-medium">{t('analytics_year')}</th>
                    <th className="py-2 px-2 text-end font-medium">{t('analytics_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {newUsersStats.byYear.map((y) => (
                    <tr key={y.year} className="border-b last:border-0">
                      <td className="py-2 px-2 font-medium tabular-nums">{y.year}</td>
                      <td className="py-2 px-2 text-end font-bold tabular-nums">{y.total}</td>
                    </tr>
                  ))}
                  {newUsersStats.byYear.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">
                        {t('analytics_no_data')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 9 + 10. Registrations by country / Top countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard icon={MapPin} title={t('analytics_registrations_by_country')}>
          {registrationsByCountry.length === 0 ? (
            <EmptyRow message={t('analytics_no_data')} />
          ) : (
            <div className="space-y-2">
              {registrationsByCountry.slice(0, 10).map((row, i) => (
                <div key={row.code} className="flex items-center gap-3 rounded-lg border bg-background/50 px-3 py-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate" dir="auto">
                    {countryName(row.code, lang)}
                  </span>
                  <span className="text-sm font-bold tabular-nums">{row.count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Crown} title={t('analytics_top_countries')}>
          {countryStats.length === 0 ? (
            <EmptyRow message={t('analytics_no_data')} />
          ) : (
            <div className="space-y-2">
              {countryStats.slice(0, 10).map((row, i) => (
                <div key={row.code} className="flex items-center gap-3 rounded-lg border bg-background/50 px-3 py-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                      i === 0 ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate" dir="auto">
                    {countryName(row.code, lang)}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:block h-2 w-24 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: pct(row.total, totalFiltered) }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-12 text-end">
                      {pct(row.total, totalFiltered)}
                    </span>
                    <span className="text-sm font-bold tabular-nums w-8 text-end">{row.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 11. Visit analytics */}
      <SectionCard icon={MousePointerClick} title={t('analytics_visit_analysis')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <MiniStat label={t('analytics_total_visits')} value={visitStats.totalVisits} />
          <MiniStat label={t('analytics_unique_users')} value={visitStats.uniqueUsers} />
          <MiniStat label={t('analytics_logins')} value={visitStats.logins} />
          <MiniStat label={t('analytics_avg_visits')} value={visitStats.avg} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t('analytics_top_pages')}</p>
            {visitStats.topPages.length === 0 ? (
              <EmptyRow message={t('analytics_no_data')} />
            ) : (
              <div className="space-y-1.5">
                {visitStats.topPages.map((p) => (
                  <div key={p.page} className="flex items-center justify-between text-xs">
                    <span className="truncate font-mono" dir="ltr">{p.page}</span>
                    <span className="font-semibold tabular-nums ms-2">{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t('analytics_top_sections')}</p>
            {visitStats.topSections.length === 0 ? (
              <EmptyRow message={t('analytics_no_data')} />
            ) : (
              <div className="space-y-1.5">
                {visitStats.topSections.map((s) => (
                  <div key={s.section} className="flex items-center justify-between text-xs">
                    <span className="truncate font-mono" dir="ltr">{s.section}</span>
                    <span className="font-semibold tabular-nums ms-2">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

function SummaryCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight break-words" dir="auto">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <h3 className="font-bold flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function MiniStat({ label, value, sub }) {
  return (
    <div className="rounded-lg border bg-background/50 p-3 text-center">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
      {sub && (
        <p className="mt-0.5 text-[10px] text-muted-foreground" dir="ltr">
          {sub}
        </p>
      )}
    </div>
  );
}

function EmptyRow({ message }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

function DeviceList({ rows, iconFn }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const Icon = iconFn(r.name);
        return (
          <div key={r.name} className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Icon size={15} />
            </span>
            <span className="flex-1 text-sm font-medium">{r.name}</span>
            <span className="text-sm font-bold tabular-nums">{r.count}</span>
            <span className="text-xs text-muted-foreground tabular-nums w-12 text-end">
              {pct(r.count, total)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SimpleStatList({ rows }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-sm shrink-0"
            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
          />
          <span className="flex-1 text-sm font-medium truncate">{r.name}</span>
          <span className="text-sm font-bold tabular-nums">{r.count}</span>
          <span className="text-xs text-muted-foreground tabular-nums w-12 text-end">
            {pct(r.count, total)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default UserAnalytics;
