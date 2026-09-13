import React from 'react';
import { cn } from '@/lib/utils';

/** Toggle chips for multi-select options: [{id, label}] */
const MultiChipSelect = ({ options, value = [], onChange, className }) => {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((opt) => {
        const on = selected.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold min-h-[36px] transition-colors',
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default MultiChipSelect;
