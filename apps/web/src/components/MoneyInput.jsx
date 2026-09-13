import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { formatMoneyTyping, parseMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Money amount input with live thousands separators (1,000).
 * Emits unformatted numeric strings via onChange (same shape as native input)
 * so existing form handlers keep working. DB still stores plain numbers.
 */
const MoneyInput = React.forwardRef(function MoneyInput(
  {
    value,
    onChange,
    className,
    disabled,
    required,
    name,
    id,
    placeholder,
    min,
    onBlur,
    onFocus,
    ...rest
  },
  ref,
) {
  const display = useMemo(() => formatMoneyTyping(value ?? ''), [value]);

  const handleChange = (e) => {
    const nextRaw = parseMoney(e.target.value);
    // Enforce min >= 0 when requested
    if (min != null && nextRaw !== '' && nextRaw !== '-') {
      const n = Number(nextRaw);
      if (Number.isFinite(n) && n < Number(min)) return;
    }
    if (!onChange) return;
    const synthetic = {
      ...e,
      target: {
        ...e.target,
        value: nextRaw,
        name: name || e.target.name,
      },
      currentTarget: {
        ...e.currentTarget,
        value: nextRaw,
        name: name || e.currentTarget?.name,
      },
    };
    onChange(synthetic);
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      name={name}
      id={id}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cn('tabular-nums', className)}
      {...rest}
    />
  );
});

MoneyInput.displayName = 'MoneyInput';

export default MoneyInput;
export { MoneyInput };
