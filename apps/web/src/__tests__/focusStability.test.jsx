import { describe, it, expect, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import StableInput from '@/components/StableInput';

// Regression test for the "soft keyboard dismisses after every character" bug.
// The root cause is an <input> being unmounted/remounted mid-typing. StableInput
// guarantees the same DOM node survives every render, so focus + value persist.
function Harness({ format }) {
  const [v, setV] = useState('');
  return (
    <StableInput
      value={v}
      onChange={setV}
      format={format}
      data-testid="ti"
      inputMode="decimal"
    />
  );
}

describe('StableInput focus stability', () => {
  afterEach(() => cleanup());

  it('retains focus and the complete value across 10 consecutive keystrokes', () => {
    const { getByTestId } = render(<Harness />);
    const input = getByTestId('ti');
    input.focus();
    expect(document.activeElement).toBe(input);

    const chars = '1234567890';
    for (const c of chars) {
      fireEvent.change(input, { target: { value: input.value + c } });
    }

    // Same DOM node still holds focus — on mobile this is what keeps the
    // soft keyboard open instead of dismissing after each character.
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe(chars);
  });

  it('keeps focus while a formatter reformats the value (300000 -> 300,000)', () => {
    const fmt = (raw) => raw.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const { getByTestId } = render(<Harness format={fmt} />);
    const input = getByTestId('ti');
    input.focus();
    expect(document.activeElement).toBe(input);

    const digits = '300000';
    for (const c of digits) {
      fireEvent.change(input, { target: { value: input.value + c } });
    }

    expect(document.activeElement).toBe(input);
    // Display is reformatted while the raw value stays clean.
    expect(input.value).toBe('300,000');
  });
});
