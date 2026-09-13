import React, { useCallback, useEffect, useState } from 'react';
import {
  Infinity as InfinityIcon,
  Loader2,
  Pencil,
  Search,
  KeyRound,
  Trash2,
  Users,
  X,
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
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

// Special Access — a COMPLETELY SEPARATE admin system from paid subscriptions.
//
// This panel is Super Admin only (mounted only by AdminDashboard when
// isSuperAdmin). It lets the admin:
//   - search an owner by name / email
//   - grant a free numeric property limit (any number: 1, 2, 3, …) — not tied
//     to any package, trial, or Stripe payment
//   - or grant unlimited property addition
//   - or edit / remove a previously granted allowance
//
// Grants are stored in the `manual_property_grants` collection, fully
// independent of subscription_settings / subscription_orders / Stripe. The
// paid subscription state is NEVER changed from here.
//
// SEPARATION CONTRACT (mirrors the server-side hook + resolvePropertyAccess):
//   - While a Special Access grant has remaining slots, ONLY it is checked
//     when the owner adds a property. The owner never sees any payment /
//     subscription prompt while inside their granted limit.
//   - When the Special Access limit is exhausted, the owner falls through to
//     the normal paid subscription / trial check and is offered a paid
//     package exactly like any other customer. They never hit a
//     "contact admin" dead-end.

const ar = (lang) => lang === 'ar';

export default function SpecialAccessPanel() {
  const { lang } = useLanguage();
  const { user: currentUser } = useAuth();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState(null); // full user record
  const [selectedGrant, setSelectedGrant] = useState(null); // raw grant row or null
  const [loadingGrant, setLoadingGrant] = useState(false);

  // grant form
  const [grantType, setGrantType] = useState('limited');
  const [limitValue, setLimitValue] = useState('2');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // all grants list
  const [grants, setGrants] = useState([]);
  const [loadingGrants, setLoadingGrants] = useState(true);

  const isAr = ar(lang);

  // ---- search users by name / email ----
  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const filter = pb.filter(
        'name ~ {:q} || email ~ {:q}',
        { q },
      );
      const rows = await pb.collection('users').getFullList({
        filter,
        sort: '-created',
        requestKey: `special-access-search-${q}`,
      });
      // Exclude staff / super admin — Special Access is for owner accounts
      // (special cases). Staff already bypass limits.
      const filtered = rows.filter(
        (u) =>
          !u.is_super_admin &&
          !['admin', 'editor', 'support', 'custom'].includes(u.role),
      );
      setSearchResults(filtered);
    } catch (err) {
      notify.error(
        isAr ? 'فشل البحث' : 'Search failed',
        String(err?.message || err),
      );
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, isAr]);

  // debounce search
  useEffect(() => {
    const id = setTimeout(() => {
      runSearch();
    }, 350);
    return () => clearTimeout(id);
  }, [runSearch]);

  // ---- load all grants ----
  const loadGrants = useCallback(async () => {
    setLoadingGrants(true);
    try {
      const rows = await pb.collection('manual_property_grants').getFullList({
        sort: '-updated',
        expand: 'user,granted_by',
        requestKey: 'special-access-list',
      });
      setGrants(rows);
    } catch (err) {
      notify.error(
        isAr ? 'تعذّر تحميل بيانات الوصول الخاص' : 'Failed to load Special Access',
        String(err?.message || err),
      );
      setGrants([]);
    } finally {
      setLoadingGrants(false);
    }
  }, [isAr]);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  // realtime: refresh grants list on any change
  useEffect(() => {
    const refresh = () => loadGrants();
    void pb
      .collection('manual_property_grants')
      .subscribe('*', refresh)
      .catch(() => {});
    return () => {
      void pb.collection('manual_property_grants').unsubscribe('*').catch(() => {});
    };
  }, [loadGrants]);

  // ---- load grant for a selected user ----
  const loadGrantFor = useCallback(async (userId) => {
    setLoadingGrant(true);
    setSelectedGrant(null);
    try {
      const rows = await pb.collection('manual_property_grants').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId }),
        requestKey: `special-access-for-${userId}`,
      });
      if (rows && rows.length > 0) setSelectedGrant(rows[0]);
    } catch {
      setSelectedGrant(null);
    } finally {
      setLoadingGrant(false);
    }
  }, []);

  const pickUser = (u) => {
    setSelected(u);
    setQuery('');
    setSearchResults([]);
    loadGrantFor(u.id);
  };

  // sync form when selectedGrant changes
  useEffect(() => {
    if (selectedGrant) {
      setGrantType(
        String(selectedGrant.grant_type) === 'unlimited' ? 'unlimited' : 'limited',
      );
      setLimitValue(String(selectedGrant.property_limit ?? '2'));
      setNote(String(selectedGrant.note || ''));
    } else {
      setGrantType('limited');
      setLimitValue('2');
      setNote('');
    }
  }, [selectedGrant]);

  // ---- save (create or update) grant ----
  const saveGrant = async () => {
    if (!selected) return;
    const type = grantType === 'unlimited' ? 'unlimited' : 'limited';
    let limitNum = 0;
    if (type === 'limited') {
      limitNum = Math.max(0, Math.floor(Number(limitValue) || 0));
      if (limitNum <= 0) {
        notify.error(
          isAr ? 'رقم غير صالح' : 'Invalid number',
          isAr
            ? 'أدخل رقمًا صحيحًا أكبر من صفر لحد الوصول الخاص.'
            : 'Enter a valid whole number greater than zero for the Special Access limit.',
        );
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        user: selected.id,
        granted_by: currentUser?.id || '',
        grant_type: type,
        property_limit: type === 'limited' ? limitNum : 0,
        note: note.trim(),
        active: true,
      };
      if (selectedGrant) {
        await pb.collection('manual_property_grants').update(selectedGrant.id, payload, {
          requestKey: `special-access-update-${selectedGrant.id}-${Date.now()}`,
        });
        notify.success(
          isAr ? 'تم تحديث الوصول الخاص' : 'Special Access updated',
        );
      } else {
        await pb.collection('manual_property_grants').create(payload, {
          requestKey: `special-access-create-${selected.id}-${Date.now()}`,
        });
        notify.success(
          isAr ? 'تم منح الوصول الخاص' : 'Special Access granted',
        );
      }
      await loadGrantFor(selected.id);
      await loadGrants();
    } catch (err) {
      notify.error(
        isAr ? 'فشل حفظ الوصول الخاص' : 'Failed to save Special Access',
        String(err?.message || err),
      );
    } finally {
      setSaving(false);
    }
  };

  // ---- remove grant ----
  const removeGrant = async () => {
    if (!selectedGrant) return;
    if (
      !window.confirm(
        isAr
          ? 'هل تريد إزالة الوصول الخاص الممنوح لهذا المستخدم؟'
          : 'Remove the Special Access for this user?',
      )
    )
      return;
    setSaving(true);
    try {
      await pb.collection('manual_property_grants').delete(selectedGrant.id, {
        requestKey: `special-access-delete-${selectedGrant.id}-${Date.now()}`,
      });
      notify.success(isAr ? 'تمت إزالة الوصول الخاص' : 'Special Access removed');
      setSelectedGrant(null);
      await loadGrants();
    } catch (err) {
      notify.error(
        isAr ? 'فشل الإزالة' : 'Failed to remove',
        String(err?.message || err),
      );
    } finally {
      setSaving(false);
    }
  };

  const grantLabel = (g) => {
    if (!g) return isAr ? 'لا يوجد وصول خاص' : 'No Special Access';
    if (String(g.grant_type) === 'unlimited') return isAr ? 'مفتوح (غير محدود)' : 'Unlimited';
    return isAr ? `حد الوصول: ${g.property_limit} عقار` : `Limit: ${g.property_limit} properties`;
  };

  return (
    <div className="space-y-6">
      {/* Header / explainer */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound size={22} strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-xl font-bold">
              {isAr ? 'وصول خاص' : 'Special Access'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'نظام مستقل تمامًا عن الاشتراكات المدفوعة والفترة التجريبية وبوابات الدفع. امنح مالكًا محددًا حدًا من العقارات (1 أو 2 أو 3 أو أي رقم) يضيفه مجانًا دون أي طلب دفع.'
                : 'A standalone system, fully separate from paid subscriptions, trials, and payment gateways. Grant a specific owner a property count (1, 2, 3, or any number) they can add for free with no payment prompt.'}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? 'ملاحظة: هذا النظام لا يغيّر حالة اشتراك المالك المدفوع ولا يفعّل باقة. طالما المالك ضمن حد الوصول الخاص لا تظهر له أي رسالة دفع. عند تجاوز الحد فقط يُوجَّه للاشتراك في باقة مدفوعة عادية مثل أي عميل آخر.'
            : 'Note: this system never changes the owner\u2019s paid subscription state and never activates a package. While the owner is within their Special Access limit they see no payment prompt. Only when they exceed the limit are they directed to a normal paid subscription — just like any other customer.'}
        </p>
      </div>

      {/* Search */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <h3 className="font-bold">
          {isAr ? 'البحث عن مالك' : 'Search for an owner'}
        </h3>
        <div className="relative">
          <Search
            size={16}
            className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isAr ? 'ابحث بالاسم أو البريد الإلكتروني…' : 'Search by name or email…'}
            className="ps-9 min-h-[44px]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSearchResults([]);
              }}
              className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground"
              aria-label="clear"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {searching && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            {isAr ? 'جارٍ البحث…' : 'Searching…'}
          </p>
        )}

        {!searching && searchResults.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {searchResults.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pickUser(u)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-start transition-colors hover:bg-accent',
                  selected?.id === u.id && 'border-primary ring-1 ring-primary/30',
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  {(u.name || u.email || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{u.name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate" dir="ltr">
                    {u.email}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {!searching && query.trim().length >= 2 && searchResults.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isAr ? 'لا توجد نتائج مطابقة.' : 'No matching owners.'}
          </p>
        )}
      </div>

      {/* Selected user grant form */}
      {selected && (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                {(selected.name || selected.email || '?').slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p className="font-bold">{selected.name || '—'}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {selected.email}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              <X size={15} className="me-1" />
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </div>

          {loadingGrant ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {isAr ? 'جارٍ تحميل الوصول الحالي…' : 'Loading current access…'}
            </p>
          ) : (
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {isAr ? 'الوصول الحالي: ' : 'Current access: '}
              </span>
              <span className="font-semibold">
                {selectedGrant ? grantLabel(selectedGrant) : isAr ? 'لا يوجد' : 'None'}
              </span>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isAr ? 'نوع الوصول' : 'Access type'}</Label>
              <Select value={grantType} onValueChange={setGrantType}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="limited">
                    {isAr ? 'عدد عقارات محدد' : 'Specific property count'}
                  </SelectItem>
                  <SelectItem value="unlimited">
                    {isAr ? 'مفتوح (بدون حد أقصى)' : 'Unlimited (no max)'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {grantType === 'limited' && (
              <div className="space-y-2">
                <Label>{isAr ? 'عدد العقارات' : 'Number of properties'}</Label>
                <Input
                  type="number"
                  min="1"
                  value={limitValue}
                  onChange={(e) => setLimitValue(e.target.value)}
                  className="min-h-[44px]"
                  placeholder={isAr ? 'مثال: 2' : 'e.g. 2'}
                />
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? 'رقم حر تختاره أنت — غير مرتبط بأي باقة معروضة للعامة. عند بلوغ هذا الحد يُوجَّه المالك للاشتراك المدفوع العادي.'
                    : 'A free number you choose — not tied to any public package. When this limit is reached the owner is directed to a normal paid subscription.'}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{isAr ? 'ملاحظة (اختياري)' : 'Note (optional)'}</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={
                  isAr
                    ? 'السبب: حساب تجريبي، عميل مميز، هدية…'
                    : 'Reason: demo account, VIP client, gift…'
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={saveGrant} disabled={saving} className="min-h-[44px]">
                {saving && <Loader2 size={16} className="animate-spin me-2" />}
                {selectedGrant
                  ? isAr ? 'تحديث الوصول' : 'Update access'
                  : isAr ? 'منح الوصول الخاص' : 'Grant Special Access'}
              </Button>
              {selectedGrant && (
                <Button
                  variant="outline"
                  onClick={removeGrant}
                  disabled={saving}
                  className="min-h-[44px] text-destructive hover:text-destructive"
                >
                  <Trash2 size={15} className="me-1" />
                  {isAr ? 'إزالة الوصول' : 'Remove access'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All grants list */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold flex items-center gap-2">
            <Users size={18} />
            {isAr ? 'كل حالات الوصول الخاص' : 'All Special Access grants'}
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {grants.length}
          </span>
        </div>

        {loadingGrants ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            {isAr ? 'جارٍ التحميل…' : 'Loading…'}
          </p>
        ) : grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? 'لا توجد حالات وصول خاص بعد.' : 'No Special Access grants yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {grants.map((g) => {
              const u = g.expand?.user;
              const by = g.expand?.granted_by;
              return (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                    {(u?.name || u?.email || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm font-semibold truncate">
                      {u?.name || '—'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">
                      {u?.email || '—'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      String(g.grant_type) === 'unlimited'
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {String(g.grant_type) === 'unlimited' ? (
                      <>
                        <InfinityIcon size={12} />
                        {isAr ? 'غير محدود' : 'Unlimited'}
                      </>
                    ) : (
                      <>
                        {isAr ? `${g.property_limit} عقار` : `${g.property_limit} properties`}
                      </>
                    )}
                  </span>
                  {g.note && (
                    <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {g.note}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {by?.email ? (isAr ? 'بواسطة: ' : 'by: ') : ''}
                    <span dir="ltr">{by?.email || ''}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (u) pickUser(u);
                    }}
                    className="min-h-[36px]"
                  >
                    <Pencil size={13} className="me-1" />
                    {isAr ? 'تعديل' : 'Edit'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
