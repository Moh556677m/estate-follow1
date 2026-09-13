import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MultiChipSelect from '@/components/MultiChipSelect';
import { useLanguage } from '@/contexts/LanguageContext';
import { COMMON_LANGUAGES, langLabel } from '@/lib/brokerageConstants';

/**
 * Language chips + "Add Language" for custom entries not in the preset list.
 * Value is an array of language ids (preset) or free-text labels (custom).
 */
export default function LanguageMultiSelect({ value = [], onChange, required = false }) {
  const { t, lang } = useLanguage();
  const [draft, setDraft] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const selected = Array.isArray(value) ? value : [];

  const baseOpts = COMMON_LANGUAGES.map((s) => ({
    id: s.id,
    label: lang === 'ar' ? s.ar : s.en,
  }));

  // Include custom selections that are not in COMMON_LANGUAGES so chips stay visible.
  const customIds = selected.filter((id) => !COMMON_LANGUAGES.some((l) => l.id === id));
  const options = [
    ...baseOpts,
    ...customIds.map((id) => ({ id, label: langLabel(id, lang) || id })),
  ];

  const addCustom = () => {
    const name = String(draft || '').trim();
    if (!name) return;
    const id = name;
    if (!selected.includes(id)) onChange([...selected, id]);
    setDraft('');
    setShowAdd(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          {t('broker_languages')}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[36px]"
          onClick={() => setShowAdd((s) => !s)}
        >
          <Plus size={14} className="me-1" />
          {t('broker_add_language')}
        </Button>
      </div>
      <MultiChipSelect options={options} value={selected} onChange={onChange} />
      {showAdd && (
        <div className="flex gap-2 pt-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('broker_language_placeholder')}
            className="min-h-[44px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button type="button" className="min-h-[44px]" onClick={addCustom}>
            {t('broker_add_language')}
          </Button>
        </div>
      )}
    </div>
  );
}
