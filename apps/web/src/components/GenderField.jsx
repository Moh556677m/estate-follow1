import React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';

// Gender dropdown (Male / Female) styled to match the other form fields.
// Stores "male" or "female" and emits it via onChange.
const GenderField = ({
  value,
  onChange,
  label,
  required,
  heightClass = 'min-h-[48px]',
  id,
}) => {
  const { t, lang } = useLanguage();

  const options = [
    { value: 'male', label: lang === 'ar' ? 'ذكر' : 'Male' },
    { value: 'female', label: lang === 'ar' ? 'أنثى' : 'Female' },
  ];

  const selected = options.find((o) => o.value === value);

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <Select
        value={value || ''}
        onValueChange={(v) => onChange(v === '__none__' ? '' : v)}
      >
        <SelectTrigger id={id} className={heightClass}>
          <SelectValue placeholder={t('gender_select')}>
            {selected ? <span className="truncate">{selected.label}</span> : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default GenderField;
