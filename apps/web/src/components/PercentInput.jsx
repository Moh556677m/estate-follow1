import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Unified percentage input used across every percent field in the app.
 *
 * Numbers are always entered left-to-right (dir="ltr") — even inside an
 * Arabic (RTL) interface — while the "%" sign is pinned to the physical
 * RIGHT edge of the field, i.e. the opposite side from where digits start.
 * This keeps the sign clearly separated from the typed number and avoids
 * the overlap that happens when logical `end-0` resolves to the left in an
 * RTL page (the digit-entry side).
 *
 * Physical `right-0` + `pr-9` are used on purpose so the sign stays on the
 * right in both LTR and RTL page directions — the input content direction
 * is fixed LTR regardless.
 *
 * Emits the raw numeric string via onChange (same shape as a native input),
 * so existing form handlers keep working unchanged.
 */
const PercentInput = React.forwardRef(function PercentInput(
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
    max,
    step,
    onBlur,
    onFocus,
    suffixClassName,
    ...rest
  },
  ref,
) {
  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        name={name}
        id={id}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        min={min}
        max={max}
        step={step}
        className={cn('pr-9 tabular-nums', className)}
        {...rest}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-sm font-semibold text-muted-foreground select-none',
          suffixClassName,
        )}
      >
        %
      </span>
    </div>
  );
});

PercentInput.displayName = 'PercentInput';

export default PercentInput;
export { PercentInput };
