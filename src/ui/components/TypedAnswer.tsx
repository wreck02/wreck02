import { useEffect, useRef, useState } from 'react';
import { parseAnswer } from '../../core/answers';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Enter or the button. Called with the current text (may be empty). */
  onSubmit: () => void;
  disabled?: boolean;
  submitLabel?: string;
  autoFocus?: boolean;
}

export const TYPED_HINT = '3/4, 0.75, 2√5 or 2sqrt5, pi/6, 3e8, x = 2 or x = 3 — press Enter';

/** Monospace free-text answer box with a debounced "understood as" echo. */
export function TypedAnswer({ value, onChange, onSubmit, disabled = false, submitLabel = 'Submit', autoFocus = true }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [echo, setEcho] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (autoFocus && !disabled) ref.current?.focus();
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (value.trim() === '') { setEcho(null); return; }
    const id = setTimeout(() => {
      try {
        setEcho({ ok: true, text: parseAnswer(value).echo });
      } catch (e) {
        setEcho({ ok: false, text: (e as Error).message });
      }
    }, 150);
    return () => clearTimeout(id);
  }, [value]);

  return (
    <div className="typed-wrap">
      <div className="typed">
        <input
          ref={ref}
          className="input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="Your answer"
          placeholder="your answer"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
            else if (e.key === 'Escape') { e.preventDefault(); onChange(''); }
          }}
        />
        <button type="button" className="btn primary" disabled={disabled} onClick={onSubmit}>{submitLabel}</button>
      </div>
      <div className="typed-hint">{TYPED_HINT.replace('—', '·')}</div>
      <div className={`typed-echo ${echo && !echo.ok ? 'err' : 'muted'}`} aria-live="polite">
        {echo ? (echo.ok ? `understood as ${echo.text}` : `not understood: ${echo.text}`) : ''}
      </div>
    </div>
  );
}
