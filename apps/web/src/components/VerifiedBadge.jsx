import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

// Green verified badge shown next to an approved owner's name.
// `size` controls the icon size; `showLabel` renders the text label beside it.
export default function VerifiedBadge({ size = 16, showLabel = false, className }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn('inline-flex items-center gap-1 align-middle', className)}
      title={t('verified_account') || 'Verified Account'}
    >
      <BadgeCheck
        size={size}
        strokeWidth={2.2}
        className="text-emerald-500 shrink-0"
        aria-label={t('verified_account') || 'Verified Account'}
      />
      {showLabel && (
        <span className="text-xs font-semibold text-emerald-600">
          {t('verified_account') || 'Verified Account'}
        </span>
      )}
    </span>
  );
}
