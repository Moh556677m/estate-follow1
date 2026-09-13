import React, { useCallback, useImperativeHandle, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * StableInput — regression-proof text input for Estate Follow.
 *
 * WHY THIS EXISTS
 * ---------------
 * The "soft keyboard dismisses after every character" bug on iOS Safari /
 * Android Chrome is caused by an <input> being unmounted/remounted mid-typing
 * (dynamic `key`, `type` swap, or conditional remount in a parent). Once the
 * DOM node is recreated, no JS can keep the mobile keyboard open.
 *
 * CONTRACT (focus / keyboard stability)
 * -------------------------------------
 * 1. The underlying <input> DOM node is NEVER recreated between renders.
 *    No dynamic `key`, no `type` swaps, no conditional remount.
 * 2. An optional `format(raw) -> displayString` formatter may reformat the
 *    shown value (e.g. 300000 -> "300,000") WITHOUT remounting and WITHOUT
 *    jumping the caret: the caret offset from the end is preserved across
 *    formatting, inside the same paint (requestAnimationFrame) so the mobile
 *    keyboard never dismisses.
 * 3. `onChange` receives the RAW (unformatted) string value, so form state
 *    stays clean and numeric.
 * 4. The onChange callback identity is stable (useCallback), so React never
 *    does extra reconciliation work on each keystroke.
 *
 * USE THIS in NEW forms to guarantee the keyboard stays open while typing.
 * Existing forms already use stable controlled <Input> / <MoneyInput>; this
 * component is the canonical primitive going forward.
 */
const StableInput = React.forwardRef(function StableInput(
  {
    value,
    onChange,
    format,
    className,
    name,
    id,
    type = 'text',
    disabled,
    required,
    placeholder,
    min,
    max,
    step,
    inputMode,
    autoComplete,
    dir,
    onBlur,
    onFocus,
    ...rest
  },
  ref,
) {
  const innerRef = useRef(null);
  useImperativeHandle(ref, () => innerRef.current, []);

  const raw = value == null ? '' : String(value);
  const display = format ? format(raw) : raw;

  const handleChange = useCallback(
    (e) => {
      const el = e.target;
      // Caret offset from the END, captured before React updates the DOM.
      const end = el.value.length - (el.selectionEnd ?? el.value.length);
      const nextRaw = format ? format(e.target.value) : e.target.value;
      if (onChange) onChange(nextRaw);
      // Restore the caret after React commits the new display value, within
      // the same paint so the mobile keyboard never dismisses.
      requestAnimationFrame(() => {
        const node = innerRef.current;
        if (!node) return;
        const len = node.value.length;
        const pos = Math.max(0, Math.min(len, len - end));
        try { node.setSelectionRange(pos, pos); } catch { /* not all input types support it */ }
      });
    },
    [format, onChange],
  );

  return (
    <Input
      ref={innerRef}
      type={type}
      name={name}
      id={id}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={onFocus}
      min={min}
      max={max}
      step={step}
      inputMode={inputMode}
      autoComplete={autoComplete}
      dir={dir}
      className={cn(className)}
      {...rest}
    />
  );
});

StableInput.displayName = 'StableInput';

export default StableInput;
export { StableInput };
