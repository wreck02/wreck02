import { formatClock } from '../../core/analytics';
import { PACE_SECONDS } from '../../core/session';
import { useNow } from './useTicker';

function urgency(remainingSec: number, limitSec: number): string {
  if (remainingSec < limitSec * 0.05) return 'bad';
  if (remainingSec < limitSec * 0.2) return 'warn';
  return '';
}

/** Whole-session clock: counts down when a limit is set, otherwise up. */
export function SessionTimer({ startedAt, limitSec }: { startedAt: number; limitSec?: number }) {
  const now = useNow(250);
  const elapsed = (now - startedAt) / 1000;
  if (limitSec) {
    const remaining = Math.max(0, limitSec - elapsed);
    return (
      <span className={`timer ${urgency(remaining, limitSec)}`} title="Time left in the session">
        <span className="lbl">left</span>{formatClock(remaining)}
      </span>
    );
  }
  return (
    <span className="timer" title="Session time">
      <span className="lbl">total</span>{formatClock(elapsed)}
    </span>
  );
}

/**
 * Per-question clock. `baseMs` is time already banked on this question and
 * `since` the epoch ms it became active again (null while frozen).
 */
export function QuestionTimer({ baseMs, since, limitSec }: { baseMs: number; since: number | null; limitSec?: number }) {
  const now = useNow(250, since !== null);
  const elapsedSec = (baseMs + (since !== null ? Math.max(0, now - since) : 0)) / 1000;
  if (limitSec) {
    const remaining = Math.max(0, limitSec - elapsedSec);
    return (
      <span className={`timer ${urgency(remaining, limitSec)}`} title="Time left on this question">
        <span className="lbl">question</span>{formatClock(remaining)}
      </span>
    );
  }
  return (
    <span className={`timer ${elapsedSec > PACE_SECONDS ? 'warn' : ''}`} title="Time on this question">
      <span className="lbl">question</span>{formatClock(elapsedSec)}
    </span>
  );
}
