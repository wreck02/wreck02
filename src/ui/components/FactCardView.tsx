/**
 * One flashcard in the Facts drill: the prompt, then either the typed box or the
 * reveal/grade buttons, then the verdict and answer. Keys typed into the box are
 * handled here; everything else comes from the screen's global key handler.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { FactCard } from '../../core/facts';
import { FACT_TARGET_MS } from '../../core/facts-progress';
import { MathText } from './MathText';

export type DrillMode = 'typed' | 'flip';
/** answer: waiting for the recall; revealed: flip mode, answer shown, grade it; feedback: verdict shown, Enter to move on */
export type CardPhase = 'answer' | 'revealed' | 'feedback';

export interface CardVerdict {
  correct: boolean;
  skipped: boolean;
  given: string;
  timeMs: number;
  echo?: string;
  error?: string;
}

export const TYPED_FACT_HINT = 'fractions, decimals, surds (2√5, sqrt3/2), pi/6, 3e8, yes or no';

export function formatMs(ms: number): string {
  return Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '–';
}

interface Props {
  card: FactCard;
  mode: DrillMode;
  phase: CardPhase;
  typed: string;
  verdict: CardVerdict | null;
  /** advancing ends the run */
  isLast: boolean;
  onType: (v: string) => void;
  onSubmit: () => void;
  onReveal: () => void;
  onGrade: (correct: boolean) => void;
  onSkip: () => void;
  onAdvance: () => void;
  onQuit: () => void;
}

export function FactCardView({ card, mode, phase, typed, verdict, isLast, onType, onSubmit, onReveal, onGrade, onSkip, onAdvance, onQuit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the keyboard in the box across cards (it stays focused, read-only, while the verdict shows).
  useEffect(() => {
    if (mode === 'typed') inputRef.current?.focus();
  }, [card.id, phase, mode]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.key;
    if (phase === 'answer') {
      if (k === 'Enter') { e.preventDefault(); onSubmit(); }
      else if (k === 'Escape') { e.preventDefault(); if (typed) onType(''); else onQuit(); }
    } else if (phase === 'feedback') {
      if (k === 'Enter' || k === ' ' || k === 'n' || k === 'N') { e.preventDefault(); onAdvance(); }
      else if (k === 'Escape') { e.preventDefault(); onQuit(); }
    }
  };

  const showVerdict = phase === 'feedback' && verdict !== null;
  const over = verdict ? verdict.timeMs > FACT_TARGET_MS : false;

  return (
    <div className="card fact-card" aria-live="polite">
      <MathText className="fact-prompt" text={card.prompt} />

      {mode === 'typed' && (
        <div className="fact-input">
          <input
            ref={inputRef}
            className={`input ${showVerdict ? (verdict!.correct ? 'ok' : 'bad') : ''}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-label="Your answer"
            placeholder="your answer"
            value={typed}
            readOnly={phase !== 'answer'}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKey}
          />
          {phase === 'answer' && (
            <button type="button" className="btn primary" disabled={!typed.trim()} onClick={onSubmit}>Check</button>
          )}
        </div>
      )}
      {mode === 'typed' && phase === 'answer' && <div className="fact-hint">{TYPED_FACT_HINT} · <kbd>Enter</kbd> checks</div>}

      {phase === 'answer' && (
        <div className="fact-actions" key="answer-actions">
          {mode === 'flip' && (
            <button type="button" className="btn primary grade" onClick={(e) => { e.currentTarget.blur(); onReveal(); }}>
              Reveal <kbd>Space</kbd>
            </button>
          )}
          <button type="button" className={`btn ${mode === 'flip' ? '' : 'ghost'}`} onClick={(e) => { e.currentTarget.blur(); onSkip(); }} title="Counts as missed">
            Skip{mode === 'flip' && <kbd>S</kbd>}
          </button>
        </div>
      )}

      {phase === 'revealed' && (
        <>
          <div className="fact-answer"><MathText inline text={card.display} /></div>
          <div className="fact-actions" key="grade-actions">
            <button type="button" className="btn grade missed" onClick={(e) => { e.currentTarget.blur(); onGrade(false); }}>
              <kbd>1</kbd> Missed
            </button>
            <button type="button" className="btn grade primary" onClick={(e) => { e.currentTarget.blur(); onGrade(true); }}>
              <kbd>2</kbd> Got it
            </button>
          </div>
          <div className="fact-hint">Be honest: a card only counts as known when you had it before looking.</div>
        </>
      )}

      {showVerdict && verdict && (
        <>
          <div className={`fact-verdict ${verdict.correct ? 'ok' : 'bad'}`} role="status">
            <span className="mark">{verdict.correct ? '✓' : '✗'}</span>
            <span>{verdict.correct ? 'Correct' : verdict.skipped ? 'Skipped' : 'Wrong'}</span>
            <span className={`pill ${over ? 'warn' : 'ok'}`}>{formatMs(verdict.timeMs)}{over ? ' · over target' : ''}</span>
          </div>
          <div className="fact-answer">
            <span className="lbl">Answer</span>
            <MathText inline text={card.display} />
          </div>
          {verdict.given && !verdict.correct && (verdict.echo || verdict.error) && (
            <div className="fact-echo">
              {verdict.echo && verdict.echo !== verdict.given ? `understood as ${verdict.echo}` : ''}
              {verdict.error ? `${verdict.echo ? ' · ' : ''}${verdict.error}` : ''}
            </div>
          )}
          <div className="fact-actions" key="next-actions">
            <button type="button" className="btn primary" onClick={(e) => { e.currentTarget.blur(); onAdvance(); }}>
              {isLast ? 'Finish' : 'Next'} <kbd>Enter</kbd>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default FactCardView;
