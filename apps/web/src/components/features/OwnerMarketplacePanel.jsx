import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Store, Phone, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  getMarketplaceListings,
  createMarketplaceListing,
  updateMarketplaceListing,
  deleteMarketplaceListing,
} from '@/lib/ownerFeaturesClient';
import { notify } from '@/lib/notify';
import { formatMoney, formatDate } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

const TYPE_LABEL = { for_sale: { en: 'For sale', ar: 'للبيع' }, for_rent: { en: 'For rent', ar: 'للإيجار' } };
const STATUS_LABEL = {
  active: { en: 'Active', ar: 'نشط' },
  paused: { en: 'Paused', ar: 'متوقف مؤقتًا' },
  sold: { en: 'Sold', ar: 'تم البيع' },
  rented: { en: 'Rented', ar: 'تم التأجير' },
  removed: { en: 'Removed', ar: 'محذوف' },
};

// Feature Management batch — Owner Marketplace (feature #12). Peer-to-peer:
// an owner lists one of THEIR OWN properties for other owners to browse.
// ZERO duplication of property data — a listing only carries the
// listing-specific fields (price, type, contact), the property's own
// building/unit/country/usage type are joined server-side (see
// task-marketplace.pb.js). Not a broker directory — that concept was
// deliberately removed from this product's owner-facing surface earlier.
export default function OwnerMarketplacePanel({ properties = [] } = {}) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [data, setData] = useState({ listings: [], mine: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('browse');

  const [propertyId, setPropertyId] = useState('');
  const [listingType, setListingType] = useState('for_sale');
  const [askingPrice, setAskingPrice] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [contactName, setContactName] = useState(user?.name || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [notesText, setNotesText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMarketplaceListings());
    } catch {
      /* keep last-known list on transient failure */
    } finally {
      setLoading(false);
    }
  }, []);

  const available = isAvailable('owner_marketplace');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  useRealtimeRefresh(load, ['marketplace_listings'], { enabled: available });

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'سوق الملاك' : 'Owner Marketplace'}
        reason={features.owner_marketplace?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const addListing = async (e) => {
    e.preventDefault();
    if (!propertyId || !askingPrice || saving) return;
    setSaving(true);
    try {
      await createMarketplaceListing({
        owner: user.id,
        property: propertyId,
        listing_type: listingType,
        asking_price: Number(askingPrice) || 0,
        currency: currency.trim() || 'AED',
        notes: notesText.trim(),
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        status: 'active',
      });
      setPropertyId('');
      setAskingPrice('');
      setNotesText('');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر نشر الإعلان' : 'Could not publish listing', String(err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (listing, status) => {
    setData((d) => ({ ...d, mine: d.mine.map((l) => (l.id === listing.id ? { ...l, status } : l)) }));
    try {
      await updateMarketplaceListing(listing.id, { status });
    } catch {
      load();
    }
  };

  const remove = async (listing) => {
    setData((d) => ({ ...d, mine: d.mine.filter((l) => l.id !== listing.id) }));
    try {
      await deleteMarketplaceListing(listing.id);
    } catch {
      load();
    }
  };

  const listedPropertyIds = new Set(data.mine.filter((l) => l.status === 'active' || l.status === 'paused').map((l) => l.property?.id));
  const listableProperties = properties.filter((p) => !listedPropertyIds.has(p.id));

  function ListingCard({ l, mine }) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Building2 size={13} className="text-muted-foreground" />
              {l.property ? `${l.property.building}${l.property.unit_number ? ` · ${l.property.unit_number}` : ''}` : (isAr ? 'عقار' : 'Property')}
              <span className={`ms-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${l.listing_type === 'for_sale' ? 'bg-blue-500/10 text-blue-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                {isAr ? TYPE_LABEL[l.listing_type]?.ar : TYPE_LABEL[l.listing_type]?.en}
              </span>
            </p>
            {l.property?.country && <p className="text-xs text-muted-foreground">{l.property.country}</p>}
            {l.notes && <p className="text-xs text-muted-foreground mt-0.5">{l.notes}</p>}
            {!mine && (l.contact_name || l.contact_phone) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone size={11} />{l.contact_name}{l.contact_name && l.contact_phone ? ' · ' : ''}<span dir="ltr">{l.contact_phone}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(l.created, lang)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold tabular-nums" dir="ltr">{formatMoney(l.asking_price, lang)}{l.currency ? ` ${l.currency}` : ''}</p>
          </div>
          {mine && (
            <button type="button" onClick={() => remove(l)} className="shrink-0 text-muted-foreground hover:text-red-600">
              <Trash2 size={16} />
            </button>
          )}
        </div>
        {mine && (
          <select
            value={l.status}
            onChange={(e) => setStatus(l, e.target.value)}
            className="min-h-[32px] rounded-lg border bg-background px-2 py-1 text-xs"
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{isAr ? v.ar : v.en}</option>)}
          </select>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Store size={20} />{isAr ? 'سوق الملاك' : 'Owner Marketplace'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'اعرض عقارك للبيع أو الإيجار لملاك آخرين على المنصة، أو تصفح إعلاناتهم.' : 'List your own property for sale or rent to other owners on the platform, or browse their listings.'}
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('browse')} className={`rounded-full border px-3 py-1.5 text-xs font-medium min-h-[32px] ${tab === 'browse' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card'}`}>
          {isAr ? 'تصفح الإعلانات' : 'Browse listings'}
        </button>
        <button type="button" onClick={() => setTab('mine')} className={`rounded-full border px-3 py-1.5 text-xs font-medium min-h-[32px] ${tab === 'mine' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card'}`}>
          {isAr ? 'إعلاناتي' : 'My listings'}
        </button>
      </div>

      {tab === 'mine' && (
        <form onSubmit={addListing} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">{isAr ? 'اختر عقارًا' : 'Choose a property'}</option>
            {listableProperties.map((p) => <option key={p.id} value={p.id}>{p.building} / {p.unit_number}</option>)}
          </select>
          <select value={listingType} onChange={(e) => setListingType(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{isAr ? v.ar : v.en}</option>)}
          </select>
          <input
            type="number"
            min="0"
            value={askingPrice}
            onChange={(e) => setAskingPrice(e.target.value)}
            placeholder={isAr ? 'السعر المطلوب' : 'Asking price'}
            className="min-h-[40px] w-32 rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder={isAr ? 'العملة' : 'Currency'}
            className="min-h-[40px] w-20 rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder={isAr ? 'اسم للتواصل' : 'Contact name'}
            className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder={isAr ? 'رقم الهاتف' : 'Phone'}
            className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder={isAr ? 'ملاحظات...' : 'Notes...'}
            className="min-h-[40px] flex-1 min-w-[160px] rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={saving || !propertyId || !askingPrice} className="min-h-[40px] gap-1">
            <Plus size={15} />{isAr ? 'نشر' : 'Publish'}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>
      ) : tab === 'browse' ? (
        data.listings.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">{isAr ? 'لا توجد إعلانات حاليًا.' : 'No listings yet.'}</div>
        ) : (
          <div className="space-y-2">{data.listings.map((l) => <ListingCard key={l.id} l={l} mine={l.isMine} />)}</div>
        )
      ) : data.mine.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">{isAr ? 'لم تنشر أي إعلان بعد.' : 'You have not published any listing yet.'}</div>
      ) : (
        <div className="space-y-2">{data.mine.map((l) => <ListingCard key={l.id} l={l} mine />)}</div>
      )}
    </div>
  );
}
