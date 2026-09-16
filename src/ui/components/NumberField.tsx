/**
 * Integer input that lets the user type freely and commits a clamped value
 * when the text is valid, on blur or on Enter.
 */
import { useEffect, useState } from 'react';
import { clamp } from '../labels';

export function NumberField({ id, value, min, max, onCommit, className = 'input narrow', ariaLabel }: {
  id?: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const commit = () => {
    const n = parseInt(text, 10);
    const next = Number.isFinite(n) ? clamp(n, min, max) : value;
    setText(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={text}
      aria-label={ariaLabel}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseInt(e.target.value, 10);
        if (Number.isFinite(n) && n >= min && n <= max && n !== value) onCommit(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
    />
  );
}

export default NumberField;
